const {
  FIREBASE_DATABASE_URL,
  FIREBASE_ENVIRONMENT,
  firebaseKey,
  firebaseRequest,
} = require("./treasury-firebase");

const CONFIG_DRAFT_PATH = "faturamento/demonstrativos/painelControl/AbaConfiguracao/informacao1";

function validIsoDate(value = "") {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function parseConfigDownloadDates(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const dates = {};
  for (const [agreement, value] of Object.entries(data)) {
    const date = typeof value === "string" ? value : value?.dataDownloadDemonstrativo;
    if (validIsoDate(date)) dates[agreement] = date;
  }
  return dates;
}

function firebaseUrl(databaseUrl, { silent = false } = {}) {
  const baseUrl = String(databaseUrl).replace(/\/+$/, "");
  const query = new URLSearchParams();
  if (silent) query.set("print", "silent");
  const authToken = process.env.FIREBASE_AUTH_TOKEN?.trim();
  if (authToken) query.set("auth", authToken);
  const suffix = query.size ? `?${query}` : "";
  return `${baseUrl}/${CONFIG_DRAFT_PATH}.json${suffix}`;
}

async function loadConfigDownloadDates({
  fetchImpl = globalThis.fetch,
  databaseUrl = FIREBASE_DATABASE_URL,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Este ambiente não possui suporte para conexão HTTPS com o Firebase.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await firebaseRequest(firebaseUrl(databaseUrl), {
      method: "GET",
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      const detail = String(await response.text()).slice(0, 500);
      throw new Error(`Firebase respondeu com HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    const dates = parseConfigDownloadDates(data);
    return {
      dates,
      count: Object.keys(dates).length,
      environment: FIREBASE_ENVIRONMENT,
      path: `/${CONFIG_DRAFT_PATH}`,
    };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("O Firebase não respondeu dentro do tempo limite.");
    if (error instanceof SyntaxError) throw new Error("O Firebase retornou datas inválidas para a Configuração.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveConfigDownloadDate(agreement, downloadDate, {
  fetchImpl = globalThis.fetch,
  databaseUrl = FIREBASE_DATABASE_URL,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Este ambiente não possui suporte para conexão HTTPS com o Firebase.");
  const name = String(agreement || "").trim();
  const date = String(downloadDate || "").trim();
  if (!name) throw new Error("Informe o convênio antes da data de download.");
  if (date && !validIsoDate(date)) throw new Error("A data de download do demonstrativo é inválida.");

  const key = firebaseKey(name);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await firebaseRequest(firebaseUrl(databaseUrl, { silent: true }), {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ [key]: date || null }),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      const detail = String(await response.text()).slice(0, 500);
      throw new Error(`Firebase respondeu com HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return {
      saved: true,
      agreement: name,
      downloadDate: date,
      environment: FIREBASE_ENVIRONMENT,
      path: `/${CONFIG_DRAFT_PATH}/${key}`,
    };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("O Firebase não respondeu dentro do tempo limite.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  CONFIG_DRAFT_PATH,
  loadConfigDownloadDates,
  parseConfigDownloadDates,
  saveConfigDownloadDate,
  validIsoDate,
};
