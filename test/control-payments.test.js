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
      { agreement: "Intermedica", hadPayment: "Sim", paymentDate: "20/09/2026", imported: "", notImported: "" },
      { agreement: "Sulamerica", hadPayment: "Sim", paymentDate: "10/09/2026", imported: "Sim", notImported: "Nao" },
    ],
    count: 2,
  });
  assert.deepEqual(fs.readFileSync(filePath), before);
});
