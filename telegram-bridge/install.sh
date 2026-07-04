#!/usr/bin/env bash
# ============================================================
# ENIGMA Telegram Bridge - Installer untuk VPS (Ubuntu/Debian)
# ============================================================
# Menjalankan:
#   - Install Node.js 20 (via NodeSource) bila belum ada
#   - Install dependency npm bridge
#   - Buat .env dari template (bila belum ada) + generate BRIDGE_SECRET
#   - Register systemd service `enigma-bridge`
#   - (Opsional) Install & setup Cloudflare Tunnel untuk expose HTTPS publik
#
# Cara pakai:
#   sudo bash install.sh
#
# Setelah selesai, edit /opt/enigma-bridge/.env (isi TG_API_ID/HASH/BOT/CALLBACK_URL),
# lalu jalankan:
#   sudo -u enigma bash -c 'cd /opt/enigma-bridge && npm run login'   # sekali saja
#   sudo systemctl restart enigma-bridge
#   sudo journalctl -u enigma-bridge -f
# ============================================================

set -euo pipefail

APP_DIR="/opt/enigma-bridge"
APP_USER="enigma"
SERVICE_NAME="enigma-bridge"
NODE_MAJOR="20"

need_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "❌ Jalankan sebagai root: sudo bash install.sh"
    exit 1
  fi
}

log() { echo -e "\n\033[1;36m▸ $*\033[0m"; }
ok()  { echo -e "\033[1;32m✔ $*\033[0m"; }
warn(){ echo -e "\033[1;33m⚠ $*\033[0m"; }

install_node() {
  if command -v node >/dev/null 2>&1; then
    local v; v="$(node -v | sed 's/v//' | cut -d. -f1)"
    if [[ "$v" -ge 18 ]]; then
      ok "Node.js $(node -v) sudah terpasang."
      return
    fi
  fi
  log "Install Node.js ${NODE_MAJOR}.x via NodeSource"
  apt-get update -y
  apt-get install -y curl ca-certificates gnupg
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
  ok "Node.js $(node -v) terpasang."
}

create_user() {
  if ! id "$APP_USER" >/dev/null 2>&1; then
    log "Buat system user '$APP_USER'"
    useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
    ok "User '$APP_USER' dibuat."
  fi
}

copy_sources() {
  log "Salin source bridge ke $APP_DIR"
  mkdir -p "$APP_DIR"
  local SRC_DIR
  SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # Salin file wajib (tanpa node_modules / .env / .session)
  rsync -a --delete \
    --exclude node_modules --exclude .env --exclude '*.session' --exclude .git \
    "$SRC_DIR"/ "$APP_DIR"/
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  ok "Source tersalin."
}

install_deps() {
  log "npm install (production)"
  sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm install --omit=dev"
  ok "Dependency terpasang."
}

setup_env() {
  local ENV_FILE="$APP_DIR/.env"
  if [[ -f "$ENV_FILE" ]]; then
    ok ".env sudah ada, tidak ditimpa."
    return
  fi
  log "Buat .env baru dari template"
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  local SECRET
  SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  # Ganti BRIDGE_SECRET default
  sed -i "s|^BRIDGE_SECRET=.*|BRIDGE_SECRET=${SECRET}|" "$ENV_FILE"
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok ".env dibuat. BRIDGE_SECRET otomatis di-generate."
  warn "EDIT $ENV_FILE dan isi: TG_API_ID, TG_API_HASH, TG_BOT_TARGET, CALLBACK_URL"
}

install_service() {
  log "Register systemd service '$SERVICE_NAME'"
  cat >/etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=ENIGMA Telegram Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node ${APP_DIR}/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null
  ok "Service terdaftar (belum di-start; start setelah login OTP)."
}

install_cloudflared_optional() {
  echo
  read -r -p "Install Cloudflare Tunnel (cloudflared) untuk expose HTTPS publik? [y/N] " yn
  if [[ ! "$yn" =~ ^[Yy]$ ]]; then
    warn "Lewati cloudflared. Anda bisa pakai Nginx+domain sendiri atau ngrok."
    return
  fi
  log "Install cloudflared"
  local ARCH; ARCH="$(dpkg --print-architecture)"
  curl -fsSL -o /tmp/cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  apt-get install -y /tmp/cloudflared.deb
  rm -f /tmp/cloudflared.deb
  ok "cloudflared terpasang. Setup manual:"
  cat <<'EOS'

  1) cloudflared tunnel login              # buka URL, login ke Cloudflare
  2) cloudflared tunnel create enigma-bridge
  3) Edit ~/.cloudflared/config.yml:
       tunnel: <UUID_tunnel>
       credentials-file: /root/.cloudflared/<UUID>.json
       ingress:
         - hostname: bridge.domain-anda.com
           service: http://localhost:4020
         - service: http_status:404
  4) cloudflared tunnel route dns enigma-bridge bridge.domain-anda.com
  5) cloudflared service install
     systemctl enable --now cloudflared

  ATAU quick-tunnel (tanpa domain, URL berubah tiap restart):
     cloudflared tunnel --url http://localhost:4020

EOS
}

print_next_steps() {
  local SECRET
  SECRET="$(grep '^BRIDGE_SECRET=' "$APP_DIR/.env" | cut -d= -f2)"
  cat <<EOF

╔══════════════════════════════════════════════════════════════╗
║              INSTALASI SELESAI - LANGKAH BERIKUT             ║
╚══════════════════════════════════════════════════════════════╝

1) Edit konfigurasi:
   sudo nano ${APP_DIR}/.env

   Wajib diisi:
   - TG_API_ID       (dari https://my.telegram.org/apps)
   - TG_API_HASH     (dari my.telegram.org)
   - TG_BOT_TARGET   (mis. @EnigmaTools_bot)
   - CALLBACK_URL    (URL /api/public/tg/incoming aplikasi Lovable Anda)

2) Login sekali (OTP dari Telegram):
   sudo -u ${APP_USER} bash -c 'cd ${APP_DIR} && npm run login'

   Salin "session string" yang muncul, tempel ke TG_SESSION di .env.

3) Start service:
   sudo systemctl start ${SERVICE_NAME}
   sudo systemctl status ${SERVICE_NAME}
   sudo journalctl -u ${SERVICE_NAME} -f

4) Cek health lokal:
   curl http://localhost:4020/health

5) Expose ke internet (pilih salah satu):
   - Cloudflare Tunnel (lihat panduan di atas)
   - Nginx reverse-proxy + Let's Encrypt
   - ngrok http 4020        (dev/testing)

6) Simpan BRIDGE_SECRET berikut di sisi aplikasi Lovable
   (halaman admin, saat integrasi dibuat):

   ${SECRET}

EOF
}

main() {
  need_root
  apt-get install -y rsync >/dev/null 2>&1 || true
  install_node
  create_user
  copy_sources
  install_deps
  setup_env
  install_service
  install_cloudflared_optional
  print_next_steps
}

main "$@"
