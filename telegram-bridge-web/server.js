// server.js — Bridge Telegram berbasis Playwright (Telegram Web K).
// Menjalankan Chromium headless dengan profil ter-persist, membuka chat bot,
// dan meng-klik tombol reply-keyboard persis seperti user manusia.
//
// Endpoint HTTP:
//   GET  /health          -> status bridge & versi
//   POST /run             -> jalankan feature (butuh X-Bridge-Signature)
//   GET  /debug/screenshot -> ambil screenshot state chat (butuh X-Bridge-Secret)
//
// Body /run: { requestId, feature, query }
// Signature: HMAC-SHA256(body, BRIDGE_SECRET) header X-Bridge-Signature.
// Hasil dikirim async ke CALLBACK_URL dengan header X-Bridge-Signature juga.

require("dotenv").config();
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const express = require("express");
const { chromium } = require("playwright");
const featuresMap = require("./features.json");

const BRIDGE_VERSION = "2026-07-06-web-playwright-v1";

const {
  PORT = "8788",
  BRIDGE_SECRET,
  TG_BOT_USERNAME = "enigmatoolsbot",
  CALLBACK_URL,
  CHROME_PROFILE_DIR = "./chrome-profile",
  REPLY_TIMEOUT_MS = "90000",
  BUTTON_DELAY_MS = "1500",
  MENU_WAIT_MS = "8000",
  QUIET_MS = "6000",
  HEADLESS = "1",
} = process.env;

function fail(msg) { console.error("[bridge-web] " + msg); process.exit(1); }
if (!BRIDGE_SECRET || BRIDGE_SECRET.length < 32) fail("BRIDGE_SECRET wajib >= 32 karakter");

const bot = TG_BOT_USERNAME.replace(/^@/, "");
const profileDir = path.resolve(CHROME_PROFILE_DIR);
const replyTimeout = Number(REPLY_TIMEOUT_MS);
const buttonDelay = Number(BUTTON_DELAY_MS);
const menuWait = Number(MENU_WAIT_MS);
const quietMs = Number(QUIET_MS);
const headless = HEADLESS !== "0";

if (!fs.existsSync(profileDir)) {
  console.warn(`[bridge-web] profile dir ${profileDir} belum ada. Jalankan "npm run login" dulu.`);
}
const debugDir = path.resolve("./debug");
fs.mkdirSync(debugDir, { recursive: true });

function sign(payload) { return crypto.createHmac("sha256", BRIDGE_SECRET).update(payload).digest("hex"); }
function safeEqual(a, b) {
  const A = Buffer.from(String(a)); const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============ Browser lifecycle ============
let context = null;
let page = null;
let ready = false;

async function bootBrowser() {
  console.log("[bridge-web] launch Chromium headless=", headless, " profile=", profileDir);
  context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1200, height: 900 },
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  page = context.pages()[0] || (await context.newPage());
  page.on("crash", () => { console.error("[bridge-web] page crashed"); ready = false; });
  await page.goto(`https://web.telegram.org/k/#@${bot}`, { waitUntil: "domcontentloaded" });
  // Deteksi login screen (QR / phone input). Kalau ada -> minta user login dulu.
  await sleep(4000);
  const url = page.url();
  const hasQR = await page.locator('canvas, .auth-form, [class*="qr"]').first().isVisible().catch(() => false);
  if (hasQR && !/#@/.test(url)) {
    await page.screenshot({ path: path.join(debugDir, "needs-login.png") }).catch(() => {});
    console.error("[bridge-web] Belum login! Jalankan `npm run login` dulu atau copy folder chrome-profile dari laptop.");
  } else {
    console.log("[bridge-web] chat bot terbuka:", url);
    ready = true;
  }
}

// ============ Chat helpers ============
async function typeAndSend(text) {
  const composer = page.locator('.input-message-input[contenteditable="true"]').first();
  await composer.click({ timeout: 5000 });
  await composer.fill("");
  await composer.type(text, { delay: 20 });
  await page.keyboard.press("Enter");
}

