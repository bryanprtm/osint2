#!/usr/bin/env bash
# install_vps.sh — pasang bridge-web (Playwright + Chromium) sebagai systemd service.
# Jalankan sebagai root di Ubuntu 22.04+.
set -Eeuo pipefail

TARGET_DIR="${TARGET_DIR:-/opt/telegram-bridge-web}"
SERVICE_NAME="${SERVICE_NAME:-telegrambridge-web}"
NODE_MAJOR="${NODE_MAJOR:-20}"

echo "[install] target=$TARGET_DIR service=$SERVICE_NAME"

# 1. Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[install] install Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

# 2. Folder
mkdir -p "$TARGET_DIR"
cp -r ./* "$TARGET_DIR/"
cd "$TARGET_DIR"

# 3. npm install (Playwright akan download Chromium via postinstall)
echo "[install] npm install --omit=dev"
npm install --omit=dev

# 4. Chromium runtime deps
echo "[install] playwright install-deps chromium"
npx playwright install-deps chromium || true
npx playwright install chromium || true

# 5. .env
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "[install] .env dibuat dari .env.example — EDIT dulu (isi BRIDGE_SECRET, CALLBACK_URL, dll)."
fi

# 6. systemd unit
UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Telegram Web Bridge (Playwright)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$TARGET_DIR
EnvironmentFile=$TARGET_DIR/.env
ExecStart=/usr/bin/node $TARGET_DIR/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo
echo "[install] DONE."
echo "Langkah berikutnya:"
echo "  1. Edit $TARGET_DIR/.env (BRIDGE_SECRET, CALLBACK_URL)."
echo "  2. Login Telegram Web (pilih salah satu):"
echo "     a. Di laptop:  cd telegram-bridge-web && npm install && npm run login  → scan QR → tutup."
echo "        Lalu: scp -r chrome-profile root@vps:$TARGET_DIR/"
echo "     b. Di VPS pakai Xvfb:  apt-get install -y xvfb  &&  cd $TARGET_DIR && xvfb-run -a npm run login"
echo "        (perlu VNC/x11 forwarding untuk melihat QR — cara (a) lebih mudah)."
echo "  3. chown -R nobody:nogroup $TARGET_DIR/chrome-profile  (opsional, tergantung user service)"
echo "  4. systemctl start $SERVICE_NAME  &&  journalctl -u $SERVICE_NAME -f"
echo "  5. Test: curl http://127.0.0.1:8788/health"
