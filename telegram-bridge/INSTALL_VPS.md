# Tutorial Instalasi Bridge di VPS

Panduan step-by-step deploy `telegram-bridge` di VPS Ubuntu/Debian
dengan installer otomatis (`install.sh`).

---

## 1. Sewa VPS

Spek minimum: **1 vCPU, 1 GB RAM, 10 GB disk, Ubuntu 22.04/24.04**.

Rekomendasi murah (~Rp 30-60rb/bulan):
- **Contabo** (VPS S, ~€4/bln)
- **Hetzner CX11** (~€4/bln, butuh kartu kredit)
- **BiznetGio / IDCloudHost / Niagahoster** (lokal Indonesia, lebih cepat)
- **DigitalOcean / Vultr** (~$5/bln, free credit trial)

Catat: **IP publik**, **user root**, dan **password / SSH key**.

---

## 2. Login ke VPS

Dari komputer Anda:

```bash
ssh root@IP_VPS_ANDA
```

(Ganti password bila diminta pertama kali.)

---

## 3. Upload source bridge ke VPS

Ada 3 cara — pilih yang paling gampang:

### Cara A — Clone dari repo Anda (paling rapi)

Kalau project Lovable ini sudah tersambung ke GitHub:

```bash
apt update && apt install -y git
cd /root
git clone https://github.com/USERNAME/REPO.git enigma-src
cd enigma-src/telegram-bridge
```

### Cara B — Upload via `scp` dari komputer lokal

Dari terminal **komputer Anda** (bukan VPS):

```bash
scp -r telegram-bridge root@IP_VPS_ANDA:/root/
ssh root@IP_VPS_ANDA
cd /root/telegram-bridge
```

### Cara C — Salin manual

```bash
mkdir -p /root/telegram-bridge && cd /root/telegram-bridge
nano server.js       # tempel isi file
nano package.json
nano login.js
nano features.json
nano install.sh
nano .env.example
```

---

## 4. Jalankan installer

```bash
cd /root/telegram-bridge     # atau /root/enigma-src/telegram-bridge
chmod +x install.sh
sudo bash install.sh
```

Installer akan:
- Install Node.js 20 (kalau belum ada)
- Buat user sistem `enigma`
- Salin source ke `/opt/enigma-bridge`
- Jalankan `npm install`
- Bikin `.env` dan **generate `BRIDGE_SECRET`** otomatis
- Register service `systemd` bernama `enigma-bridge`
- Tanya apakah mau install **Cloudflare Tunnel** (jawab `y` bila belum punya domain)

Di akhir installer akan mencetak **`BRIDGE_SECRET`** — **catat**, nanti dipakai di sisi aplikasi Lovable.

---

## 5. Dapatkan `api_id` & `api_hash` dari Telegram

1. Buka <https://my.telegram.org/apps> (login pakai nomor Telegram Anda).
2. Klik **API Development Tools**.
3. Isi form ("App title": bebas, mis. `enigma-bridge`; "Platform": `Desktop`).
4. Simpan → catat **`api_id`** (angka) dan **`api_hash`** (string).

---

## 6. Edit konfigurasi `.env`

```bash
sudo nano /opt/enigma-bridge/.env
```

Isi minimal:

```env
TG_API_ID=1234567
TG_API_HASH=abcdef0123456789abcdef0123456789
TG_BOT_TARGET=@EnigmaTools_bot
CALLBACK_URL=https://project--695c473a-644e-4fb9-ac01-d475a07215de-dev.lovable.app/api/public/tg/incoming
BRIDGE_SECRET=<sudah_terisi_otomatis>
TG_SESSION=
```

`CALLBACK_URL` — pakai URL stabil project Lovable Anda + `/api/public/tg/incoming`
(endpoint akan dibuat di iterasi berikutnya).

Simpan: `Ctrl+O` → `Enter` → `Ctrl+X`.

---

## 7. Login Telegram sekali (OTP)

```bash
sudo -u enigma bash -c 'cd /opt/enigma-bridge && npm run login'
```

Ikuti prompt:
- **Phone number**: `+628xxxxxxxxxx` (nomor Telegram Anda)
- **Code**: OTP yang dikirim Telegram ke device Anda
- **2FA password**: bila aktif

Skrip akan mencetak **session string** super panjang. **Copy semuanya**, lalu:

