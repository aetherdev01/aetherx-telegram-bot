# AetherX Telegram Download Bot

Bot Telegram AetherX yang berjalan di **Vercel Functions menggunakan webhook**. Tidak membutuhkan proses Node.js yang menyala terus-menerus.

## Fitur

- `/start` menampilkan tombol **Versi Terbaru** dan **Versi Sebelumnya**.
- `/latest` langsung membalas dengan versi terbaru.
- `/old` menampilkan daftar release sebelumnya.
- `/help` dan `/about`.
- Otomatis membaca GitHub Releases.
- Memilih file `.apk` dari release.
- Mencoba mengirim APK langsung ke chat bila ukuran memenuhi batas bot Telegram saat ini; bila gagal/terlalu besar, bot mengirim tombol download GitHub.
- Setup otomatis webhook dan menu command lewat `/api/setup`.
- Tidak ada token bot yang disimpan di source code.

## Kenapa Vercel

Gunakan Vercel untuk runtime bot dan GitHub untuk menyimpan source code/release APK. Bot ini memakai Telegram webhook, jadi Vercel hanya menjalankan function saat Telegram mengirim update; tidak perlu server polling yang harus hidup terus.

## 1. Isi Environment Variables di Vercel

Tambahkan:

```text
BOT_TOKEN=TOKEN_DARI_BOTFATHER
GITHUB_REPO=AetherDev/AetherX
TELEGRAM_WEBHOOK_SECRET=buat-secret-random-panjang
SETUP_KEY=buat-secret-random-lain
GITHUB_TOKEN=
SEND_FILES=true
```

`GITHUB_REPO` harus berupa `owner/repository` dan release AetherX sebaiknya public.

`GITHUB_TOKEN` opsional. Untuk repository public, boleh dikosongkan.

`SEND_FILES=true` membuat bot mencoba mengirim APK sebagai file. Telegram Bot API saat ini membatasi upload file bot hingga 50 MB; bila APK lebih besar, bot otomatis memakai tombol download.

## 2. Deploy ke Vercel

Cara termudah: upload/import folder project ini ke Vercel, kemudian tambahkan Environment Variables di Project Settings.

## 3. Aktifkan webhook + command secara otomatis

Setelah deployment production selesai, buka:

```text
https://NAMA-PROJECT.vercel.app/api/setup?key=SETUP_KEY_KAMU
```

Harus muncul JSON dengan `"ok": true`.

Endpoint setup akan:

- memasang Telegram webhook;
- mendaftarkan `/start`, `/latest`, `/old`, `/help`, `/about`;
- mengatur short description dan description bot.

Jalankan endpoint setup lagi setelah mengganti domain production atau webhook secret.

## 4. GitHub Releases

Upload APK AetherX ke GitHub Release. Contoh:

```text
Release: v1.0.0
Assets:
  AetherX-v1.0.0.apk
```

Bot akan membaca release terbaru secara otomatis. `/old` membaca release-release yang sudah dipublikasikan dan bukan prerelease.

## Struktur

```text
api/
  webhook.js      # menerima update Telegram
  setup.js        # setup webhook + commands
  health.js       # health check
scripts/
  set-webhook.mjs # alternatif setup dari terminal
.env.example
vercel.json
package.json
README.md
```

## Testing cepat

Buka:

```text
https://NAMA-PROJECT.vercel.app/api/health
```

Lalu di Telegram kirim:

```text
/start
/latest
/old
/help
/about
```

## Jika ingin mengubah teks bot

Edit bagian pesan di `api/webhook.js` dan `api/setup.js`, lalu deploy ulang.

## Catatan keamanan

Jangan pernah memasukkan `BOT_TOKEN`, `GITHUB_TOKEN`, `SETUP_KEY`, atau `TELEGRAM_WEBHOOK_SECRET` ke GitHub source code.
