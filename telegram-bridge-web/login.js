// login.js — jalankan sekali untuk login Telegram Web (scan QR dari HP).
// Setelah berhasil login, sesi tersimpan di CHROME_PROFILE_DIR dan
// server.js bisa langsung headless.
//
// Cara pakai:
//   1. Di VPS dengan Xvfb:  xvfb-run -a node login.js
//   2. Atau di laptop:      node login.js   → scan QR → tutup browser
//      Lalu copy folder profile ke VPS:
//        scp -r chrome-profile root@vps:/opt/telegram-bridge-web/
require("dotenv").config();
const { chromium } = require("playwright");
const path = require("path");

const PROFILE = path.resolve(process.env.CHROME_PROFILE_DIR || "./chrome-profile");
const BOT = (process.env.TG_BOT_USERNAME || "enigmatoolsbot").replace(/^@/, "");

(async () => {
  console.log("[login] profile dir:", PROFILE);
  console.log("[login] buka Chromium (headed). Scan QR dari Telegram → Devices → Link Desktop Device.");
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1200, height: 800 },
    args: ["--no-sandbox"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(`https://web.telegram.org/k/#@${BOT}`, { waitUntil: "domcontentloaded" });
  console.log("[login] Tunggu sampai chat bot terbuka, lalu tutup browser secara manual.");
  console.log("[login] Sesi akan otomatis tersimpan di:", PROFILE);
  // Jangan auto-close; biarkan user tutup manual setelah login berhasil.
})();
