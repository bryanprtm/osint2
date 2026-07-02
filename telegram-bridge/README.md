# ENIGMA Telegram Bridge

Bridge Node.js untuk menghubungkan dashboard OSINT Anda dengan bot Telegram
berbasis reply-keyboard (contoh: **ENIGMA TOOLS**). Bridge ini login sebagai
akun Telegram Anda (userbot / MTProto), lalu meneruskan permintaan dari
aplikasi web ke bot dan mengembalikan balasannya.

Kenapa harus terpisah dari aplikasi Lovable: Cloudflare Workers (tempat
aplikasi Anda deploy) tidak bisa menjaga koneksi TCP persisten yang
dibutuhkan MTProto. Bridge ini harus jalan di tempat yang selalu nyala
(VPS / PC 24 jam).

---

## 1. Prasyarat

- Node.js 18+
- Akun Telegram (nomor yang sama yang Anda pakai untuk chat bot).
- `api_id` & `api_hash` dari <https://my.telegram.org/apps> (gratis, sekali daftar).

## 2. Setup

```bash
cd telegram-bridge
npm install
cp .env.example .env
```

Isi `.env`:

- `TG_API_ID`, `TG_API_HASH` — dari my.telegram.org.
- `TG_BOT_TARGET` — username bot (mis. `@EnigmaTools_bot`).
- `BRIDGE_SECRET` — generate secret 64 char:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Simpan nilai yang sama di sisi aplikasi Lovable nanti.
- `CALLBACK_URL` — endpoint publik aplikasi tempat balasan bot dikirim
  balik. Untuk project ini gunakan URL stabil `project--...-dev.lovable.app`
  (atau URL production Anda) diikuti `/api/public/tg/incoming`.

## 3. Login sekali (scan OTP)

```bash
npm run login
```

Ikuti prompt: masukkan nomor telepon, kode OTP dari Telegram, dan password
2FA bila aktif. Skrip akan mencetak **session string** panjang — salin ke
`.env` sebagai `TG_SESSION=...`. Setelah ini tidak perlu OTP lagi.

## 4. Jalankan bridge

```bash
npm start
```

Anda akan melihat:

```
[bridge] connected to Telegram
[bridge] target bot: @EnigmaTools_bot id=1234567890
[bridge] HTTP listening on :4020
```

Cek: `curl http://localhost:4020/health` → `{"ok":true,...}`

## 5. Expose ke internet (agar aplikasi Lovable bisa memanggil)

Bridge harus bisa diakses oleh web app. Pilihan:

- **VPS + Nginx + domain sendiri** (rekomendasi produksi). Arahkan
  `bridge.example.com` → `http://localhost:4020` via reverse-proxy, pasang
  SSL Let's Encrypt.
- **Cloudflare Tunnel** (gratis, tanpa buka port): `cloudflared tunnel
  --url http://localhost:4020` — dapat URL `https://xxx.trycloudflare.com`.
- **ngrok** (dev/testing): `ngrok http 4020`.

Simpan URL publik ini — Anda akan memasukkannya di halaman admin aplikasi
Lovable pada langkah berikutnya (setelah sisi aplikasi dibangun).

## 6. Menyesuaikan tombol menu

Bot ENIGMA memakai reply-keyboard dengan label seperti "🆔 Cek NIK",
"🚗 Cek Kendaraan". Bridge mengirim label PERSIS seperti tercantum di
`features.json`. Jika bot Anda pakai emoji / kapitalisasi berbeda,
edit `features.json` — kunci kiri = `feature_id` di aplikasi, nilai kanan =
teks tombol persis.

Untuk memastikan teks tombol tepat, jalankan sekali di Telegram lalu
**tekan-lama tombol → Copy** — tempelkan hasilnya ke `features.json`.

## 7. Menjalankan sebagai service (systemd)

`/etc/systemd/system/enigma-bridge.service`:

```
[Unit]
Description=ENIGMA Telegram Bridge
After=network.target

[Service]
WorkingDirectory=/opt/enigma-bridge
ExecStart=/usr/bin/node server.js
Restart=always
User=www-data
EnvironmentFile=/opt/enigma-bridge/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now enigma-bridge
sudo journalctl -u enigma-bridge -f
```

## 8. Protokol HTTP (untuk debugging)

### `POST /run`

Header: `X-Bridge-Signature: <hmac-sha256(BRIDGE_SECRET, body)>`

Body:
```json
{ "requestId": "abc123", "feature": "nik", "query": "3201..." }
```

Balasan langsung: `{ "ok": true, "queued": true, "requestId": "abc123" }`

Hasil sebenarnya di-POST ke `CALLBACK_URL`:
```json
{ "requestId": "abc123", "feature": "nik", "query": "3201...",
  "ok": true, "reply": "Nama: ...", "reason": "quiet" }
```

Callback juga menyertakan header `X-Bridge-Signature` dengan HMAC yang sama
sehingga aplikasi bisa memverifikasi asal balasan.

## 9. Keamanan

- **Jangan** commit `.env` atau file `.session` ke git.
- `BRIDGE_SECRET` menahan siapa pun agar tidak bisa memicu userbot Anda.
- Batasi akses `/run` di reverse-proxy (mis. allowlist IP Cloudflare Workers)
  bila memungkinkan.
- Bila session bocor, jalankan `npm run login` ulang untuk membuat sesi
  baru, lalu revoke sesi lama dari Telegram → Settings → Devices.
