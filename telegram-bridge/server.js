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
  BUTTON_DELAY_MS = "1200",
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
const quietMs = 6000; // dianggap "selesai" bila bot diam sekian ms setelah balasan terakhir

const client = new TelegramClient(new StringSession(TG_SESSION), apiId, apiHash, {
  connectionRetries: 5,
});

let botEntity = null;
let botIdStr = null;

function sign(payload) {
  return crypto.createHmac("sha256", BRIDGE_SECRET).update(payload).digest("hex");
}
function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Serial queue supaya percakapan dengan bot tidak tercampur
let chain = Promise.resolve();
function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.catch(() => {});
  return run;
}

const pending = new Map(); // requestId -> { messages: [], resolve, quietTimer, hardTimer }

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
    const entry = { messages: [], resolve, quietTimer: null, hardTimer: null };
    entry.hardTimer = setTimeout(() => finishPending(requestId, "hard-timeout"), replyTimeout);
    pending.set(requestId, entry);
  });
}

function pushBotMessage(text) {
  for (const [id, p] of pending) {
    p.messages.push(text);
    clearTimeout(p.quietTimer);
    p.quietTimer = setTimeout(() => finishPending(id, "quiet"), quietMs);
  }
}

async function resolveBot() {
  botEntity = await client.getEntity(TG_BOT_TARGET);
  botIdStr = String(botEntity.id);
  console.log("[bridge] target bot:", TG_BOT_TARGET, "id=" + botIdStr);
}

async function sendToBot(text) {
  await client.sendMessage(botEntity, { message: text });
}

async function runFeature({ requestId, feature, query }) {
  const buttonLabel = featuresMap[feature];
  if (!buttonLabel) {
    return { ok: false, error: `feature "${feature}" tidak ada di features.json` };
  }
  await sendToBot(buttonLabel);          // klik tombol menu
  await sleep(buttonDelay);              // beri jeda supaya bot sempat kirim prompt
  await sendToBot(String(query || ""));  // kirim query
  return await collectReply(requestId);
}

async function postCallback(payload) {
  if (!CALLBACK_URL) return;
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(CALLBACK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bridge-Signature": sign(body),
      },
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
    const text = msg.message || "";
    if (!text.trim()) return;
    console.log("[bridge] <-", text.slice(0, 80).replace(/\n/g, " "));
    pushBotMessage(text);
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
    // Jalankan async; balas HTTP segera, hasil dikirim via callback.
    res.json({ ok: true, queued: true, requestId });
    enqueue(async () => {
      try {
        const result = await runFeature({ requestId, feature, query });
        await postCallback({ requestId, feature, query, ...result });
        console.log(`[bridge] done ${requestId} reason=${result.reason ?? "-"} len=${(result.reply || "").length}`);
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