async function clickReplyKeyboardButton(label, timeoutMs = menuWait) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Reply keyboard di TG Web K: .reply-keyboard button dengan teks label
    const btn = page.locator('.reply-keyboard button, .reply-markup-buttons button, .reply-wrapper button')
      .filter({ hasText: label }).first();
    if (await btn.count().catch(() => 0)) {
      try {
        await btn.click({ timeout: 3000 });
        console.log(`[bridge-web] clicked button "${label}"`);
        return true;
      } catch (e) {
        console.warn(`[bridge-web] click "${label}" gagal:`, e.message);
      }
    }
    // Fallback: inline keyboard di dalam bubble pesan
    const inline = page.locator('.reply-markup .reply-markup-button, .inline-buttons button')
      .filter({ hasText: label }).first();
    if (await inline.count().catch(() => 0)) {
      try {
        await inline.click({ timeout: 3000 });
        console.log(`[bridge-web] clicked inline "${label}"`);
        return true;
      } catch (_) {}
    }
    await sleep(400);
  }
  return false;
}

async function readIncomingMessages() {
  // Ambil semua bubble "in" (dari bot). Kembalikan array {id, text}.
  return await page.$$eval('.bubbles .bubble.is-in, .bubbles-inner .bubble.is-in', (nodes) => {
    return nodes.map((n) => ({
      id: n.getAttribute('data-mid') || n.getAttribute('data-message-id') || '',
      text: (n.querySelector('.message, .translatable-message')?.innerText || n.innerText || '').trim(),
    })).filter((m) => m.text);
  }).catch(() => []);
}

async function waitForNewIncoming(baselineIds, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const msgs = await readIncomingMessages();
    const fresh = msgs.filter((m) => !baselineIds.has(m.id));
    if (fresh.length) return fresh;
    await sleep(500);
  }
  return [];
}

async function collectReplyUntilQuiet(baselineIds) {
  // Kumpulkan pesan baru sampai bot diam `quietMs` atau `replyTimeout` habis.
  const collected = [];
  const seen = new Set(baselineIds);
  const hardDeadline = Date.now() + replyTimeout;
  let quietDeadline = Date.now() + quietMs;
  while (Date.now() < hardDeadline && Date.now() < quietDeadline) {
    const msgs = await readIncomingMessages();
    let gotNew = false;
    for (const m of msgs) {
      if (!seen.has(m.id) && m.text && !isMenuOrWelcomeText(m.text)) {
        seen.add(m.id);
        collected.push(m);
        gotNew = true;
      } else if (!seen.has(m.id)) {
        seen.add(m.id);
      }
    }
    if (gotNew) quietDeadline = Date.now() + quietMs;
    await sleep(400);
  }
  return collected;
}

function isMenuOrWelcomeText(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return true;
  return t.includes("selamat datang di enigma osint bot") ||
    t.includes("pilih layanan yang anda butuhkan") ||
    t === "🏠 menu utama" || t === "menu utama" ||
    t === "❓ bantuan" || t === "bantuan";
}

// ============ Feature runner ============
let chain = Promise.resolve();
function enqueue(task) { const run = chain.then(task, task); chain = run.catch(() => {}); return run; }

