# Integrasi Bot WhatsApp via Deep Link `wa.me`

Pendekatan paling aman: web app **tidak** menghubungi WhatsApp langsung. Sebagai gantinya, tiap modul menampilkan tombol yang membuka WhatsApp (Web/Desktop/Mobile) dengan pesan perintah bot sudah terisi otomatis. User cukup menekan **Send** sekali.

Contoh URL yang dibuka:
```
https://wa.me/628xxxxxxxxxx?text=%2Fnikdetail3275110203970007
```

## Yang akan dibangun

### 1. Konfigurasi bot (halaman Admin)
- Section baru **"Bot WhatsApp"** di `src/routes/admin.tsx`.
- Field:
  - Nomor WhatsApp bot (format internasional, mis. `6281234567890`).
  - Toggle **Aktifkan integrasi WA**.
  - **Command mapping per modul** — user tentukan prefix perintah tiap fitur, mis:
    - `nik` → `/nikdetail`
    - `kk` → `/kkdetail`
    - `imei` → `/imei`
    - `nopol` → `/plat`
    - `bpjs` → `/bpjs`
    - `mahasiswa` → `/mhs`
    - `guru` → `/guru`
  - Toggle per modul (bisa nonaktif untuk modul tertentu).
- Disimpan di `localStorage` mengikuti pola `settings` yang sudah ada di `useAuth`/`storedToFeature` (atau di tabel `settings` bila sudah ada — akan dicek saat implementasi).

### 2. Helper `buildWaLink`
File baru `src/lib/whatsapp.ts`:
- `buildWaLink({ phone, command, query })` → return URL `https://wa.me/<phone>?text=<encoded>`.
- Sanitasi: strip non-digit di query untuk NIK/KK/IMEI, trim untuk nama, dll.
- Return `null` bila integrasi off atau modul tidak dipetakan.

### 3. Tombol "Kirim ke Bot WA" di UI
- **`QueryConsole.tsx`**: di bawah tombol "Verifikasi Akun", tambahkan tombol sekunder hijau (ikon WhatsApp dari `lucide-react`) — muncul hanya jika input ≥ 3 karakter & mapping tersedia.
- **`BpjsConsole.tsx`**: idem, memakai NIK yang diketik (tanpa captcha karena bot tidak butuh).
- **`ResultsPanel.tsx`**: tombol "Buka lagi di WhatsApp" pakai query terakhir.
- Tombol memakai `<a target="_blank" rel="noopener">` — buka WhatsApp Web di tab baru (di desktop otomatis redirect ke `web.whatsapp.com` bila user sudah scan QR di sana, atau ke WhatsApp Desktop / mobile app).

### 4. UX kecil
- Tooltip: "Membuka WhatsApp dengan perintah siap kirim. Tekan Send untuk menjalankan."
- Jika nomor bot belum dikonfigurasi, tombol disabled + link ke `/admin`.
- Toast setelah klik: "Perintah dibuka di WhatsApp".

## Yang TIDAK dilakukan (dan alasannya)

- Tidak scan QR / tidak automate WhatsApp Web dari backend — melanggar ToS WhatsApp, tidak jalan di Cloudflare Workers, dan berisiko nomor kena banned permanen.
- Tidak parse balasan bot secara otomatis — WhatsApp tidak expose pesan ke web app tanpa API resmi. Hasil tetap dibaca user di WhatsApp.
- Tidak mengganti lookup OSINT yang sudah ada; integrasi WA adalah **jalur alternatif tambahan**, bukan pengganti.

## Detail teknis

- Encode: `encodeURIComponent` untuk seluruh text termasuk `/`.
- Format nomor: strip `+`, spasi, `-` sebelum masuk URL (`wa.me` butuh digit murni).
- Deteksi platform (opsional): di mobile pakai `https://api.whatsapp.com/send?phone=...` (lebih andal buka native app), di desktop pakai `wa.me`. Bisa satu helper dengan branching `navigator.userAgent`.
- Persistensi setting: mengikuti pola `useAuth().settings` yang sudah ada agar per-operator; struktur ditambah `whatsapp: { enabled, phone, commands: Record<string,string> }`.

## File yang berubah

- **Baru**: `src/lib/whatsapp.ts`
- **Edit**: `src/routes/admin.tsx` (section konfigurasi WA)
- **Edit**: `src/lib/auth.tsx` (extend `settings` shape)
- **Edit**: `src/components/osint/QueryConsole.tsx`, `BpjsConsole.tsx`, `ResultsPanel.tsx` (tombol WA)
