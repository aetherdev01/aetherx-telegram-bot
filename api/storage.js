import { get, put } from "@vercel/blob";

const CATALOG_PATH = "aetherx/catalog.json";

function emptyCatalog() {
  return {
    version: 1,
    latest: null,
    versions: [],
    sessions: {},
    updatedAt: new Date().toISOString(),
  };
}

function normalizeCatalog(data) {
  const base = emptyCatalog();
  if (!data || typeof data !== "object") return base;

  return {
    version: 1,
    latest: data.latest && typeof data.latest === "object" ? data.latest : null,
    versions: Array.isArray(data.versions) ? data.versions.filter(Boolean).slice(0, 100) : [],
    sessions: data.sessions && typeof data.sessions === "object" ? data.sessions : {},
    updatedAt: data.updatedAt || base.updatedAt,
  };
}

export async function loadCatalog() {
  try {
    const result = await get(CATALOG_PATH, {
      access: "private",
      useCache: false,
    });

    if (!result) return emptyCatalog();

    const text = await new Response(result.stream).text();
    return normalizeCatalog(JSON.parse(text));
  } catch (error) {
    const message = String(error?.message || error);
    if (/not found|not_found|blob.*not exist|does not exist|404|BLOB_NOT_FOUND/i.test(message)) {
      return emptyCatalog();
    }
    throw error;
  }
}

export async function saveCatalog(catalog) {
  const payload = JSON.stringify(
    {
      ...normalizeCatalog(catalog),
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  );

  await put(CATALOG_PATH, payload, {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
}
