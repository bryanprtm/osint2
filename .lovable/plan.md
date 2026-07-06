## Tujuan

Bikin satu script `telegram-bridge/update_vps.sh` yang bisa dijalankan di VPS untuk narik versi terbaru `server.js` (dan `features.json`) dari repo Lovable published, install dependency baru kalau ada, lalu restart service `telegrambridge` dan verifikasi `/health` menunjukkan `BRIDGE_VERSION` terbaru.

## Isi script (garis besar)

```text
1. Variabel:
   - BRIDGE_DIR (default: /opt/telegram-bridge)
   - SERVICE_NAME (default: telegrambridge)
   - REPO_RAW_BASE (URL raw file server.js dari GitHub / sumber user)
   - BRIDGE_PORT (default: 8787)
   - BRIDGE_SECRET (dibaca dari .env existing)

2. Langkah:
   a. cd $BRIDGE_DIR
   b. Backup server.js -> server.js.bak.<timestamp>
   c. curl -fsSL $REPO_RAW_BASE/server.js -o server.js.new
      curl -fsSL $REPO_RAW_BASE/features.json -o features.json.new
   d. node -c server.js.new  (syntax check)
   e. mv server.js.new server.js ; mv features.json.new features.json
   f. Kalau package.json berubah / node_modules kosong -> npm install --omit=dev
   g. systemctl restart $SERVICE_NAME
   h. sleep 3
   i. curl -s http://127.0.0.1:$BRIDGE_PORT/health -> print JSON, cek field `version`
   j. Rollback otomatis kalau health gagal (restore .bak) + tampilkan `journalctl -u $SERVICE_NAME -n 40`

3. Output berwarna (echo) supaya jelas step mana yang sukses/gagal.
```

## Pertanyaan singkat (biar script langsung jalan)

Sebelum saya generate file-nya, saya butuh 1 keputusan: **sumber file `server.js` terbaru di VPS mau diambil dari mana?**

Pilihan:
- **A. GitHub repo user** — user kasih URL raw seperti `https://raw.githubusercontent.com/<user>/<repo>/main/telegram-bridge`
- **B. Copy manual via scp** — script hanya melakukan backup + syntax check + restart + health check, file baru user upload sendiri pakai `scp`
- **C. Endpoint Lovable published** — kurang cocok karena `server.js` bukan asset publik

Rekomendasi saya: **B** (paling simpel & aman, tanpa perlu setup repo). Kalau setuju, script akan dipakai begini di VPS:

```bash
# di lokal
scp telegram-bridge/server.js root@vps:/opt/telegram-bridge/server.js.new
# di VPS
cd /opt/telegram-bridge && ./update_vps.sh
```

Script `update_vps.sh` akan otomatis: syntax-check `server.js.new`, backup lama, ganti, `npm install` kalau perlu, `systemctl restart telegrambridge`, dan verifikasi `/health` menampilkan `2026-07-06-mtproto-callback-v3`. Rollback otomatis kalau gagal.

Balas **A / B / C** (atau kasih URL kalau pilih A) dan saya langsung buatkan file-nya di mode build.
