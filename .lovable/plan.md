Ya, ada cara lain yang lebih tepat: jangan mengirim teks label fitur, tapi ambil tombol dari pesan menu Telegram lalu panggil callback tombolnya secara langsung menggunakan MTProto. Ini meniru klik tombol asli di Telegram.

## Rencana implementasi

1. Tambahkan mode inspeksi tombol di bridge VPS
   - Bridge akan membaca pesan menu terakhir dari `@enigmatoolsbot`.
   - Bridge akan mencetak daftar tombol, tipe tombol, posisi baris/kolom, dan `callback_data` bila ada.
   - Ini memastikan apakah tombol seperti `📞 Cek Nomor` adalah inline callback button atau reply keyboard biasa.

2. Ubah flow eksekusi fitur menjadi klik berbasis tombol asli
   - `/start` hanya dipakai untuk membuka menu awal.
   - Bridge mencari tombol `🏠 Menu Utama`, lalu melakukan klik asli.
   - Setelah menu utama muncul, bridge mencari tombol fitur sesuai `features.json`.
   - Jika tombol punya `callback_data`, bridge memanggil `messages.GetBotCallbackAnswer` langsung.
   - Jika tombol adalah reply keyboard biasa, bridge baru boleh mengirim teks tombol sebagai fallback.

3. Tambahkan guard agar welcome/menu tidak dianggap sebagai hasil
   - Balasan seperti `SELAMAT DATANG DI ENIGMA OSINT BOT` dan `Pilih layanan...` akan diabaikan.
   - Query target hanya dikirim setelah bot mengirim prompt input dari fitur yang dipilih.
   - Jika prompt tidak muncul, app akan menampilkan error jelas: tombol belum berhasil diklik.

4. Tambahkan endpoint debug aman di bridge
   - Endpoint lokal/terproteksi seperti `/debug/menu` untuk melihat tombol yang terdeteksi.
   - Ini membantu mencocokkan label fitur dengan tombol aktual di bot tanpa menebak.
   - Output debug dipakai untuk memperbaiki `features.json` bila emoji/spasi/label berbeda.

5. Tambahkan verifikasi versi bridge
   - `/health` akan menampilkan versi bridge terbaru.
   - Setelah restart VPS, kita bisa memastikan server benar-benar menjalankan kode baru, bukan versi lama.

## Alternatif jika callback tetap tidak bisa

Jika bot Enigma memakai mekanisme yang tidak bisa diakses oleh userbot GramJS, alternatifnya:

- ganti library bridge ke Telethon/Pyrogram di Python untuk klik tombol yang lebih stabil, atau
- jalankan automation Telegram Desktop/browser di VPS sebagai fallback terakhir.

Saya sarankan mulai dari opsi MTProto callback langsung karena paling ringan, stabil, dan tidak membutuhkan UI automation.