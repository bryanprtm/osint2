# Integrasi Bot WhatsApp via Gateway (Fonnte/Wablas)

## Cara kerja

```
Admin → scan QR sekali di dashboard gateway (bukan di Lovable) → dapat API token
              │
              ▼
Admin buka /admin di Lovable → isi:
  - Provider (Fonnte / Wablas)
  - API Token (disimpan sebagai secret di backend)
  - Nomor bot tujuan (nomor WA yg jadi "bot pengecek")
  - Command mapping per modul (mis. nik → /nikdetail)
              │
              ▼
User di halaman OSINT input NIK/KK/IMEI/…
              │
              ▼
Lovable server function → POST ke API gateway
  → gateway kirim chat "/nikdetail3275…" ke nomor bot
              │
              ▼
Riwayat pengiriman tampil di panel (status: sent/failed + timestamp)
Balasan dari bot dibaca user langsung di WhatsApp mereka
  (gateway tidak forward balasan real-time ke web tanpa webhook publik)
```

## Rekomendasi provider

**Fonnte** — lebih murah untuk volume kecil, dokumentasi Bahasa Indonesia, API paling sederhana (1 endpoint `POST /send`). **Wablas** — lebih mapan, banyak fitur enterprise, harga sedikit lebih tinggi. Untuk use-case ini keduanya cukup; default rekomendasi **Fonnte** kecuali Anda sudah punya akun Wablas.

Anda scan QR **di dashboard provider**, bukan di Lovable — ini teknis yg wajib karena hanya provider yg boleh pegang sesi WhatsApp Web. Setelah scan, sesi persistent di server mereka; Lovable cukup panggil REST API.

## Yang akan dibangun

### 1. Backend (Lovable Cloud)
- **Tabel `wa_gateway_settings`** (singleton, service-role only): `provider` (`fonnte`|`wablas`), `bot_number`, `enabled`, `commands` (JSONB map `featureId → prefix`), `updated_at`.
- **Tabel `wa_send_log`**: `id`, `user_id`, `feature_id`, `query`, `command_sent`, `status` (`sent`|`failed`), `provider_response`, `created_at`. Untuk audit & tampilan riwayat.
- **Secret**: `WA_GATEWAY_TOKEN` (via `add_secret` — sudah ada `WABLAS_TOKEN` sebelumnya, akan di-generalize).
- **Server functions** di `src/lib/wa-gateway.functions.ts`:
  - `getWaSettings()` — admin/operator read (mask token).
  - `saveWaSettings(...)` — admin only (cek `has_role`).
  - `sendWaLookup({ featureId, query })` — auth required. Bangun pesan `${prefix}${sanitize(query)}`, panggil gateway, tulis log, return `{ ok, message, logId }`.
  - `listWaLog({ limit })` — user lihat pengiriman miliknya sendiri; admin lihat semua.

### 2. UI Admin (`src/routes/admin.tsx`)
Ganti section "Integrasi WhatsApp Bot" (yang saat ini pakai localStorage/deep-link) dengan section baru:
- Radio provider (Fonnte/Wablas).
- Input nomor bot + tombol test ("Kirim `ping` ke bot").
- Toggle "Aktifkan pengiriman otomatis".
- Grid command per modul (auto-populate dari `modules.filter(enabled)`).
- Info status token (ada/tidak) tanpa menampilkan nilainya.
- Tabel 20 log terakhir (query, status, waktu, error).

### 3. UI Operator
- `QueryConsole.tsx` & `BpjsConsole.tsx`: ganti `<WaSendButton>` (deep link) dengan `<WaAutoSend>` — tombol "Kirim ke Bot WA" yg memanggil `sendWaLookup` (loading spinner → toast sukses/gagal). Tombol hilang jika admin belum mengaktifkan integrasi atau modul belum di-mapping.
- Opsional toggle "Kirim otomatis saat submit" di dropdown feature — kalau on, `sendWaLookup` dipanggil bersamaan dengan lookup OSINT biasa.
- Hapus `src/lib/whatsapp.ts` + `WaSendButton.tsx` (deep link) supaya tidak dua jalur.

### 4. Catatan penting soal "menampilkan hasil dari bot"
Balasan bot **tidak** otomatis muncul di web. Dua opsi:
- **Sekarang (default)**: user baca balasan di WhatsApp mereka. Web hanya konfirmasi "terkirim".
- **Nanti (opsional, butuh konfirmasi lanjut)**: aktifkan webhook incoming di gateway → arahkan ke `/api/public/wa/incoming` di Lovable → simpan ke `wa_send_log.reply` → polling di UI. Butuh nomor bot yg tidak dipakai chat lain (webhook akan meneruskan semua pesan masuk).

## Yang tidak dilakukan
- Tidak scan QR di halaman Lovable — tidak feasible di Cloudflare Workers (stateless, tanpa persistent socket). QR tetap di dashboard gateway.
- Tidak parse balasan otomatis pada iterasi ini (kecuali Anda pilih opsi webhook di atas).

## File yang berubah
- **Baru**: migration `wa_gateway_settings` + `wa_send_log` (+ GRANT + RLS), `src/lib/wa-gateway.functions.ts`, `src/components/osint/WaAutoSend.tsx`.
- **Edit**: `src/routes/admin.tsx`, `src/components/osint/QueryConsole.tsx`, `src/components/osint/BpjsConsole.tsx`.
- **Hapus**: `src/lib/whatsapp.ts`, `src/components/osint/WaSendButton.tsx`.

## Perlu konfirmasi sebelum implementasi
1. Provider mana: **Fonnte** (rekomendasi) atau **Wablas**?
2. Nomor bot sudah aktif di dashboard gateway? (kalau belum: daftar dulu di fonnte.com / wablas.com, scan QR pakai HP nomor bot, lalu copy token API.)
3. Perlu webhook untuk tampilkan balasan bot di web, atau cukup "terkirim → user baca di WA"?
