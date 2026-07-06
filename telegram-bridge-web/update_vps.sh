#!/usr/bin/env bash
# update_vps.sh — safe in-place update untuk bridge-web di VPS.
# Pemakaian:
#   scp telegram-bridge-web/server.js       root@vps:/opt/telegram-bridge-web/server.js.new
#   scp telegram-bridge-web/features.json   root@vps:/opt/telegram-bridge-web/features.json.new   # opsional
#   scp telegram-bridge-web/package.json    root@vps:/opt/telegram-bridge-web/package.json.new    # opsional
#   ssh root@vps 'cd /opt/telegram-bridge-web && ./update_vps.sh'
set -Eeuo pipefail

BRIDGE_DIR="${BRIDGE_DIR:-/opt/telegram-bridge-web}"
SERVICE_NAME="${SERVICE_NAME:-telegrambridge-web}"
BRIDGE_PORT="${BRIDGE_PORT:-8788}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${BRIDGE_PORT}/health}"
EXPECTED_VERSION="${EXPECTED_VERSION:-}"

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
  [[ -f "${f}.new" ]] && changed+=("$f")
done
if [[ ${#changed[@]} -eq 0 ]]; then
  warn "Tidak ada file *.new. Upload dulu via scp."
  exit 1
fi
log "Update: ${changed[*]}"

if [[ -f server.js.new ]]; then
  log "Cek syntax server.js.new"
  node --check server.js.new || { err "syntax error"; exit 1; }
  ok "syntax OK"
fi

for f in "${changed[@]}"; do
  [[ -f "$f" ]] && cp -p "$f" "$BACKUP_DIR/$f" && ok "Backup $f"
done
for f in "${changed[@]}"; do
  mv "${f}.new" "$f" && ok "Replace $f"
done

if [[ " ${changed[*]} " == *" package.json "* ]] || [[ ! -d node_modules ]]; then
  log "npm install --omit=dev"
  npm install --omit=dev
fi

log "Restart $SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

health_json=""
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  sleep 1
  if health_json="$(curl -fsS --max-time 3 "$HEALTH_URL" 2>/dev/null)"; then break; fi
  echo -n "."
done
echo

rollback() {
  err "Rollback ..."
  for f in "${changed[@]}"; do
    [[ -f "$BACKUP_DIR/$f" ]] && cp -p "$BACKUP_DIR/$f" "$f" && ok "Restore $f"
  done
  systemctl restart "$SERVICE_NAME" || true
  journalctl -u "$SERVICE_NAME" -n 60 --no-pager || true
  exit 1
}

[[ -z "$health_json" ]] && { err "/health tidak merespon"; rollback; }
ok "/health: $health_json"

if [[ -n "$EXPECTED_VERSION" ]]; then
  echo "$health_json" | grep -q "$EXPECTED_VERSION" && ok "versi cocok" || { err "versi mismatch"; rollback; }
fi

ok "Update selesai. Backup: $BACKUP_DIR"
