const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TREASURY_ASA_PATH,
  loadTreasuryAsaStatuses,
  mergeTreasuryAsaStatuses,
  parseTreasuryAsaStatuses,
  saveTreasuryAsaStatus,
  treasuryAsaPaymentPath,
} = require("../treasury-asa-firebase");

const payment = {
  planName: "Cassi",
  originalPlanName: "CX Assistência",
  paymentDate: "2026-10-23",
  sourceBank: "Bradesco",
  paymentKey: "valorExtrato2",
};

test("usa um nó próprio da aba Tesouraria no Firebase de teste", () => {
  assert.equal(TREASURY_ASA_PATH, "faturamento/demonstrativos/painelControl/AbaTesouraria/informacao1");
  assert.equal(
    treasuryAsaPaymentPath(payment),
    "CX Assistência/2026-10-23/Bradesco/valorExtrato2",
  );
});

test("interpreta e aplica Demonstrado ASA e Quitado ASA ao pagamento correto", () => {
  const statuses = parseTreasuryAsaStatuses({
    "CX Assistência": {
      "2026-10-23": {
        Bradesco: {
          valorExtrato2: { demonstradoASA: true, quitadoASA: true },
        },
      },
    },
  });
  const merged = mergeTreasuryAsaStatuses([payment, {
    planName: "Amil",
    originalPlanName: "Amil",
    paymentDate: "2026-10-05",
    sourceBank: "Banco do Brasil",
    paymentKey: "valorExtrato",
  }], statuses);
  assert.equal(merged[0].demonstradoASA, true);
  assert.equal(merged[0].quitadoASA, true);
  assert.equal(merged[1].demonstradoASA, false);
  assert.equal(merged[1].quitadoASA, false);
});

test("não aceita Quitado ASA sem Demonstrado ASA", async () => {
  await assert.rejects(() => saveTreasuryAsaStatus({
    ...payment,
    demonstradoASA: false,
    quitadoASA: true,
  }, {
    fetchImpl: async () => ({ ok: true, status: 204, text: async () => "" }),
  }), /demonstrado no ASA antes de ser quitado/);
});

test("salva os dois estados sem chave aleatória", async () => {
  let request;
  const result = await saveTreasuryAsaStatus({
    ...payment,
    demonstradoASA: true,
    quitadoASA: false,
  }, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 204, text: async () => "" };
    },
  });
  assert.equal(request.options.method, "PATCH");
  assert.equal(
    request.url,
    `https://teste-b720c-default-rtdb.firebaseio.com/${TREASURY_ASA_PATH}.json?print=silent`,
  );
  assert.deepEqual(JSON.parse(request.options.body), {
    "CX Assistência/2026-10-23/Bradesco/valorExtrato2": {
      demonstradoASA: true,
      quitadoASA: false,
    },
  });
  assert.equal(result.environment, "teste");
});

test("desmarcar Demonstrado ASA remove somente o controle daquele pagamento", async () => {
  let body;
  await saveTreasuryAsaStatus({
    ...payment,
    demonstradoASA: false,
    quitadoASA: false,
  }, {
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, status: 204, text: async () => "" };
    },
  });
  assert.deepEqual(body, {
    "CX Assistência/2026-10-23/Bradesco/valorExtrato2": null,
  });
});

test("carrega o controle exclusivamente do Firebase de teste", async () => {
  let request;
  const result = await loadTreasuryAsaStatuses({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          Cassi: {
            "2026-10-01": {
              Bradesco: {
                valorExtrato: { demonstradoASA: true, quitadoASA: false },
              },
            },
          },
        }),
      };
    },
  });
  assert.equal(request.options.method, "GET");
  assert.equal(request.url, `https://teste-b720c-default-rtdb.firebaseio.com/${TREASURY_ASA_PATH}.json`);
  assert.equal(result.count, 1);
  assert.equal(result.environment, "teste");
});
