require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const featuresMap = require("./features.json");

const {
  TG_API_ID,
  TG_API_HASH,
  TG_SESSION,
  TG_BOT_TARGET,
  BRIDGE_SECRET,
  CALLBACK_URL,
  PORT = "4020",
  REPLY_TIMEOUT_MS = "90000",
  BUTTON_DELAY_MS = "1500",
  MENU_WAIT_MS = "8000",
} = process.env;

function fail(msg) { console.error("[bridge] " + msg); process.exit(1); }
if (!TG_API_ID || !TG_API_HASH) fail("TG_API_ID / TG_API_HASH belum diisi");
if (!TG_SESSION) fail("TG_SESSION kosong — jalankan `npm run login` dulu");
if (!TG_BOT_TARGET) fail("TG_BOT_TARGET kosong");
if (!BRIDGE_SECRET || BRIDGE_SECRET.length < 32) fail("BRIDGE_SECRET wajib >= 32 karakter");

const apiId = Number(TG_API_ID);
const apiHash = TG_API_HASH;
const replyTimeout = Number(REPLY_TIMEOUT_MS);
const buttonDelay = Number(BUTTON_DELAY_MS);
const menuWait = Number(MENU_WAIT_MS);
const quietMs = 6000;

const client = new TelegramClient(new StringSession(TG_SESSION), apiId, apiHash, {
  connectionRetries: 5,
});

let botEntity = null;
let botIdStr = null;

function sign(payload) { return crypto.createHmac("sha256", BRIDGE_SECRET).update(payload).digest("hex"); }
function safeEqual(a, b) {
  const A = Buffer.from(String(a)); const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let chain = Promise.resolve();
function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.catch(() => {});
  return run;
}

// ================= Bot message stream =================
// Semua pesan masuk dari bot ditaruh di antrian ring; consumer bisa
// menunggu pesan berikutnya atau memakainya untuk collectReply.
const inbox = []; // {msg, text, at}
const waiters = []; // resolve callbacks
function pushInbox(msg) {
  const text = msg.message || "";
  const item = { msg, text, at: Date.now() };
  inbox.push(item);
  // Batasi ukuran
  if (inbox.length > 200) inbox.shift();
  while (waiters.length) waiters.shift()(item);
  // Untuk collectReply mode
  pushCollector(text);
}
function waitNextBotMessage(timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      const idx = waiters.indexOf(res);
      if (idx >= 0) waiters.splice(idx, 1);
      resolve(null);
    }, timeoutMs);
    const res = (item) => { clearTimeout(timer); resolve(item); };
    waiters.push(res);
  });
}
async function drainAndGetLatest(waitMs) {
  // tunggu sampai bot diam sejenak, kembalikan pesan terakhir
  let last = inbox[inbox.length - 1] || null;
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    const next = await waitNextBotMessage(waitMs - (Date.now() - start));
    if (!next) break;
    last = next;
  }
  return last;
}

// ================= Collector (untuk reply query) =================
const pending = new Map();
function pushCollector(text) {
  if (!text || !text.trim()) return;
  for (const [id, p] of pending) {
    if (!p.collecting) continue;
    p.messages.push(text);
    clearTimeout(p.quietTimer);
    p.quietTimer = setTimeout(() => finishPending(id, "quiet"), quietMs);
  }
}
function finishPending(requestId, reason) {
  const p = pending.get(requestId);
  if (!p) return;
  clearTimeout(p.quietTimer);
  clearTimeout(p.hardTimer);
  pending.delete(requestId);
  const text = p.messages.map((m) => m.trim()).filter(Boolean).join("\n\n") || "(tidak ada balasan bot dalam batas waktu)";
  p.resolve({ ok: true, reply: text, reason });
}
async function collectReply(requestId) {
  return new Promise((resolve) => {
    const entry = { messages: [], resolve, quietTimer: null, hardTimer: null, collecting: true };
    entry.hardTimer = setTimeout(() => finishPending(requestId, "hard-timeout"), replyTimeout);
    pending.set(requestId, entry);
  });
}

// ================= Bot interaction =================
async function resolveBot() {
  botEntity = await client.getEntity(TG_BOT_TARGET);
  botIdStr = String(botEntity.id);
  console.log("[bridge] target bot:", TG_BOT_TARGET, "id=" + botIdStr);
}

async function sendToBot(text) {
  await client.sendMessage(botEntity, { message: text });
}

