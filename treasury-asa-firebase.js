const {
  FIREBASE_DATABASE_URL,
  FIREBASE_ENVIRONMENT,
  firebaseKey,
  firebaseRequest,
  isoDate,
} = require("./treasury-firebase");

// Mantém o controle operacional separado dos valores importados dos extratos.
// A conexão continua fixa no projeto Firebase de teste.
const TREASURY_ASA_PATH = "faturamento/demonstrativos/painelControl/AbaTesouraria/informacao1";

function normalizedPaymentReference({
  originalPlanName,
  planName,
  paymentDate,
  sourceBank,
  paymentKey,
} = {}) {
  const originalPlan = String(originalPlanName || planName || "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(paymentDate))
    ? String(paymentDate)
    : isoDate(paymentDate);
  const bank = String(sourceBank || "").trim();
  const valueKey = String(paymentKey || "").trim();
  if (!originalPlan) throw new Error("O plano do pagamento não foi informado.");
  if (!date) throw new Error("A data do pagamento é inválida.");
  if (!bank) throw new Error("O banco do pagamento não foi informado.");
  if (!/^valorExtrato\d*$/.test(valueKey)) throw new Error("A ocorrência do pagamento é inválida.");
  return {
    originalPlanName: originalPlan,
    paymentDate: date,
    sourceBank: bank,
    paymentKey: valueKey,
  };
}

function treasuryAsaStatusKey(payment = {}) {
  const reference = normalizedPaymentReference(payment);
  return JSON.stringify([
    firebaseKey(reference.originalPlanName),
    reference.paymentDate,
    firebaseKey(reference.sourceBank),
    reference.paymentKey,
  ]);
}

function treasuryAsaPaymentPath(payment = {}) {
  const reference = normalizedPaymentReference(payment);
  return [
    firebaseKey(reference.originalPlanName),
    reference.paymentDate,
    firebaseKey(reference.sourceBank),
    reference.paymentKey,
  ].join("/");
}

function parseTreasuryAsaStatuses(data) {
  const statuses = [];
  for (const [originalPlanName, dates] of Object.entries(data && typeof data === "object" ? data : {})) {
    if (!dates || typeof dates !== "object" || Array.isArray(dates)) continue;
    for (const [paymentDate, banks] of Object.entries(dates)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !banks || typeof banks !== "object") continue;
      for (const [sourceBank, payments] of Object.entries(banks)) {
        if (!payments || typeof payments !== "object" || Array.isArray(payments)) continue;
        for (const [paymentKey, value] of Object.entries(payments)) {
          if (!/^valorExtrato\d*$/.test(paymentKey) || !value || typeof value !== "object" || Array.isArray(value)) continue;
          const demonstradoASA = value.demonstradoASA === true;
          const quitadoASA = demonstradoASA && value.quitadoASA === true;
          statuses.push({
            originalPlanName,
            paymentDate,
            sourceBank,
            paymentKey,
            demonstradoASA,
            quitadoASA,
          });
        }
      }
    }
  }
  return statuses;
}

function mergeTreasuryAsaStatuses(payments = [], statuses = []) {
  const byPayment = new Map(statuses.map((status) => [treasuryAsaStatusKey(status), status]));
  return payments.map((payment) => {
    let status;
    try {
      status = byPayment.get(treasuryAsaStatusKey(payment));
    } catch {
      status = null;
    }
    const demonstradoASA = status?.demonstradoASA === true;
    return {
      ...payment,
      demonstradoASA,
      quitadoASA: demonstradoASA && status?.quitadoASA === true,
    };
  });
}

function firebaseUrl(databaseUrl, { silent = false } = {}) {
  const baseUrl = String(databaseUrl).replace(/\/+$/, "");
  const query = new URLSearchParams();
  if (silent) query.set("print", "silent");
  const authToken = process.env.FIREBASE_AUTH_TOKEN?.trim();
  if (authToken) query.set("auth", authToken);
  return `${baseUrl}/${TREASURY_ASA_PATH}.json${query.size ? `?${query}` : ""}`;
}

async function loadTreasuryAsaStatuses({
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
    const detail = String(await response.text());
    if (!response.ok) {
      throw new Error(`Firebase respondeu com HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`);
    }
    const data = detail ? JSON.parse(detail) : null;
    const statuses = parseTreasuryAsaStatuses(data);
    return {
      statuses,
      count: statuses.length,
      environment: FIREBASE_ENVIRONMENT,
      path: `/${TREASURY_ASA_PATH}`,
    };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("O Firebase não respondeu dentro do tempo limite.");
    if (error instanceof SyntaxError) throw new Error("O Firebase retornou dados inválidos para o controle ASA.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveTreasuryAsaStatus(payment = {}, {
  fetchImpl = globalThis.fetch,
  databaseUrl = FIREBASE_DATABASE_URL,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Este ambiente não possui suporte para conexão HTTPS com o Firebase.");
  const reference = normalizedPaymentReference(payment);
  const demonstradoASA = payment.demonstradoASA === true;
  const quitadoASA = payment.quitadoASA === true;
  if (quitadoASA && !demonstradoASA) {
    throw new Error("O pagamento precisa ser demonstrado no ASA antes de ser quitado.");
  }
  const paymentPath = treasuryAsaPaymentPath(reference);
  const savedValue = demonstradoASA || quitadoASA
    ? { demonstradoASA, quitadoASA }
    : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await firebaseRequest(firebaseUrl(databaseUrl, { silent: true }), {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ [paymentPath]: savedValue }),
      signal: controller.signal,
    }, fetchImpl);
    if (!response.ok) {
      const detail = String(await response.text()).slice(0, 500);
      throw new Error(`Firebase respondeu com HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return {
      saved: true,
      ...reference,
      demonstradoASA,
      quitadoASA,
      environment: FIREBASE_ENVIRONMENT,
      path: `/${TREASURY_ASA_PATH}/${paymentPath}`,
    };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("O Firebase não respondeu dentro do tempo limite.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  TREASURY_ASA_PATH,
  loadTreasuryAsaStatuses,
  mergeTreasuryAsaStatuses,
  normalizedPaymentReference,
  parseTreasuryAsaStatuses,
  saveTreasuryAsaStatus,
  treasuryAsaPaymentPath,
  treasuryAsaStatusKey,
};
