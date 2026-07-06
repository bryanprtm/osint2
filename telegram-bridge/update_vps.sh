#!/usr/bin/env bash
# update_vps.sh — safe in-place update untuk telegram-bridge di VPS.
#
# Pemakaian:
#   1. Dari mesin lokal, upload file baru:
#        scp telegram-bridge/server.js       root@vps:/opt/telegram-bridge/server.js.new
#        scp telegram-bridge/features.json   root@vps:/opt/telegram-bridge/features.json.new   # opsional
#        scp telegram-bridge/package.json    root@vps:/opt/telegram-bridge/package.json.new    # opsional
#   2. Di VPS:
#        cd /opt/telegram-bridge && sudo ./update_vps.sh
#
# Script akan: syntax-check -> backup -> replace -> npm install (kalau perlu)
#              -> restart service -> cek /health -> rollback otomatis kalau gagal.

set -Eeuo pipefail

BRIDGE_DIR="${BRIDGE_DIR:-/opt/telegram-bridge}"
SERVICE_NAME="${SERVICE_NAME:-telegrambridge}"
BRIDGE_PORT="${BRIDGE_PORT:-8787}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${BRIDGE_PORT}/health}"
EXPECTED_VERSION="${EXPECTED_VERSION:-}"   # optional, contoh: 2026-07-06-mtproto-callback-v3

RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLU=$'\033[34m'; NC=$'\033[0m'
log()  { echo "${BLU}[update]${NC} $*"; }
ok()   { echo "${GRN}[ ok  ]${NC} $*"; }
warn() { echo "${YLW}[warn ]${NC} $*"; }
err()  { echo "${RED}[fail ]${NC} $*" >&2; }

cd "$BRIDGE_DIR" || { err "BRIDGE_DIR $BRIDGE_DIR tidak ada"; exit 1; }

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="./.backup/$TS"
mkdir -p "$BACKUP_DIR"

changed=()
for f in server.js features.json package.json; do
  if [[ -f "${f}.new" ]]; then
    changed+=("$f")
  fi
done

if [[ ${#changed[@]} -eq 0 ]]; then
  warn "Tidak ada file *.new di $BRIDGE_DIR. Upload dulu via scp lalu jalankan lagi."
  exit 1
fi

log "File yang akan di-update: ${changed[*]}"

# 1. Syntax check untuk server.js
if [[ -f server.js.new ]]; then
  log "Cek syntax server.js.new ..."
  if ! node --check server.js.new; then
    err "server.js.new syntax error. Update dibatalkan."
    exit 1
  fi
  ok "Syntax OK"
fi

# 2. Backup file lama
for f in "${changed[@]}"; do
  if [[ -f "$f" ]]; then
    cp -p "$f" "$BACKUP_DIR/$f"
    ok "Backup $f -> $BACKUP_DIR/$f"
  fi
done

# 3. Replace file
for f in "${changed[@]}"; do
  mv "${f}.new" "$f"
  ok "Replace $f"
done

# 4. npm install kalau package.json ikut berubah atau node_modules kosong
need_install=0
if [[ " ${changed[*]} " == *" package.json "* ]]; then need_install=1; fi
if [[ ! -d node_modules ]]; then need_install=1; fi
if [[ $need_install -eq 1 ]]; then
  log "npm install --omit=dev ..."
  npm install --omit=dev
  ok "Dependencies siap"
else
  log "Skip npm install (tidak ada perubahan package.json)"
fi

# 5. Restart service
log "Restart systemd service: $SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# 6. Tunggu bridge naik & cek /health
log "Tunggu bridge siap ..."
health_json=""
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 1
  if health_json="$(curl -fsS --max-time 3 "$HEALTH_URL" 2>/dev/null)"; then
    break
  fi
  echo -n "."
done
echo

rollback() {
  err "Rollback ke versi sebelumnya ..."
  for f in "${changed[@]}"; do
    if [[ -f "$BACKUP_DIR/$f" ]]; then
      cp -p "$BACKUP_DIR/$f" "$f"
      ok "Restore $f"
    fi
  done
  systemctl restart "$SERVICE_NAME" || true
  echo
  err "Log terakhir service:"
  journalctl -u "$SERVICE_NAME" -n 40 --no-pager || true
  exit 1
}

if [[ -z "$health_json" ]]; then
  err "/health tidak merespon di $HEALTH_URL"
  rollback
fi

ok "/health merespon:"
echo "$health_json"

if [[ -n "$EXPECTED_VERSION" ]]; then
  if echo "$health_json" | grep -q "$EXPECTED_VERSION"; then
    ok "Versi cocok: $EXPECTED_VERSION"
  else
    err "Versi tidak cocok. Diharapkan: $EXPECTED_VERSION"
    rollback
  fi
fi

ok "Update selesai. Backup disimpan di $BACKUP_DIR"
