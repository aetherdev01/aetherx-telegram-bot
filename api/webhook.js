const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;
const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const MAX_TELEGRAM_FILE_BYTES = 50 * 1024 * 1024;

function env(name, required = true) {
  const value = process.env[name];
  if (required && !value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function telegramJson(method, payload) {
  return fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(`Telegram ${method}: ${data.description || response.statusText}`);
    }
    return data.result;
  });
}

function githubHeaders() {
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": GITHUB_API_VERSION,
    "user-agent": "AetherX-Telegram-Bot/1.0",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function githubJson(path) {
  const response = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders() });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${data.message || response.statusText}`);
  }
  return data;
}

function repo() {
  return env("GITHUB_REPO");
}

function releaseApiPath(suffix = "") {
  return `/repos/${repo()}/releases${suffix}`;
}

function findApk(release) {
  return (release.assets || []).find((asset) => /\.apk$/i.test(asset.name));
}

function releaseKeyboard(asset, release) {
  if (!asset?.browser_download_url) {
    return {
      inline_keyboard: [[
        { text: "🔗 Buka GitHub Release", url: release.html_url }
      ]]
    };
  }
  return {
    inline_keyboard: [[
      { text: "⬇️ Download AetherX", url: asset.browser_download_url }
    ]]
  };
}

async function sendMessage(chatId, text, replyMarkup) {
  return telegramJson("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function answerCallback(callbackQueryId) {
  try {
    await telegramJson("answerCallbackQuery", { callback_query_id: callbackQueryId });
  } catch {
    // Ignore callback acknowledgement errors; they should not break the main response.
  }
}

async function sendRelease(chatId, release, contextLabel = "Versi terbaru") {
  const asset = findApk(release);
  const version = release.tag_name || release.name || "unknown";
  const sizeMb = asset ? (asset.size / (1024 * 1024)).toFixed(1) : null;

  if (!asset) {
    await sendMessage(
      chatId,
      `📦 AetherX ${version}\n\nAPK belum ditemukan di release ini.`,
      releaseKeyboard(null, release),
    );
    return;
  }

  const sendFiles = String(process.env.SEND_FILES || "true").toLowerCase() === "true";

  if (sendFiles && asset.size <= MAX_TELEGRAM_FILE_BYTES) {
    try {
      const fileResponse = await fetch(asset.browser_download_url, {
        headers: githubHeaders(),
      });

      if (fileResponse.ok) {
        const bytes = await fileResponse.arrayBuffer();
        if (bytes.byteLength <= MAX_TELEGRAM_FILE_BYTES) {
          const blob = new Blob([bytes], { type: "application/vnd.android.package-archive" });
          const form = new FormData();
          form.append("chat_id", String(chatId));
          form.append("document", blob, asset.name);
          form.append(
            "caption",
            `🚀 AetherX ${version}\n\n${contextLabel}${sizeMb ? ` • ${sizeMb} MB` : ""}`,
          );

          const upload = await fetch(`${TELEGRAM_API}/sendDocument`, {
            method: "POST",
            body: form,
          });
          const result = await upload.json();
          if (upload.ok && result.ok) return;
        }
      }
    } catch {
      // Fall back to a download button below.
    }
  }

  await sendMessage(
    chatId,
    `🚀 AetherX ${version}\n\n${contextLabel}${sizeMb ? ` • ${sizeMb} MB` : ""}\n\nAPK siap diunduh:`,
    releaseKeyboard(asset, release),
  );
}

async function latestRelease() {
  return githubJson(releaseApiPath("/latest"));
}

async function oldReleases() {
  const releases = await githubJson(releaseApiPath("?per_page=10"));
  return releases.filter((release) => !release.draft && !release.prerelease);
}

async function handleStart(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: "📥 Versi Terbaru", callback_data: "latest" }],
      [{ text: "📦 Versi Sebelumnya", callback_data: "old" }],
    ],
  };

  await sendMessage(
    chatId,
    "🚀 AetherX\n\nMulai bot dan pilih versi AetherX yang ingin kamu download.",
    keyboard,
  );
}

async function handleLatest(chatId) {
  try {
    const release = await latestRelease();
    await sendRelease(chatId, release, "Versi terbaru tersedia");
  } catch (error) {
    await sendMessage(chatId, `❌ Gagal mengambil versi terbaru.\n\n${error.message}`);
  }
}

async function handleOld(chatId) {
  try {
    const releases = await oldReleases();
    const items = releases.slice(1);

    if (!items.length) {
      await sendMessage(chatId, "📦 Belum ada versi AetherX sebelumnya.");
      return;
    }

    const rows = items.slice(0, 8).map((release, index) => [
      {
        text: `📦 ${release.tag_name || release.name || `Version ${index + 1}`}`,
        callback_data: `old:${index}`,
      },
    ]);

    await sendMessage(chatId, "📦 Versi AetherX sebelumnya:\n\nPilih versi yang ingin kamu download.", {
      inline_keyboard: rows,
    });
  } catch (error) {
    await sendMessage(chatId, `❌ Gagal mengambil daftar versi lama.\n\n${error.message}`);
  }
}

async function handleOldIndex(chatId, index) {
  try {
    const releases = await oldReleases();
    const items = releases.slice(1);
    const release = items[Number(index)];
    if (!release) {
      await sendMessage(chatId, "❌ Versi tersebut sudah tidak tersedia.");
      return;
    }
    await sendRelease(chatId, release, "Versi sebelumnya");
  } catch (error) {
    await sendMessage(chatId, `❌ Gagal mengambil versi tersebut.\n\n${error.message}`);
  }
}

async function handleHelp(chatId) {
  await sendMessage(
    chatId,
    "Bantuan AetherX Bot\n\n/start - Buka menu download\n/latest - Download versi terbaru\n/old - Lihat versi sebelumnya\n/help - Bantuan penggunaan bot\n/about - Informasi tentang AetherX",
  );
}

async function handleAbout(chatId) {
  await sendMessage(
    chatId,
    "AetherX Official Download Bot\n\nDownload versi terbaru dan versi sebelumnya dengan mudah dan cepat.",
  );
}

async function handleUpdate(update) {
  if (update.callback_query) {
    const query = update.callback_query;
    await answerCallback(query.id);
    const chatId = query.message?.chat?.id;
    if (chatId == null) return;

    if (query.data === "latest") return handleLatest(chatId);
    if (query.data === "old") return handleOld(chatId);
    if (query.data?.startsWith("old:")) return handleOldIndex(chatId, query.data.slice(4));
    return;
  }

  const message = update.message;
  if (!message?.chat?.id) return;
  const text = String(message.text || "").trim();
  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();

  switch (command) {
    case "/start":
      return handleStart(message.chat.id);
    case "/latest":
      return handleLatest(message.chat.id);
    case "/old":
      return handleOld(message.chat.id);
    case "/help":
      return handleHelp(message.chat.id);
    case "/about":
      return handleAbout(message.chat.id);
    default:
      return;
  }
}

export default async function handler(request) {
  if (request.method === "GET") {
    return Response.json({ ok: true, service: "AetherX Telegram Bot", endpoint: "/api/webhook" });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    env("BOT_TOKEN");
    const webhookSecret = env("TELEGRAM_WEBHOOK_SECRET");
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");

    if (receivedSecret !== webhookSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const update = await request.json();
    await handleUpdate(update);
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
