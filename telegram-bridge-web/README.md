# telegram-bridge-web

Bridge fallback yang meng-otomasi **Telegram Web** (`web.telegram.org/k`) via
Playwright. Dipakai kalau bridge MTProto (`../telegram-bridge/`) gagal klik
tombol reply-keyboard di bot Enigma — di sini Chromium headless "klik" tombol
persis seperti user manusia.

## Kapan dipakai

- MTProto bridge sudah jalan tapi bot tidak merespon setelah klik tombol.
- Bot punya tombol reply-keyboard / WebApp yang tidak bisa di-trigger via API.
- Butuh fallback yang "pasti jalan" walaupun lebih boros resource.

Trade-off:

| Aspek | MTProto | Web (folder ini) |
|---|---|---|
| RAM | ~80 MB | ~500 MB (Chromium) |
| Setup | 1 file `.env` | + login QR + deps Chromium (~300 MB) |
| Reliabilitas | Gagal untuk sebagian reply-keyboard | Persis seperti user |
| Risk ban | Rendah | Sedang (deteksi automation) |

## Requirement VPS

- Ubuntu 22.04+ (atau Debian 12)
- RAM ≥ 1 GB free (rekomendasi 2 GB)
- Node.js 20+
- Port bebas (default `8788`)

## Install

```bash
scp -r telegram-bridge-web root@vps:/root/
ssh root@vps
cd /root/telegram-bridge-web
sudo TARGET_DIR=/opt/telegram-bridge-web ./install_vps.sh
```

Script akan install Node, Chromium, deps, dan bikin systemd service
`telegrambridge-web`. Edit `/opt/telegram-bridge-web/.env` (isi
`BRIDGE_SECRET` dan `CALLBACK_URL`).

## Login Telegram Web (sekali saja)

**Cara termudah — login di laptop, copy profile ke VPS:**

```bash
# di laptop
cd telegram-bridge-web
npm install
npm run login          # buka Chromium headed, scan QR dari HP
# tutup browser setelah chat bot terlihat
scp -r chrome-profile root@vps:/opt/telegram-bridge-web/
ssh root@vps 'systemctl restart telegrambridge-web'
```

**Alternatif — login langsung di VPS via Xvfb (tanpa GUI, pakai VNC):**

```bash
apt-get install -y xvfb x11vnc
cd /opt/telegram-bridge-web
xvfb-run -a --server-args="-screen 0 1200x800x24" npm run login &
x11vnc -display :99 -nopw -listen localhost -xkb &
# forward VNC lewat SSH tunnel, scan QR
```

## Start & verifikasi

```bash
systemctl start telegrambridge-web
journalctl -u telegrambridge-web -f
curl http://127.0.0.1:8788/health
# -> {"ok":true,"version":"2026-07-06-web-playwright-v1","ready":true,...}
```

## Integrasi ke Lovable

Tambah secret di Lovable Cloud (via Settings → Secrets):

- `TG_BRIDGE_URL_WEB` = `http://<vps>:8788` (atau via reverse proxy HTTPS)
- `TG_BRIDGE_SECRET` = sama dengan `BRIDGE_SECRET` di `.env` bridge-web
- (opsional) `TG_BRIDGE_MODE` = `auto` | `web` | `mtproto` (default: `auto`)

Server function `sendTgLookup` akan coba MTProto dulu, lalu fallback ke web
kalau gagal.

## Update

```bash
scp telegram-bridge-web/server.js root@vps:/opt/telegram-bridge-web/server.js.new
ssh root@vps 'cd /opt/telegram-bridge-web && EXPECTED_VERSION=2026-07-06-web-playwright-v1 ./update_vps.sh'
```

## Debug

```bash
# screenshot state chat saat ini
curl -H "X-Bridge-Secret: $BRIDGE_SECRET" http://127.0.0.1:8788/debug/screenshot -o now.png

# screenshot otomatis saat gagal tersimpan di:
ls /opt/telegram-bridge-web/debug/
```
