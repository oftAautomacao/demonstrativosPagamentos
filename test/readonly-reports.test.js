const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseImportTables, parseMedicalTable, readReadonlyReports } = require("../readonly-reports");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "readonly-reports-"));
  const intermedica = path.join(root, "Intermedica", "SETEMBRO_2026");
  const sulamerica = path.join(root, "Sulamerica", "SETEMBRO_2026");
  fs.mkdirSync(intermedica, { recursive: true });
  fs.mkdirSync(sulamerica, { recursive: true });
  fs.writeFileSync(path.join(intermedica, "relatorio Guia_20-09-2026.txt"), "CONTA MÉDICA\nconteúdo integral", "utf8");
  fs.writeFileSync(path.join(sulamerica, "relatorio Importacao_17-09-2026.txt"), "IMPORTAÇÃO\nresultado integral", "utf8");
  fs.writeFileSync(path.join(sulamerica, "relatorio_Sulamerica.txt"), "RELATÓRIO PRINCIPAL", "utf8");
  return root;
}

test("lê somente relatórios de conta médica por convênio", () => {
  const root = fixture();
  try {
    const result = readReadonlyReports(root, "medical");
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].planName, "Intermedica");
    assert.equal(result.documents[0].reportDate, "20/09/2026");
    assert.equal(result.documents[0].periodLabel, "Setembro 2026");
    assert.match(result.documents[0].rawText, /conteúdo integral/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("lê somente relatórios de importação e preserva o texto original", () => {
  const root = fixture();
  try {
    const result = readReadonlyReports(root, "import");
    assert.equal(result.documents.length, 1);
    assert.equal(result.documents[0].planName, "Sulamerica");
    assert.equal(result.documents[0].fileName, "relatorio Importacao_17-09-2026.txt");
    assert.equal(result.documents[0].rawText, "IMPORTAÇÃO\nresultado integral");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("recusa um tipo de relatório desconhecido", () => {
  const root = fixture();
  try {
    assert.throws(() => readReadonlyReports(root, "outro"), /inválido/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("interpreta a tabela de conta médica separada por barras", () => {
  const table = parseMedicalTable([
    "RELATORIO DE GUIAS - SULAMERICA",
    "CodConvenio | Guia | TUSS | Valor | Valor Informado | Data | Nome",
    "43 | 212405168 | XXX | R$ 4.600,00 | R$ 4.600,00 | 10/11/2025 | PACIENTE TESTE",
    "TOTAL | 1 linhas | | R$ 4.600,00 | R$ 4.600,00 | |",
    "Conferencia: CONFERE",
  ].join("\n"));

  assert.deepEqual(table.columns, ["CodConvenio", "Guia", "TUSS", "Valor", "Valor Informado", "Glosa", "Data", "Nome"]);
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0][5], "R$ 0,00");
  assert.equal(table.rows[0][7], "PACIENTE TESTE");
  assert.equal(table.total[3], "R$ 4.600,00");
});

test("interpreta a tabela de conta médica em largura fixa", () => {
  const table = parseMedicalTable([
    "CodConvenio Guia          TUSS                 Valor Valor Informado  Filme   Qtde  CodGosa  ValorAux1  ValorAux2  ValorAux3  ValorInst Data        Nome",
    "43          7700015605    XXX              R$ 271,63       R$ 271,63      0      1        0          0          0          0          0 22/01/2026  PACIENTE TESTE",
    "TOTAL (1 linhas)                           R$ 271,63       R$ 271,63",
    "Conferencia: CONFERE",
  ].join("\n"));

  assert.equal(table.columns.length, 15);
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0][3], "R$ 271,63");
  assert.equal(table.rows[0][5], "R$ 0,00");
  assert.equal(table.rows[0][14], "PACIENTE TESTE");
  assert.equal(table.total[4], "R$ 271,63");
});

test("interpreta as duas tabelas principais do relatório de importação", () => {
  const tables = parseImportTables([
    '"LINHAS NAO IMPORTADAS"',
    "______________________________________________________________________",
    "| Data | Paciente | Numero Guia | Referencia Tuss | Valor Recebido | Importado | Erro |",
    "|------|----------|-------------|-----------------|----------------|-----------|------|",
    "| 02/07/2026 | PACIENTE UM | 7700016730 | 64617270 | 276,20 | Nao | Guia incluida, valor nao |",
    "| | | | | | | lancado |",
    "______________________________________________________________________",
    "Soma das 1 linhas: R$ 276,20",
    '"PACIENTES INEXISTENTE OU VALOR INCORRETO"',
    "Guia          Nome do Beneficiario          Valor Informado   Valor Liberado   Falta      Status",
    "----------------------------------------------------------------------------------------------------------------",
    "7700016730    Paciente Um                          276,20             0,00     276,20     Valor nao lancado",
    "----------------------------------------------------------------------------------------------------------------",
    "Total em aberto: R$ 276,20",
  ].join("\n"));

  assert.equal(tables.notImported.rows.length, 1);
  assert.equal(tables.notImported.rows[0][6], "Guia incluida, valor nao lancado");
  assert.equal(tables.notImported.total[4], "R$ 276,20");
  assert.equal(tables.invalidPatients.rows.length, 1);
  assert.equal(tables.invalidPatients.rows[0][1], "Paciente Um");
  assert.equal(tables.invalidPatients.total[4], "R$ 276,20");
});
