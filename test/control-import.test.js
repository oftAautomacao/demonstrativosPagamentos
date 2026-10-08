const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { readImportConfig, writeImportConfig } = require("../control-import");

const sample = [
  "RELATORIO CONTROLE",
  "DATA DESEJADA:   Setembro 2026",
  "",
  "CONFIGURACAO IMPORTACAO",
  "",
  "__________________________________________________________",
  "|  Convenios       | Executar Importacao  | Agendamento  |",
  "|------------------|----------------------|--------------|",
  "|  Intermedica     |        Nao           | 21/10/2026   |",
  "|------------------|----------------------|--------------|",
  "|  Sulamerica      |        Sim           | 19/10/2026   |",
  "|------------------|----------------------|--------------|",
  "",
  "PAGAMENTO E/OU FORAM IMPORTADOS",
  "NAO ALTERAR ESTA PARTE",
  "",
].join("\n");

function withFile(callback) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "control-import-"));
  const filePath = path.join(folder, "Relatorio Controle.txt");
  fs.writeFileSync(filePath, sample, "utf8");
  return callback(filePath);
}

test("le as linhas da tabela de configuracao", () => withFile((filePath) => {
  assert.deepEqual(readImportConfig(filePath).rows, [
    { agreement: "Intermedica", execute: "Nao", schedule: "21/10/2026" },
    { agreement: "Sulamerica", execute: "Sim", schedule: "19/10/2026" },
  ]);
}));

test("salva a tabela e preserva o restante do arquivo", () => withFile((filePath) => {
  writeImportConfig(filePath, [
    { agreement: "Intermedica", execute: "Sim", schedule: "22/10/2026" },
    { agreement: "Amil", execute: "Nao", schedule: "23/10/2026" },
  ]);
  const updated = fs.readFileSync(filePath, "utf8");
  assert.match(updated, /\|  Amil\s+\|/);
  assert.match(updated, /PAGAMENTO E\/OU FORAM IMPORTADOS\nNAO ALTERAR ESTA PARTE/);
  assert.deepEqual(readImportConfig(filePath).rows[0], {
    agreement: "Intermedica", execute: "Sim", schedule: "22/10/2026",
  });
}));

test("nao reformata o arquivo ao salvar os mesmos dados", () => withFile((filePath) => {
  const before = fs.readFileSync(filePath);
  const rows = readImportConfig(filePath).rows;
  writeImportConfig(filePath, rows);
  assert.deepEqual(fs.readFileSync(filePath), before);
}));

test("recusa datas invalidas e convenios repetidos", () => withFile((filePath) => {
  assert.throws(() => writeImportConfig(filePath, [
    { agreement: "Amil", execute: "Sim", schedule: "31/02/2026" },
  ]), /data valida/);
  assert.throws(() => writeImportConfig(filePath, [
    { agreement: "Amil", execute: "Sim", schedule: "20/10/2026" },
    { agreement: "amil", execute: "Nao", schedule: "21/10/2026" },
  ]), /repetido/);
}));
