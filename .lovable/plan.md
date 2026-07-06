## Konteks

Sekarang bridge pakai **MTProto (GramJS)** — login sebagai user via `TG_SESSION`, kirim pesan & klik tombol lewat API resmi Telegram. Masalah: bot Enigma pakai **reply-keyboard** (bukan inline button), dan beberapa fitur tampaknya butuh interaksi UI yang tidak bisa direplikasi lewat MTProto (misal bot cek `via_bot`, WebApp button, atau anti-automation).

Alternatif yang kamu usulkan: **jalankan Telegram Web (web.telegram.org) di headless browser di VPS**, login sekali, lalu automation pakai Playwright/Puppeteer untuk klik tombol persis seperti user manusia. Ini fallback terakhir kalau MTProto tetap gagal.

## Rencana: Bridge v2 berbasis Playwright (Telegram Web K)

### Arsitektur

```text
Lovable app  --HTTP /run-->  bridge-web (Node + Playwright)
                                  |
                                  v
                            Chromium headless
                                  |
                                  v
                       https://web.telegram.org/k/
                       (session tersimpan di userDataDir)
                                  |
                                  v
                            Bot @EnigmaOSINT
```

### Komponen baru di folder `telegram-bridge-web/`

1. **`package.json`** — deps: `express`, `playwright`, `dotenv`. Script `login` (buka browser non-headless untuk scan QR sekali), `start` (headless daemon).
2. **`login.js`** — jalankan Chromium **headed** dengan `userDataDir=./chrome-profile`, buka `https://web.telegram.org/k/`, user scan QR dari HP. Setelah login, tutup — sesi tersimpan di profil Chromium.
3. **`server.js`** — HTTP server mirip bridge lama (`/health`, `/run`, `/debug/menu`), tapi driver-nya Playwright:
   - Boot: launch Chromium **headless** dengan `userDataDir` yang sama, buka chat bot via URL `https://web.telegram.org/k/#@EnigmaOSINT`.
   - `runFeature(feature, query)`:
     a. Ketik `/start` di composer, tekan Enter.
     b. Tunggu pesan bot terakhir muncul (poll DOM `.message`).
     c. Klik tombol "🏠 Menu Utama" via `page.getByRole('button', { name: '🏠 Menu Utama' })`.
     d. Klik tombol fitur (label dari `features.json`).
     e. Tunggu prompt input, lalu ketik `query` + Enter.
     f. Collect balasan bot (loop tunggu bubble baru sampai quiet 6 detik), kirim ke `CALLBACK_URL`.
   - Screenshot debug ke `./debug/*.png` kalau step gagal (buat troubleshooting).
4. **`install_vps.sh`** — install Chromium deps (`playwright install-deps chromium`), buat systemd unit `telegrambridge-web.service`, buka port 8788.
5. **`update_vps.sh`** — mirip yang sudah ada, tapi untuk service baru.
6. **`README.md`** — cara login pertama kali (jalankan `login.js` via `xvfb-run` atau tunnel X11 / pakai VNC sekali; alternatif: login di laptop, copy folder `chrome-profile/` ke VPS via `scp -r`).

### Perubahan di app Lovable

- `src/lib/tg-bridge.functions.ts`: tambah env `TG_BRIDGE_URL_WEB` sebagai fallback. Logic:
  1. Coba `TG_BRIDGE_URL` (MTProto) dulu.
  2. Kalau gagal (`ok:false` dengan error klik/timeout) atau timeout, retry ke `TG_BRIDGE_URL_WEB` (Playwright).
- Feature flag `TG_BRIDGE_MODE=mtproto|web|auto` di secrets.

### Trade-off yang perlu kamu tahu

| Aspek | MTProto (sekarang) | Playwright Web (usulan) |
|---|---|---|
| Resource VPS | ~80MB RAM | ~400–600MB RAM (Chromium headless) |
| Setup | 1 file `.env` | + login QR, Chromium deps (~300MB) |
| Reliabilitas klik | Gagal untuk reply-keyboard tertentu | Sama seperti user manusia — hampir pasti jalan |
| Risk banned Telegram | Rendah | Sedang (automation di web client bisa dideteksi) |
| Deteksi UI berubah | Stabil (pakai API) | Perlu update selector kalau Telegram Web ganti layout |

### Pertanyaan sebelum saya generate file

1. **Spec VPS**: RAM ≥ 1GB free? Chromium headless butuh ~500MB. Kalau VPS kecil, kita perlu swap dulu.
2. **Cara login pertama**: (a) kamu bisa jalankan `xvfb-run` + VNC sekali di VPS untuk scan QR, atau (b) login di laptop lalu `scp -r chrome-profile/` ke VPS?
3. **Mode fallback**: mau `auto` (coba MTProto dulu, fallback ke web) atau langsung `web` saja untuk semua request?
4. **Tetap pertahankan bridge MTProto lama** di folder `telegram-bridge/`, atau ganti total?

Jawab 4 pertanyaan itu dan saya lanjut ke build mode untuk generate semua file (`telegram-bridge-web/*`, update `tg-bridge.functions.ts`, `update_vps.sh` versi web).