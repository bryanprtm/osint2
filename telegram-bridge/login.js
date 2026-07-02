// One-time login. Setelah selesai, salin string TG_SESSION ke file .env.
require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;

if (!apiId || !apiHash) {
  console.error("TG_API_ID / TG_API_HASH belum diisi di .env");
  process.exit(1);
}

(async () => {
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
  await client.start({
    phoneNumber: async () => await input.text("Nomor telepon (mis. +628123456789): "),
    password: async () => await input.text("Password 2FA (kosongkan bila tidak ada): "),
    phoneCode: async () => await input.text("Kode OTP dari Telegram: "),
    onError: (err) => console.error(err),
  });
  console.log("\n=================== LOGIN BERHASIL ===================");
  console.log("Salin baris berikut ke file .env sebagai TG_SESSION=...\n");
  console.log(client.session.save());
  console.log("\n======================================================\n");
  await client.disconnect();
  process.exit(0);
})();
