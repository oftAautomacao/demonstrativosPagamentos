const { spawn } = require("node:child_process");

// Banco de TESTE fixo. Não permitir substituição por variável de ambiente,
// evitando que a Tesouraria grave acidentalmente no projeto de produção.
const FIREBASE_DATABASE_URL = "https://teste-b720c-default-rtdb.firebaseio.com";
const TREASURY_PATH = "OFT/Faturamento/Tesouraria";
const FIREBASE_ENVIRONMENT = "teste";

function curlRequest(url, { method = "GET", headers = {}, body = "", signal } = {}) {
  return new Promise((resolve, reject) => {
    const statusMarker = "__FIREBASE_HTTP_STATUS__:";
    const args = [
      "--silent",
      "--show-error",
      "--max-time", "20",
      "--request", method,
      "--write-out", `\n${statusMarker}%{http_code}`,
    ];
    for (const [name, value] of Object.entries(headers)) args.push("--header", `${name}: ${value}`);
    if (body) args.push("--data-binary", "@-");
    args.push(url);

    const child = spawn("curl.exe", args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const abort = () => child.kill();
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => reject(new Error(`Não foi possível iniciar a conexão segura do Windows: ${error.message}`)));
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) {
        const error = new Error("A conexão foi interrompida.");
        error.name = "AbortError";
        reject(error);
        return;
      }
      const markerIndex = stdout.lastIndexOf(`\n${statusMarker}`);
      const responseBody = markerIndex >= 0 ? stdout.slice(0, markerIndex) : stdout;
      const status = markerIndex >= 0 ? Number(stdout.slice(markerIndex + statusMarker.length + 1)) : 0;
      if (code !== 0 || !status) {
        reject(new Error(`Falha na conexão segura com o Firebase${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
        return;
      }
      resolve({
        ok: status >= 200 && status < 300,
        status,
        text: async () => responseBody,
      });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(body);
  });
}

function firebaseRequest(url, options, fetchImpl = globalThis.fetch) {
  // O curl do Windows usa Schannel e respeita a loja de certificados confiáveis
  // do sistema, assim como o navegador. A validação TLS permanece habilitada.
  if (process.platform === "win32" && fetchImpl === globalThis.fetch) {
    return curlRequest(url, options);
  }
  return fetchImpl(url, options);
}

function firebaseKey(value = "") {
  return String(value).trim().replace(/[.#$\[\]/\u0000-\u001F\u007F]/g, "_") || "Não identificado";
}

function isoDate(value = "") {
  const match = String(value).match(/^([0-3]\d)\/([01]\d)\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function reaisNumber(value = "") {
  const normalized = String(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!/\d/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function treasuryPlanNameKey(paymentKey = "") {
  const match = String(paymentKey).match(/^valorExtrato(\d*)$/);
  return match ? `nomePlano${match[1]}` : "";
}

function buildTreasuryPatch(matches = [], { sourceBank = "Banco não identificado" } = {}) {
  const patch = {};
  const paymentsByPath = new Map();
  const months = new Set();
  const bank = firebaseKey(sourceBank);
  let skipped = 0;
  for (const match of matches) {
    const plan = firebaseKey(match.planName);
    for (const occurrence of match.occurrences || []) {
      const date = isoDate(occurrence.paymentDate);
      const value = reaisNumber(occurrence.paymentAmount);
      if (!date || value === null) {
        skipped += 1;
        continue;
      }
      months.add(date.slice(0, 7));
      const paymentPath = `${plan}/${date}/${bank}`;
      if (!paymentsByPath.has(paymentPath)) paymentsByPath.set(paymentPath, []);
      paymentsByPath.get(paymentPath).push(value);
    }
  }
  let count = 0;
  for (const [paymentPath, values] of paymentsByPath) {
    patch[paymentPath] = Object.fromEntries(values.map((value, index) => [
      index === 0 ? "valorExtrato" : `valorExtrato${index + 1}`,
      value,
    ]));
    count += values.length;
  }
  return { patch, count, skipped, months: [...months] };
}

function buildBankCleanupPatch(data, { sourceBank, months = [] } = {}) {
  const cleanup = {};
  const bank = firebaseKey(sourceBank);
  const monthSet = new Set(months);
  for (const [planName, dates] of Object.entries(data && typeof data === "object" ? data : {})) {
    if (!dates || typeof dates !== "object") continue;
    for (const [date, dateNode] of Object.entries(dates)) {
      if (!monthSet.has(String(date).slice(0, 7)) || !dateNode || typeof dateNode !== "object") continue;
      if (Object.prototype.hasOwnProperty.call(dateNode, bank)) {
        cleanup[`${firebaseKey(planName)}/${date}/${bank}`] = null;
      }
    }
  }
  return cleanup;
}

async function saveTreasuryPayments(matches, {
  sourceBank = "Banco não identificado",
  fetchImpl = globalThis.fetch,
  databaseUrl = FIREBASE_DATABASE_URL,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Este ambiente não possui suporte para conexão HTTPS com o Firebase.");
  const payload = buildTreasuryPatch(matches, { sourceBank });
  if (!payload.count) return { saved: true, count: 0, skipped: payload.skipped };

  const authToken = process.env.FIREBASE_AUTH_TOKEN?.trim();
  const query = new URLSearchParams({ print: "silent" });
  if (authToken) query.set("auth", authToken);
  const baseUrl = String(databaseUrl).replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const readQuery = new URLSearchParams();
    if (authToken) readQuery.set("auth", authToken);
    const readSuffix = readQuery.size ? `?${readQuery}` : "";
    const readResponse = await firebaseRequest(`${baseUrl}/${TREASURY_PATH}.json${readSuffix}`, {
      method: "GET",
      signal: controller.signal,
    }, fetchImpl);
    const readDetail = String(await readResponse.text());
    if (!readResponse.ok) {
      throw new Error(`Firebase respondeu com HTTP ${readResponse.status}${readDetail ? `: ${readDetail.slice(0, 500)}` : ""}`);
    }
    const existingData = readDetail ? JSON.parse(readDetail) : null;
    const cleanup = buildBankCleanupPatch(existingData, { sourceBank, months: payload.months });
    const updatePatch = { ...cleanup, ...payload.patch };
    const response = await firebaseRequest(`${baseUrl}/${TREASURY_PATH}.json?${query}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePatch),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      const detail = String(await response.text()).slice(0, 500);
      throw new Error(`Firebase respondeu com HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return { saved: true, count: payload.count, skipped: payload.skipped, sourceBank };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("O Firebase não respondeu dentro do tempo limite.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseTreasuryData(data) {
  const payments = [];
  for (const [planName, dates] of Object.entries(data && typeof data === "object" ? data : {})) {
    if (!dates || typeof dates !== "object") continue;
    for (const [paymentDate, dateNode] of Object.entries(dates)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !dateNode || typeof dateNode !== "object") continue;
      let foundBankStructure = false;
      for (const [sourceBank, bankNode] of Object.entries(dateNode)) {
        if (!bankNode || typeof bankNode !== "object") continue;
        const values = Object.entries(bankNode)
          .filter(([key, value]) => /^valorExtrato\d*$/.test(key) && Number.isFinite(Number(value)))
          .sort(([keyA], [keyB]) => {
            const numberA = Number(keyA.match(/\d+$/)?.[0] || 1);
            const numberB = Number(keyB.match(/\d+$/)?.[0] || 1);
            return numberA - numberB;
          });
        if (!values.length) continue;
        foundBankStructure = true;
        for (const [paymentKey, value] of values) {
          const editedPlanName = String(bankNode[treasuryPlanNameKey(paymentKey)] || "").trim();
          payments.push({
            planName: editedPlanName || planName,
            originalPlanName: planName,
            paymentDate,
            paymentAmount: Number(value),
            paymentKey,
            sourceBank,
          });
        }
      }
      if (foundBankStructure) continue;

      // Compatibilidade somente de leitura com registros criados antes da
      // separação por banco. Eles deixam de aparecer quando a data é reenviada.
      for (const value of Object.values(dateNode)) {
        if (Number.isFinite(Number(value))) {
          payments.push({
            planName,
            originalPlanName: planName,
            paymentDate,
            paymentAmount: Number(value),
            sourceBank: "Importação anterior",
          });
        }
      }
    }
  }
  payments.sort((a, b) => (
    a.planName.localeCompare(b.planName, "pt-BR", { sensitivity: "base" })
    || a.paymentDate.localeCompare(b.paymentDate)
    || a.sourceBank.localeCompare(b.sourceBank, "pt-BR")
  ));
  return payments;
}

async function updateTreasuryPaymentPlan({
  currentPlanName,
  newPlanName,
  paymentDate,
  sourceBank,
  paymentKey,
} = {}, {
  fetchImpl = globalThis.fetch,
  databaseUrl = FIREBASE_DATABASE_URL,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Este ambiente não possui suporte para conexão HTTPS com o Firebase.");
  const originalPlan = String(currentPlanName || "").trim();
  const editedPlan = String(newPlanName || "").trim().replace(/\s+/g, " ");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(paymentDate)) ? String(paymentDate) : isoDate(paymentDate);
  const valueKey = String(paymentKey || "");
  const nameKey = treasuryPlanNameKey(valueKey);
  if (!originalPlan) throw new Error("O plano original do pagamento não foi informado.");
  if (!editedPlan) throw new Error("Informe o nome do plano.");
  if (editedPlan.length > 80) throw new Error("O nome do plano deve ter no máximo 80 caracteres.");
  if (!date) throw new Error("A data do pagamento é inválida.");
  if (!nameKey) throw new Error("O pagamento selecionado é inválido.");
  const plan = firebaseKey(originalPlan);
  const bank = firebaseKey(sourceBank);

  const authToken = process.env.FIREBASE_AUTH_TOKEN?.trim();
  const readQuery = new URLSearchParams();
  if (authToken) readQuery.set("auth", authToken);
  const writeQuery = new URLSearchParams({ print: "silent" });
  if (authToken) writeQuery.set("auth", authToken);
  const baseUrl = String(databaseUrl).replace(/\/+$/, "");
  const rootUrl = `${baseUrl}/${TREASURY_PATH}.json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const readResponse = await firebaseRequest(`${rootUrl}${readQuery.size ? `?${readQuery}` : ""}`, {
      method: "GET",
      signal: controller.signal,
    }, fetchImpl);
    const detail = String(await readResponse.text());
    if (!readResponse.ok) {
      throw new Error(`Firebase respondeu com HTTP ${readResponse.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`);
    }
    const data = detail ? JSON.parse(detail) : null;
    const bankNode = data?.[plan]?.[date]?.[bank];
    if (!bankNode || !Number.isFinite(Number(bankNode[valueKey]))) {
      throw new Error("O pagamento não foi encontrado no Firebase. Atualize a Tesouraria e tente novamente.");
    }

    const paymentPath = `${plan}/${date}/${bank}`;
    const patch = { [`${paymentPath}/${nameKey}`]: editedPlan };
    const writeResponse = await firebaseRequest(`${rootUrl}?${writeQuery}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(patch),
      signal: controller.signal,
    }, fetchImpl);
    if (!writeResponse.ok) {
      const writeDetail = String(await writeResponse.text()).slice(0, 500);
      throw new Error(`Firebase respondeu com HTTP ${writeResponse.status}${writeDetail ? `: ${writeDetail}` : ""}`);
    }
    return {
      saved: true,
      planName: editedPlan,
      originalPlanName: originalPlan,
      paymentDate: date,
      sourceBank,
      paymentKey: valueKey,
      environment: FIREBASE_ENVIRONMENT,
    };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("O Firebase não respondeu dentro do tempo limite.");
    if (error instanceof SyntaxError) throw new Error("O Firebase retornou dados inválidos para a Tesouraria.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadTreasuryPayments({ fetchImpl = globalThis.fetch, databaseUrl = FIREBASE_DATABASE_URL } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Este ambiente não possui suporte para conexão HTTPS com o Firebase.");
  const authToken = process.env.FIREBASE_AUTH_TOKEN?.trim();
  const query = new URLSearchParams();
  if (authToken) query.set("auth", authToken);
  const suffix = query.size ? `?${query}` : "";
  const baseUrl = String(databaseUrl).replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await firebaseRequest(`${baseUrl}/${TREASURY_PATH}.json${suffix}`, {
      method: "GET",
      signal: controller.signal,
    }, fetchImpl);
    const detail = String(await response.text());
    if (!response.ok) {
      throw new Error(`Firebase respondeu com HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`);
    }
    const data = detail ? JSON.parse(detail) : null;
    const payments = parseTreasuryData(data);
    return { payments, count: payments.length, environment: FIREBASE_ENVIRONMENT };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("O Firebase não respondeu dentro do tempo limite.");
    if (error instanceof SyntaxError) throw new Error("O Firebase retornou dados inválidos para a Tesouraria.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkTreasuryFirebase({ fetchImpl = globalThis.fetch, databaseUrl = FIREBASE_DATABASE_URL } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Este ambiente não possui suporte para conexão HTTPS com o Firebase.");
  const baseUrl = String(databaseUrl).replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    // Um PATCH vazio valida a permissão de escrita sem criar, alterar ou apagar dados.
    const response = await firebaseRequest(`${baseUrl}/${TREASURY_PATH}.json?print=silent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      const detail = String(await response.text()).slice(0, 500);
      throw new Error(`Firebase respondeu com HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return {
      connected: true,
      environment: FIREBASE_ENVIRONMENT,
      databaseUrl: baseUrl,
      path: `/${TREASURY_PATH}`,
    };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("O Firebase não respondeu dentro do tempo limite.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  FIREBASE_DATABASE_URL,
  FIREBASE_ENVIRONMENT,
  TREASURY_PATH,
  buildBankCleanupPatch,
  buildTreasuryPatch,
  checkTreasuryFirebase,
  firebaseKey,
  firebaseRequest,
  isoDate,
  loadTreasuryPayments,
  parseTreasuryData,
  reaisNumber,
  saveTreasuryPayments,
  treasuryPlanNameKey,
  updateTreasuryPaymentPlan,
};
