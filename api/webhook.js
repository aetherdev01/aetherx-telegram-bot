import { randomUUID } from "node:crypto";
import { loadCatalog, saveCatalog } from "./storage.js";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;
const ADMIN_TELEGRAM_ID = String(process.env.ADMIN_TELEGRAM_ID || "7633494260");
const MAX_SEND_FILE_BYTES = 50 * 1024 * 1024;
const MAX_OLD_VERSIONS = 50;

function env(name, required = true) {
  const value = process.env[name];
  if (required && !value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function isAdmin(userId) {
  return String(userId) === ADMIN_TELEGRAM_ID;
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

async function sendMessage(chatId, text, replyMarkup) {
  return telegramJson("sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function sendDocument(chatId, fileId, caption) {
  return telegramJson("sendDocument", {
    chat_id: chatId,
    document: fileId,
    caption,
  });
}

async function answerCallback(callbackQueryId, text = "") {
  try {
    await telegramJson("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  } catch {
    // Callback acknowledgement failures should not break the main request.
  }
}

function sourceLabel(release) {
  return release?.source === "file" ? "📁" : "🔗";
}

function releaseButton(release) {
  return release.source === "file"
    ? { text: "⬇️ Download AetherX", callback_data: `old:${release.id}` }
    : { text: "⬇️ Buka Link Download", url: release.url };
}

async function sendRelease(chatId, release, contextLabel = "Versi terbaru") {
  if (!release) {
    await sendMessage(chatId, "📦 Belum ada versi AetherX yang tersedia.");
    return;
  }

  const version = release.version || "unknown";
  const caption = `🚀 AetherX ${version}\n\n${contextLabel}${release.fileName ? ` • ${release.fileName}` : ""}`;

  if (release.source === "file" && release.fileId) {
    try {
      await sendDocument(chatId, release.fileId, caption);
      return;
    } catch (error) {
      await sendMessage(
        chatId,
        `⚠️ File AetherX ${version} gagal dikirim langsung.\n\n${error.message}`,
      );
      return;
    }
  }

  if (release.source === "link" && release.url) {
    await sendMessage(
      chatId,
      `${caption}\n\nFile siap diunduh:`,
      { inline_keyboard: [[{ text: "⬇️ Download AetherX", url: release.url }]] },
    );
    return;
  }

  await sendMessage(chatId, `❌ Data versi ${version} tidak lengkap.`);
}

function makeId() {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

function newRelease({ version, source, fileId, fileName, fileSize, url }) {
  return {
    id: makeId(),
    version,
    source,
    fileId: fileId || null,
    fileName: fileName || null,
    fileSize: Number.isFinite(fileSize) ? fileSize : null,
    url: url || null,
    createdAt: new Date().toISOString(),
  };
}

function adminKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "➕ Upload Versi Terbaru", callback_data: "admin:add:latest" }],
      [{ text: "➕ Tambah Versi Lama", callback_data: "admin:add:old" }],
      [{ text: "📋 Daftar Versi", callback_data: "admin:list" }],
      [{ text: "🗑 Hapus Versi", callback_data: "admin:delete" }],
      [{ text: "❌ Batal", callback_data: "admin:cancel" }],
    ],
  };
}

async function showAdminMenu(chatId) {
  await sendMessage(
    chatId,
    "🛠 AetherX Admin\n\nPilih tindakan untuk mengatur versi AetherX yang diberikan kepada pengguna.",
    adminKeyboard(),
  );
}

async function showSourceChoice(chatId, target) {
  await sendMessage(
    chatId,
    target === "latest"
      ? "🚀 Upload Versi Terbaru\n\nPilih sumber file:":
        "📦 Tambah Versi Lama\n\nPilih sumber file:",
    {
      inline_keyboard: [
        [{ text: "🔗 Link", callback_data: `admin:source:link:${target}` }],
        [{ text: "📁 APK / ZIP", callback_data: `admin:source:file:${target}` }],
        [{ text: "❌ Batal", callback_data: "admin:cancel" }],
      ],
    },
  );
}

async function showVersionPrompt(chatId, source, target) {
  await sendMessage(
    chatId,
    `Sumber dipilih: ${source === "file" ? "📁 APK / ZIP" : "🔗 Link"}.\n\nKirim nomor versi, contoh:\nv1.5.0`,
    {
      inline_keyboard: [[{ text: "❌ Batal", callback_data: "admin:cancel" }]],
    },
  );
}

async function finishWithFile(chatId, catalog, session, document) {
  const fileName = String(document.file_name || "").trim();
  const lowerName = fileName.toLowerCase();

  if (!/\.(apk|zip)$/i.test(lowerName)) {
    await sendMessage(chatId, "❌ File harus berekstensi .apk atau .zip.");
    return false;
  }

  const size = Number(document.file_size || 0);
  if (size > MAX_SEND_FILE_BYTES) {
    await sendMessage(
      chatId,
      "❌ File terlalu besar. Bot saat ini mengirim file Telegram maksimal sekitar 50 MB.",
    );
    return false;
  }

  const release = newRelease({
    version: session.version,
    source: "file",
    fileId: document.file_id,
    fileName,
    fileSize: size,
  });

  if (session.target === "latest") {
    if (catalog.latest) {
      catalog.versions.unshift(catalog.latest);
    }
    catalog.latest = release;
  } else {
    catalog.versions.unshift(release);
  }

  catalog.versions = catalog.versions.slice(0, MAX_OLD_VERSIONS);
  delete catalog.sessions[String(ADMIN_TELEGRAM_ID)];

  await saveCatalog(catalog);

  await sendMessage(
    chatId,
    `✅ Versi ${release.version} berhasil disimpan sebagai ${session.target === "latest" ? "versi terbaru" : "versi lama"}.\n\n📁 ${fileName}`,
    adminKeyboard(),
  );

  return true;
}

async function finishWithLink(chatId, catalog, session, text) {
  let url;
  try {
    const parsed = new URL(text.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    url = parsed.toString();
  } catch {
    await sendMessage(chatId, "❌ Link tidak valid. Kirim URL http:// atau https:// yang lengkap.");
    return false;
  }

  const release = newRelease({
    version: session.version,
    source: "link",
    url,
  });

  if (session.target === "latest") {
    if (catalog.latest) {
      catalog.versions.unshift(catalog.latest);
    }
    catalog.latest = release;
  } else {
    catalog.versions.unshift(release);
  }

  catalog.versions = catalog.versions.slice(0, MAX_OLD_VERSIONS);
  delete catalog.sessions[String(ADMIN_TELEGRAM_ID)];

  await saveCatalog(catalog);

  await sendMessage(
    chatId,
    `✅ Versi ${release.version} berhasil disimpan sebagai ${session.target === "latest" ? "versi terbaru" : "versi lama"}.\n\n🔗 ${url}`,
    adminKeyboard(),
  );

  return true;
}

async function handleAdminMessage(message, catalog) {
  const userId = String(message.from?.id || "");
  if (!isAdmin(userId)) return false;

  const session = catalog.sessions[userId];
  if (!session) return false;

  const chatId = message.chat.id;
  const text = String(message.text || "").trim();

  if (text === "/cancel") {
    delete catalog.sessions[userId];
    await saveCatalog(catalog);
    await sendMessage(chatId, "❌ Proses admin dibatalkan.", adminKeyboard());
    return true;
  }

  if (session.step === "version") {
    if (!text || text.startsWith("/")) {
      await sendMessage(chatId, "Kirim nomor versi terlebih dahulu, contoh: v1.5.0");
      return false;
    }

    const version = text.slice(0, 60);
    catalog.sessions[userId] = {
      ...session,
      version,
      step: session.source === "file" ? "file" : "link",
    };

    await saveCatalog(catalog);

    await sendMessage(
      chatId,
      session.source === "file"
        ? `✅ Versi ${version} dipilih.\n\nSekarang kirim file .apk atau .zip sebagai document.`
        : `✅ Versi ${version} dipilih.\n\nSekarang kirim link download https://...`,
      { inline_keyboard: [[{ text: "❌ Batal", callback_data: "admin:cancel" }]] },
    );
    return true;
  }

  if (session.step === "link") {
    return finishWithLink(chatId, catalog, session, text);
  }

  if (session.step === "file") {
    if (!message.document) {
      await sendMessage(chatId, "📁 Kirim file .apk atau .zip sebagai Document, bukan teks.");
      return false;
    }
    return finishWithFile(chatId, catalog, session, message.document);
  }

  return false;
}

async function handleAdminCallback(chatId, userId, data, catalog) {
  if (!isAdmin(userId)) {
    await sendMessage(chatId, "❌ Kamu tidak memiliki akses admin.");
    return false;
  }

  const userKey = String(userId);

  if (data === "admin:open") {
    await showAdminMenu(chatId);
    return false;
  }

  if (data === "admin:cancel") {
    delete catalog.sessions[userKey];
    await saveCatalog(catalog);
    await sendMessage(chatId, "❌ Proses dibatalkan.", adminKeyboard());
    return true;
  }

  if (data === "admin:add:latest" || data === "admin:add:old") {
    const target = data.endsWith(":latest") ? "latest" : "old";
    catalog.sessions[userKey] = { action: "add", target, step: "source" };
    await saveCatalog(catalog);
    await showSourceChoice(chatId, target);
    return true;
  }

  const sourceMatch = data.match(/^admin:source:(link|file):(latest|old)$/);
  if (sourceMatch) {
    const [, source, target] = sourceMatch;
    catalog.sessions[userKey] = { action: "add", target, source, step: "version" };
    await saveCatalog(catalog);
    await showVersionPrompt(chatId, source, target);
    return true;
  }

  if (data === "admin:list") {
    await showAdminList(chatId, catalog);
    return false;
  }

  if (data === "admin:delete") {
    await showDeleteList(chatId, catalog);
    return false;
  }

  const deleteMatch = data.match(/^admin:del:(.+)$/);
  if (deleteMatch) {
    await confirmDelete(chatId, deleteMatch[1], catalog);
    return false;
  }

  const deleteConfirmMatch = data.match(/^admin:delconfirm:(.+)$/);
  if (deleteConfirmMatch) {
    return deleteRelease(chatId, deleteConfirmMatch[1], catalog);
  }

  return false;
}

async function showAdminList(chatId, catalog) {
  const lines = ["📋 Daftar Versi AetherX", ""];

  if (catalog.latest) {
    lines.push(`🚀 Terbaru: ${catalog.latest.version} ${sourceLabel(catalog.latest)}`);
  } else {
    lines.push("🚀 Terbaru: belum ada");
  }

  if (!catalog.versions.length) {
    lines.push("\n📦 Versi lama: belum ada");
  } else {
    lines.push("\n📦 Versi lama:");
    for (const release of catalog.versions.slice(0, 30)) {
      lines.push(`• ${release.version} ${sourceLabel(release)}  [${release.id}]`);
    }
  }

  await sendMessage(chatId, lines.join("\n"), adminKeyboard());
}

async function showDeleteList(chatId, catalog) {
  const rows = [];

  if (catalog.latest) {
    rows.push([{ text: `🚀 Hapus terbaru: ${catalog.latest.version}`, callback_data: `admin:del:${catalog.latest.id}` }]);
  }

  for (const release of catalog.versions.slice(0, 30)) {
    rows.push([{ text: `🗑 ${release.version}`, callback_data: `admin:del:${release.id}` }]);
  }

  if (!rows.length) {
    await sendMessage(chatId, "📦 Belum ada versi yang bisa dihapus.", adminKeyboard());
    return;
  }

  rows.push([{ text: "❌ Batal", callback_data: "admin:cancel" }]);
  await sendMessage(chatId, "🗑 Pilih versi yang ingin dihapus:", { inline_keyboard: rows });
}

function findRelease(catalog, id) {
  if (catalog.latest?.id === id) return { release: catalog.latest, location: "latest" };
  const index = catalog.versions.findIndex((release) => release.id === id);
  if (index >= 0) return { release: catalog.versions[index], location: "old", index };
  return null;
}

async function confirmDelete(chatId, id, catalog) {
  const found = findRelease(catalog, id);
  if (!found) {
    await sendMessage(chatId, "❌ Versi tersebut tidak ditemukan.", adminKeyboard());
    return;
  }

  await sendMessage(
    chatId,
    `⚠️ Hapus versi ${found.release.version}?\n\nTindakan ini hanya menghapus versi dari katalog bot.`,
    {
      inline_keyboard: [
        [{ text: "✅ Ya, hapus", callback_data: `admin:delconfirm:${id}` }],
        [{ text: "❌ Batal", callback_data: "admin:cancel" }],
      ],
    },
  );
}

async function deleteRelease(chatId, id, catalog) {
  const found = findRelease(catalog, id);
  if (!found) {
    await sendMessage(chatId, "❌ Versi tersebut tidak ditemukan.", adminKeyboard());
    return false;
  }

  if (found.location === "latest") {
    catalog.latest = catalog.versions.shift() || null;
  } else {
    catalog.versions.splice(found.index, 1);
  }

  await saveCatalog(catalog);
  await sendMessage(chatId, `✅ Versi ${found.release.version} berhasil dihapus.`, adminKeyboard());
  return true;
}

async function handleStart(chatId, userId, catalog) {
  const keyboard = [
    [{ text: "📥 Versi Terbaru", callback_data: "latest" }],
    [{ text: "📦 Versi Sebelumnya", callback_data: "old" }],
  ];

  if (isAdmin(userId)) {
    keyboard.push([{ text: "🛠 Admin", callback_data: "admin:open" }]);
  }

  await sendMessage(
    chatId,
    "🚀 AetherX\n\nPilih versi AetherX yang ingin kamu download.",
    { inline_keyboard: keyboard },
  );

  if (isAdmin(userId) && catalog.sessions[String(userId)]) {
    delete catalog.sessions[String(userId)];
    await saveCatalog(catalog);
    return true;
  }

  return false;
}

async function handleLatest(chatId, catalog) {
  await sendRelease(chatId, catalog.latest, "Versi terbaru tersedia");
}

async function handleOld(chatId, catalog) {
  if (!catalog.versions.length) {
    await sendMessage(chatId, "📦 Belum ada versi AetherX sebelumnya.");
    return;
  }

  const rows = catalog.versions.slice(0, 30).map((release) => [
    {
      text: `${sourceLabel(release)} ${release.version}`,
      callback_data: `old:${release.id}`,
    },
  ]);

  await sendMessage(
    chatId,
    "📦 Versi AetherX sebelumnya:\n\nPilih versi yang ingin kamu download.",
    { inline_keyboard: rows },
  );
}

async function handleOldIndex(chatId, id, catalog) {
  const release = catalog.versions.find((item) => item.id === id);
  if (!release) {
    await sendMessage(chatId, "❌ Versi tersebut sudah tidak tersedia.");
    return;
  }

  await sendRelease(chatId, release, "Versi sebelumnya");
}

async function handleHelp(chatId) {
  await sendMessage(
    chatId,
    "Bantuan AetherX Bot\n\n/start - Buka menu download\n/latest - Download versi terbaru\n/old - Lihat versi sebelumnya\n/help - Bantuan penggunaan bot\n/about - Informasi tentang AetherX\n\nAdmin: /admin dan /cancel",
  );
}

async function handleAbout(chatId) {
  await sendMessage(
    chatId,
    "AetherX Official Download Bot\n\nDownload versi terbaru atau versi sebelumnya dari sumber yang dikelola admin AetherX.",
  );
}

async function handleUpdate(update) {
  if (update.callback_query) {
    const query = update.callback_query;
    await answerCallback(query.id);

    const chatId = query.message?.chat?.id;
    const userId = query.from?.id;
    if (chatId == null || userId == null) return false;

    const catalog = await loadCatalog();
    const data = String(query.data || "");

    if (data.startsWith("admin:")) {
      return handleAdminCallback(chatId, userId, data, catalog);
    }

    if (data === "latest") {
      await handleLatest(chatId, catalog);
      return false;
    }

    if (data === "old") {
      await handleOld(chatId, catalog);
      return false;
    }

    if (data.startsWith("old:")) {
      await handleOldIndex(chatId, data.slice(4), catalog);
      return false;
    }

    return false;
  }

  const message = update.message;
  if (!message?.chat?.id) return false;

  const userId = message.from?.id;
  const catalog = await loadCatalog();
  const text = String(message.text || "").trim();

  if (userId != null && isAdmin(userId)) {
    const handledByFlow = await handleAdminMessage(message, catalog);
    if (handledByFlow) return true;
  }

  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();

  switch (command) {
    case "/start":
      return handleStart(message.chat.id, userId, catalog);
    case "/latest":
      await handleLatest(message.chat.id, catalog);
      return false;
    case "/old":
      await handleOld(message.chat.id, catalog);
      return false;
    case "/help":
      await handleHelp(message.chat.id);
      return false;
    case "/about":
      await handleAbout(message.chat.id);
      return false;
    case "/admin":
      if (!isAdmin(userId)) {
        await sendMessage(message.chat.id, "❌ Kamu tidak memiliki akses admin.");
        return false;
      }
      if (catalog.sessions[String(userId)]) {
        delete catalog.sessions[String(userId)];
        await saveCatalog(catalog);
      }
      await showAdminMenu(message.chat.id);
      return false;
    case "/cancel":
      if (!isAdmin(userId)) return false;
      if (catalog.sessions[String(userId)]) {
        delete catalog.sessions[String(userId)];
        await saveCatalog(catalog);
      }
      await sendMessage(message.chat.id, "❌ Tidak ada proses yang sedang berjalan.", adminKeyboard());
      return false;
    default:
      return false;
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      service: "AetherX Telegram Bot",
      endpoint: "/api/webhook",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    env("BOT_TOKEN");

    const webhookSecret = env("TELEGRAM_WEBHOOK_SECRET");
    const receivedSecret = req.headers["x-telegram-bot-api-secret-token"];

    if (receivedSecret !== webhookSecret) {
      return res.status(401).send("Unauthorized");
    }

    const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    await handleUpdate(update);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