function normalize(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

async function clickButtonByText(msg, label) {
  if (!msg?.replyMarkup?.rows) return false;
  const want = normalize(label);
  for (let i = 0; i < msg.replyMarkup.rows.length; i++) {
    const row = msg.replyMarkup.rows[i];
    for (let j = 0; j < row.buttons.length; j++) {
      const btn = row.buttons[j];
      if (normalize(btn.text) === want) {
        try {
          await msg.click({ i, j });
          return true;
        } catch (e) {
          console.error("[bridge] click error:", e.message);
          return false;
        }
      }
    }
  }
  return false;
}

async function findMenuMessageWithButton(label, waitMs) {
  const deadline = Date.now() + waitMs;
  // Cek pesan yang sudah ada dulu (paling baru dulu)
  for (let i = inbox.length - 1; i >= 0; i--) {
    const it = inbox[i];
    if (it.msg?.replyMarkup?.rows) {
      const has = it.msg.replyMarkup.rows.some((r) => r.buttons.some((b) => normalize(b.text) === normalize(label)));
      if (has) return it.msg;
    }
  }
  while (Date.now() < deadline) {
    const next = await waitNextBotMessage(deadline - Date.now());
    if (!next) return null;
    if (next.msg?.replyMarkup?.rows) {
      const has = next.msg.replyMarkup.rows.some((r) => r.buttons.some((b) => normalize(b.text) === normalize(label)));
      if (has) return next.msg;
    }
  }
  return null;
}

async function runFeature({ requestId, feature, query }) {
  const buttonLabel = featuresMap[feature];
  if (!buttonLabel) return { ok: false, error: `feature "${feature}" tidak ada di features.json` };

  // Kosongkan inbox supaya tidak tercampur sesi sebelumnya
  inbox.length = 0;

  // 1. /start → dapatkan menu welcome dengan tombol "Menu Utama"
  await sendToBot("/start");
  let menuMsg = await findMenuMessageWithButton("🏠 Menu Utama", menuWait);

  // 2. Klik "Menu Utama" untuk buka daftar fitur
  if (menuMsg) {
    const okClick = await clickButtonByText(menuMsg, "🏠 Menu Utama");
    if (!okClick) console.warn("[bridge] gagal klik Menu Utama");
    await sleep(buttonDelay);
  } else {
    console.warn("[bridge] tidak menemukan tombol Menu Utama setelah /start");
  }

  // 3. Cari pesan yang memuat tombol fitur & klik
  const featureMsg = await findMenuMessageWithButton(buttonLabel, menuWait);
  if (!featureMsg) {
    return { ok: false, error: `tombol "${buttonLabel}" tidak ditemukan di menu bot` };
  }
  const clicked = await clickButtonByText(featureMsg, buttonLabel);
  if (!clicked) return { ok: false, error: `gagal klik tombol "${buttonLabel}"` };

  // 4. Beri jeda supaya bot kirim prompt "masukkan …"
  await sleep(buttonDelay);

  // 5. Kirim query & kumpulkan balasan
  const collector = collectReply(requestId);
  await sendToBot(String(query || ""));
  return await collector;
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
    if (!res.ok) console.error("[bridge] callback HTTP", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("[bridge] callback error:", e.message);
  }
}

async function main() {
  await client.connect();
  console.log("[bridge] connected to Telegram");
  await resolveBot();

  client.addEventHandler(async (event) => {
    const msg = event.message;
    if (!msg || msg.out) return;
    const peerId = msg.peerId;
    const fromBot =
      (peerId?.userId && String(peerId.userId) === botIdStr) ||
      (msg.senderId && String(msg.senderId) === botIdStr);
    if (!fromBot) return;
    const preview = (msg.message || "[no-text]").slice(0, 80).replace(/\n/g, " ");
    const hasBtns = !!msg.replyMarkup?.rows;
    console.log(`[bridge] <- ${preview}${hasBtns ? " [buttons]" : ""}`);
    pushInbox(msg);
  }, new NewMessage({}));

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true, bot: TG_BOT_TARGET, botId: botIdStr }));

  app.post("/run", async (req, res) => {
    const sig = req.header("X-Bridge-Signature") || "";
    const raw = JSON.stringify(req.body || {});
    if (!safeEqual(sig, sign(raw))) return res.status(401).json({ ok: false, error: "invalid signature" });

    const { requestId, feature, query } = req.body || {};
    if (!requestId || !feature) return res.status(400).json({ ok: false, error: "requestId & feature wajib" });

    console.log(`[bridge] -> run ${requestId} ${feature} "${String(query || "").slice(0, 60)}"`);
    res.json({ ok: true, queued: true, requestId });
    enqueue(async () => {
      try {
        const result = await runFeature({ requestId, feature, query });
        await postCallback({ requestId, feature, query, ...result });
        console.log(`[bridge] done ${requestId} reason=${result.reason ?? result.error ?? "-"} len=${(result.reply || "").length}`);
      } catch (e) {
        console.error("[bridge] run error:", e.message);
        await postCallback({ requestId, feature, query, ok: false, error: e.message });
      }
    });
  });

  app.listen(Number(PORT), () => {
    console.log(`[bridge] HTTP listening on :${PORT}`);
    console.log(`[bridge] callback -> ${CALLBACK_URL || "(belum diset)"}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
