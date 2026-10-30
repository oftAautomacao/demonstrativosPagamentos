const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTreasuryPatch,
  checkTreasuryFirebase,
  FIREBASE_DATABASE_URL,
  FIREBASE_ENVIRONMENT,
  loadTreasuryPayments,
  parseTreasuryData,
  saveTreasuryPayments,
} = require("../treasury-firebase");

const matches = [{
  planName: "Sulamerica",
  occurrences: [
    { paymentId: "pagamento-a", paymentDate: "17/09/2026", paymentAmount: "500,00" },
    { paymentId: "pagamento-b", paymentDate: "17/09/2026", paymentAmount: "500,00" },
  ],
}, {
  planName: "Caixa de Assistência",
  occurrences: [
    { paymentId: "pagamento-c", paymentDate: "30/09/2026", paymentAmount: "1.234,56" },
  ],
}];

test("monta o nó da Tesouraria preservando pagamentos repetidos", () => {
  const result = buildTreasuryPatch(matches, { sourceBank: "Bradesco" });
  assert.equal(result.count, 3);
  assert.deepEqual(result.patch, {
    "Sulamerica/2026-09-17/Bradesco": { valorExtrato: 500, valorExtrato2: 500 },
    "Caixa de Assistência/2026-09-30/Bradesco": { valorExtrato: 1234.56 },
  });
});

test("ignora somente registros sem data ou valor", () => {
  const result = buildTreasuryPatch([{
    planName: "Amil",
    occurrences: [
      { paymentId: "ok", paymentDate: "01/10/2026", paymentAmount: "100,00" },
      { paymentId: "sem-data", paymentDate: "", paymentAmount: "100,00" },
      { paymentId: "sem-valor", paymentDate: "01/10/2026", paymentAmount: "" },
    ],
  }]);
  assert.equal(result.count, 1);
  assert.equal(result.skipped, 2);
});

test("salva com PATCH sem sobrescrever os demais pagamentos", async () => {
  let request;
  const result = await saveTreasuryPayments(matches, {
    sourceBank: "Banco do Brasil",
    databaseUrl: "https://exemplo.firebaseio.com/",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 204, text: async () => "" };
    },
  });
  assert.equal(result.count, 3);
  assert.equal(request.options.method, "PATCH");
  assert.match(request.url, /OFT\/Faturamento\/Tesouraria\.json\?print=silent$/);
  const body = JSON.parse(request.options.body);
  assert.equal(Object.keys(body).length, 2);
  assert.deepEqual(body["Sulamerica/2026-09-17/Banco do Brasil"], {
    valorExtrato: 500,
    valorExtrato2: 500,
  });
});

test("mantém Bradesco e Banco do Brasil como extratos complementares", () => {
  const payments = parseTreasuryData({
    Sulamerica: {
      "2026-09-17": {
        Bradesco: { valorExtrato: 500 },
        "Banco do Brasil": { valorExtrato: 700, valorExtrato2: 300 },
      },
    },
  });
  assert.equal(payments.length, 3);
  assert.deepEqual(payments.map((payment) => payment.sourceBank).sort(), [
    "Banco do Brasil",
    "Banco do Brasil",
    "Bradesco",
  ]);
});

test("o reenvio do mesmo banco substitui seus valores sem atingir o banco complementar", () => {
  const updated = buildTreasuryPatch([{
    planName: "Sulamerica",
    occurrences: [
      { paymentDate: "17/09/2026", paymentAmount: "750,00" },
    ],
  }], { sourceBank: "Bradesco" });
  const complementary = buildTreasuryPatch([{
    planName: "Sulamerica",
    occurrences: [
      { paymentDate: "17/09/2026", paymentAmount: "900,00" },
    ],
  }], { sourceBank: "Banco do Brasil" });

  assert.deepEqual(updated.patch["Sulamerica/2026-09-17/Bradesco"], { valorExtrato: 750 });
  assert.deepEqual(complementary.patch["Sulamerica/2026-09-17/Banco do Brasil"], { valorExtrato: 900 });
  assert.equal("valorExtrato2" in updated.patch["Sulamerica/2026-09-17/Bradesco"], false);
});

test("carrega os pagamentos já salvos ao abrir a Tesouraria", async () => {
  const result = await loadTreasuryPayments({
    databaseUrl: "https://exemplo.firebaseio.com/",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        Amil: { "2026-10-01": { Bradesco: { valorExtrato: 125.5 } } },
      }),
    }),
  });
  assert.equal(result.count, 1);
  assert.deepEqual(result.payments[0], {
    planName: "Amil",
    paymentDate: "2026-10-01",
    paymentAmount: 125.5,
    sourceBank: "Bradesco",
  });
});

test("mantém a Tesouraria configurada exclusivamente no Firebase de teste", () => {
  assert.equal(FIREBASE_ENVIRONMENT, "teste");
  assert.equal(FIREBASE_DATABASE_URL, "https://teste-b720c-default-rtdb.firebaseio.com");
});

test("valida a escrita no Firebase sem alterar dados", async () => {
  let request;
  const result = await checkTreasuryFirebase({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 204, text: async () => "" };
    },
  });
  assert.equal(result.connected, true);
  assert.equal(result.environment, "teste");
  assert.equal(request.options.method, "PATCH");
  assert.equal(request.options.body, "{}");
  assert.match(request.url, /^https:\/\/teste-b720c-default-rtdb\.firebaseio\.com\/OFT\/Faturamento\/Tesouraria\.json\?print=silent$/);
});
