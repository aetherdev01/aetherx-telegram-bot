# AetherX Telegram Bot — Admin Managed

Bot Telegram untuk distribusi AetherX yang dikelola admin.

## Fitur
- `/start`, `/latest`, `/old`, `/help`, `/about`
- Admin Telegram ID dikunci ke `ADMIN_TELEGRAM_ID`
- `/admin` + inline buttons
- Tambah versi terbaru atau versi lama
- Sumber versi: link HTTPS atau file `.apk` / `.zip`
- Katalog versi disimpan di Vercel Blob private storage
- File Telegram disimpan sebagai Telegram `file_id`, sehingga bot dapat mengirim ulang file tanpa mengunduh ulang dari GitHub
- `/latest` dan `/old` tidak menggunakan GitHub Releases

## Environment Production
Wajib:
- `BOT_TOKEN`
- `ADMIN_TELEGRAM_ID=7633494260`
- `TELEGRAM_WEBHOOK_SECRET`
- `SETUP_KEY`
- `BLOB_READ_WRITE_TOKEN` (untuk Blob store yang menggunakan token)

`BLOB_STORE_ID` boleh tersedia dari Vercel dan tidak perlu dibaca langsung oleh kode.

## Deploy
```bash
npm install
vercel --prod
```

Kemudian jalankan setup:
```bash
curl -i "https://YOUR-DOMAIN.vercel.app/api/setup?key=YOUR_SETUP_KEY"
```

Jangan commit token/secret.