```bash
sudo nano /opt/enigma-bridge/.env
# tempel di baris TG_SESSION=...
```

---

## 8. Start service

```bash
sudo systemctl start enigma-bridge
sudo systemctl status enigma-bridge
```

Harusnya muncul:
```
● enigma-bridge.service - ENIGMA Telegram Bridge
     Active: active (running)
```

Lihat log realtime:
```bash
sudo journalctl -u enigma-bridge -f
```

Cek health:
```bash
curl http://localhost:4020/health
# {"ok":true,"bot":"@EnigmaTools_bot","botId":"..."}
```

---

## 9. Expose ke internet (HTTPS publik)

Aplikasi Lovable perlu URL publik untuk POST ke bridge. Pilih **satu**:

### Opsi A — Cloudflare Tunnel (gratis, tanpa buka port, butuh domain di Cloudflare)

Setelah installer memasang `cloudflared`:

```bash
cloudflared tunnel login          # buka URL, pilih domain Anda
cloudflared tunnel create enigma-bridge
```

Edit `~/.cloudflared/config.yml`:
```yaml
tunnel: <UUID_dari_langkah_sebelumnya>
credentials-file: /root/.cloudflared/<UUID>.json
ingress:
  - hostname: bridge.domain-anda.com
    service: http://localhost:4020
  - service: http_status:404
```

```bash
cloudflared tunnel route dns enigma-bridge bridge.domain-anda.com
cloudflared service install
systemctl enable --now cloudflared
```

URL publik: `https://bridge.domain-anda.com`

### Opsi B — Quick Tunnel (tanpa domain, URL random, cepat untuk testing)

```bash
cloudflared tunnel --url http://localhost:4020
```

URL `https://xxx-xxx-xxx.trycloudflare.com` muncul di terminal. Kekurangan: URL ganti setiap restart.

### Opsi C — Nginx + Let's Encrypt (domain sendiri)

```bash
apt install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/enigma-bridge`:
```nginx
server {
    server_name bridge.domain-anda.com;
    location / {
        proxy_pass http://localhost:4020;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    listen 80;
}
```
```bash
ln -s /etc/nginx/sites-available/enigma-bridge /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d bridge.domain-anda.com
```

### Opsi D — ngrok (dev/testing cepat)

```bash
snap install ngrok
ngrok config add-authtoken <TOKEN_dari_dashboard_ngrok>
ngrok http 4020
```

---

## 10. Verifikasi end-to-end

Dari komputer mana pun:

```bash
curl https://URL_PUBLIK_BRIDGE_ANDA/health
```

Harusnya balas `{"ok":true,...}`.

---

## 11. Simpan ini untuk sisi Lovable

Anda butuh 2 nilai ini saat kita bangun UI admin di aplikasi Lovable:

| Field | Nilai |
|---|---|
| `TG_BRIDGE_URL` | `https://URL_PUBLIK_BRIDGE_ANDA` |
| `TG_BRIDGE_SECRET` | isi dari `/opt/enigma-bridge/.env` (`BRIDGE_SECRET`) |

Cek `BRIDGE_SECRET` kapan saja:
```bash
sudo grep BRIDGE_SECRET /opt/enigma-bridge/.env
```

---

## Troubleshooting

**Service tidak start** — cek log:
```bash
sudo journalctl -u enigma-bridge -n 100 --no-pager
```

**"TG_SESSION kosong"** — ulangi langkah 7 (login OTP), tempel session string ke `.env`, lalu:
```bash
sudo systemctl restart enigma-bridge
```

**Bot tidak respons** — pastikan label tombol di `/opt/enigma-bridge/features.json` **persis sama** dengan tombol di bot ENIGMA (termasuk emoji & spasi). Setelah edit:
```bash
sudo systemctl restart enigma-bridge
```

**FloodWait** — akun Telegram Anda kena rate-limit karena terlalu cepat kirim pesan. Tunggu waktu yang disebutkan di log, lalu naikkan `BUTTON_DELAY_MS` di `.env`.

**Session expired** — Telegram me-revoke sesi (biasanya karena login di device lain lalu logout). Ulangi langkah 7.

---

## Update bridge di kemudian hari

```bash
cd /root/enigma-src && git pull
cd telegram-bridge && sudo bash install.sh   # aman diulang, .env tidak ditimpa
sudo systemctl restart enigma-bridge
```
