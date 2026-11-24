const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { readControlPayments } = require("../control-payments");

test("le a tabela de pagamentos e importacoes sem alterar o arquivo", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "control-payments-"));
  const filePath = path.join(folder, "Relatorio Controle.txt");
  const sample = [
    "PAGAMENTOS E IMPORTACAOS",
    "_____________________________________________________________________________________________",
    "|  Convenios       | Houve pagamento? | Data Pagamento | Importacao | Linhas Nao Importadas |",
    "|------------------|------------------|----------------|------------|-----------------------|",
    "|  Intermedica     | Sim              | 20/09/2026     |            |                       |",
    "|------------------|------------------|----------------|------------|-----------------------|",
    "|  Sulamerica      | Sim              | 10/09/2026     |    Sim     |        Nao            |",
    "|------------------|------------------|----------------|------------|-----------------------|",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, sample, "utf8");
  const before = fs.readFileSync(filePath);

  assert.deepEqual(readControlPayments(filePath), {
    rows: [
      { agreement: "Intermedica", hadPayment: "Sim", paymentDate: "20/09/2026", imported: "", notImported: "", treasuryValue: "", status: "" },
      { agreement: "Sulamerica", hadPayment: "Sim", paymentDate: "10/09/2026", imported: "Sim", notImported: "Nao", treasuryValue: "", status: "" },
    ],
    count: 2,
  });
  assert.deepEqual(fs.readFileSync(filePath), before);
});

test("le o status mesmo quando as demais colunas nao estao preenchidas", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "control-payments-status-"));
  const filePath = path.join(folder, "Relatorio Controle.txt");
  const sample = [
    "PAGAMENTOS E IMPORTACAOS",
    "| Convenios | Houve pagamento? | Data Pagamento | Importacao | Linhas Nao Importadas | Status                         |",
    "|-----------|-------------------|----------------|------------|------------------------|--------------------------------|",
    "|           |                   |                |            |                        | Erro ao processar o pagamento |",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, sample, "utf8");

  assert.deepEqual(readControlPayments(filePath), {
    rows: [{
      agreement: "",
      hadPayment: "",
      paymentDate: "",
      imported: "",
      notImported: "",
      treasuryValue: "",
      status: "Erro ao processar o pagamento",
    }],
    count: 1,
  });
});

test("usa Status Download como status sem deslocar as colunas seguintes", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "control-payments-download-status-"));
  const filePath = path.join(folder, "Relatorio Controle.txt");
  const sample = [
    "PAGAMENTOS E IMPORTACAOS",
    "| Convenios  | Houve pagamento? | Data Pagamento | Status Download                               | Importacao | Linhas Nao Importadas | Valor na Tesouraria |",
    "|------------|-------------------|----------------|-----------------------------------------------|------------|-----------------------|---------------------|",
    "| Intermedica|                   |                | NAO EXECUTOU - PC ausente em 20/11/2026 05:00 |            |                       | Nao                 |",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, sample, "utf8");

  assert.deepEqual(readControlPayments(filePath), {
    rows: [{
      agreement: "Intermedica",
      hadPayment: "",
      paymentDate: "",
      imported: "",
      notImported: "",
      treasuryValue: "Nao",
      status: "NAO EXECUTOU - PC ausente em 20/11/2026 05:00",
    }],
    count: 1,
  });
});
