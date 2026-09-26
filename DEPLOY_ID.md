# Panduan Upload Vercel — AetherX Bot

1. Extract ZIP.
2. Upload/import folder ke Vercel.
3. Tambahkan Environment Variables:

BOT_TOKEN = token bot dari @BotFather
GITHUB_REPO = owner/repo GitHub AetherX
TELEGRAM_WEBHOOK_SECRET = secret random panjang
SETUP_KEY = secret random lain
SEND_FILES = true

4. Deploy production.
5. Buka URL ini sekali:

https://DOMAIN-VERCEL-KAMU/api/setup?key=SETUP_KEY_KAMU

6. Setelah mendapat `"ok": true`, buka Telegram dan tekan `/start`.

Bot sekarang bekerja dengan webhook. Saat user mengetuk `/latest`, bot akan langsung merespons dan mencoba mengirim APK terbaru. Bila APK tidak bisa dikirim sebagai file, bot memberikan tombol download.