async function runFeature({ requestId, feature, query }) {
  if (!ready) return { ok: false, error: "browser belum siap / belum login. Jalankan `npm run login`." };
  const label = featuresMap[feature];
  if (!label) return { ok: false, error: `feature "${feature}" tidak ada di features.json` };

  try {
    // Baseline pesan sebelum interaksi
    const before = await readIncomingMessages();
    const baseline = new Set(before.map((m) => m.id));

    // 1. /start
    await typeAndSend("/start");
    await sleep(buttonDelay);

    // 2. Klik "Menu Utama"
    await clickReplyKeyboardButton("🏠 Menu Utama", menuWait);
    await sleep(buttonDelay);

    // 3. Klik tombol fitur
    const clicked = await clickReplyKeyboardButton(label, menuWait);
    if (!clicked) {
      await page.screenshot({ path: path.join(debugDir, `${requestId}-no-button.png`) }).catch(() => {});
      return { ok: false, error: `tombol "${label}" tidak ditemukan di reply-keyboard bot` };
    }

    // 4. Tunggu prompt dari bot (pesan baru yang bukan menu)
    const prompt = await waitForNewIncoming(baseline, Math.max(menuWait, buttonDelay * 3));
    const promptText = prompt.map((m) => m.text).find((t) => !isMenuOrWelcomeText(t));
    if (!promptText) {
      await page.screenshot({ path: path.join(debugDir, `${requestId}-no-prompt.png`) }).catch(() => {});
      return { ok: false, error: `bot tidak memunculkan prompt setelah klik "${label}"` };
    }
    console.log(`[bridge-web] prompt: ${promptText.slice(0, 100).replace(/\n/g, " ")}`);

    // 5. Kirim query & collect balasan
    const afterPromptBaseline = new Set((await readIncomingMessages()).map((m) => m.id));
    await typeAndSend(String(query || ""));
    const result = await collectReplyUntilQuiet(afterPromptBaseline);
    const text = result.map((m) => m.text).join("\n\n").trim();
    if (!text) {
      await page.screenshot({ path: path.join(debugDir, `${requestId}-empty-reply.png`) }).catch(() => {});
      return { ok: false, error: "bot tidak mengirim hasil setelah query" };
    }
    return { ok: true, reply: text };
  } catch (e) {
    console.error("[bridge-web] runFeature error:", e.message);
    await page.screenshot({ path: path.join(debugDir, `${requestId || "err"}-crash.png`) }).catch(() => {});
    return { ok: false, error: e.message };
  }
}

async function postCallback(payload) {
  if (!CALLBACK_URL) return;
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(CALLBACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Signature": sign(body) },
      body,
    });
    if (!res.ok) console.error("[bridge-web] callback HTTP", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("[bridge-web] callback error:", e.message);
  }
}

// ============ HTTP ============
async function main() {
  await bootBrowser();

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({
    ok: true, version: BRIDGE_VERSION, mode: "web-playwright",
    bot, ready, headless, profile: profileDir,
  }));

  app.get("/debug/screenshot", async (req, res) => {
    if (!safeEqual(req.header("X-Bridge-Secret") || "", BRIDGE_SECRET)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const buf = await page.screenshot({ fullPage: false }).catch((e) => { res.status(500).json({ error: e.message }); return null; });
    if (!buf) return;
    res.set("Content-Type", "image/png").send(buf);
  });

  app.post("/run", async (req, res) => {
    const sig = req.header("X-Bridge-Signature") || "";
    const raw = JSON.stringify(req.body || {});
    if (!safeEqual(sig, sign(raw))) return res.status(401).json({ ok: false, error: "invalid signature" });

    const { requestId, feature, query } = req.body || {};
    if (!requestId || !feature) return res.status(400).json({ ok: false, error: "requestId & feature wajib" });

    console.log(`[bridge-web] -> run ${requestId} ${feature} "${String(query || "").slice(0, 60)}"`);
    res.json({ ok: true, queued: true, requestId });
    enqueue(async () => {
      try {
        const result = await runFeature({ requestId, feature, query });
        await postCallback({ requestId, feature, query, ...result });
        console.log(`[bridge-web] done ${requestId} ok=${result.ok} len=${(result.reply || "").length}`);
      } catch (e) {
        console.error("[bridge-web] run error:", e.message);
        await postCallback({ requestId, feature, query, ok: false, error: e.message });
      }
    });
  });

  app.listen(Number(PORT), () => {
    console.log(`[bridge-web] HTTP listening on :${PORT}`);
    console.log(`[bridge-web] callback -> ${CALLBACK_URL || "(belum diset)"}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
