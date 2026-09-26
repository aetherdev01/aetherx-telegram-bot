const token = process.env.BOT_TOKEN;
const webhookUrl = process.env.WEBHOOK_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !webhookUrl || !secret) {
  console.error("Required: BOT_TOKEN, WEBHOOK_URL, TELEGRAM_WEBHOOK_SECRET");
  process.exit(1);
}

async function call(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
  if (!response.ok || !data.ok) process.exit(1);
}

await call("setWebhook", {
  url: webhookUrl,
  secret_token: secret,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});

await call("setMyCommands", {
  commands: [
    { command: "start", description: "Mulai bot dan pilih versi AetherX" },
    { command: "latest", description: "Download versi terbaru AetherX" },
    { command: "old", description: "Lihat dan download versi AetherX sebelumnya" },
    { command: "help", description: "Bantuan penggunaan bot" },
    { command: "about", description: "Informasi tentang AetherX" },
  ],
});
