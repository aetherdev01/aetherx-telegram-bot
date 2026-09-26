const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

async function telegram(method, payload) {
  const response = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method}: ${data.description || response.statusText}`);
  }
  return data.result;
}

export default async function handler(request) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const setupKey = url.searchParams.get("key");

    if (!process.env.BOT_TOKEN || !process.env.SETUP_KEY || !process.env.TELEGRAM_WEBHOOK_SECRET) {
      return Response.json({ ok: false, error: "Missing BOT_TOKEN, SETUP_KEY, or TELEGRAM_WEBHOOK_SECRET" }, { status: 500 });
    }

    if (setupKey !== process.env.SETUP_KEY) {
      return new Response("Unauthorized", { status: 401 });
    }

    const webhookUrl = `${url.origin}/api/webhook`;

    const commands = [
      { command: "start", description: "Mulai bot dan pilih versi AetherX" },
      { command: "latest", description: "Download versi terbaru AetherX" },
      { command: "old", description: "Lihat dan download versi AetherX sebelumnya" },
      { command: "help", description: "Bantuan penggunaan bot" },
      { command: "about", description: "Informasi tentang AetherX" },
    ];

    await telegram("setWebhook", {
      url: webhookUrl,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });

    await telegram("setMyCommands", { commands });
    await telegram("setMyShortDescription", {
      short_description: "Official AetherX Download Bot — latest dan versi sebelumnya.",
      language_code: "id",
    });
    await telegram("setMyDescription", {
      description: "Download AetherX dengan mudah dan cepat. Dapatkan versi terbaru atau versi sebelumnya melalui bot ini.",
      language_code: "id",
    });

    const me = await telegram("getMe", {});

    return Response.json({
      ok: true,
      message: "AetherX bot berhasil disetup.",
      bot: `@${me.username}`,
      webhook: webhookUrl,
      commands,
    });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
