const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadReports, parseMoney, parseReport } = require("../report-parser");

test("converte valores monetários brasileiros em centavos", () => {
  assert.equal(parseMoney("R$ 193.243,21"), 19324321);
  assert.equal(parseMoney("0,00"), 0);
  assert.equal(parseMoney("380,00"), 38000);
});

test("interpreta metadados, demonstrativos, downloads e observações", () => {
  const text = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - INTERMEDICA/HAPVIDA
Data do Pagamento informado pelo Convenio: 15/08/2026
Mes/Ano de pagamento solicitado (Data Pag Desejada.txt): AGOSTO 2026
Data de geracao do relatorio: 09/09/2026
Prestador: CLINICA TESTE
Operadora: OPERADORA TESTE
TABELA DE DEMONSTRATIVOS
Numero Processo  Numero Lote  Previsao Pagamento  Valor Producao  Valor Pagamento  PCC (PIS/COFINS/CSLL) IRRF ISS INSS Download
2660532021  1306  15/08/2026  5.550,00  5.400,00  258,08  83,25  0,00  0,00  OK (.xml + .xlsx)
QUANTIDADE DE DEMONSTRATIVOS BAIXADOS POR NUMERO DE PROCESSO
Numero Processo Numero Lote .XML .XLSX Total Situacao
2660532021  1306  1  1  2  COMPLETO
RESUMO DOS SOMATORIOS
Quantidade de demonstrativos (processos): 1
Quantidade de itens/procedimentos pagos: 20
OBSERVACOES
1. Tudo certo.
FIM DO RELATORIO`;
  const report = parseReport(text, "C:\\Claude\\DemonstPagProjeto\\Intermedica\\AGOSTO_2026\\relatorio_09-09-2026.txt", "C:\\Claude");

  assert.equal(report.agreement, "Intermedica");
  assert.equal(report.requestedPeriod, "AGOSTO 2026");
  assert.equal(report.items.length, 1);
  assert.equal(report.items[0].paymentCents, 540000);
  assert.equal(report.downloads[0].xlsx, 1);
  assert.equal(report.totals.taxesCents, 34133);
  assert.equal(report.totals.procedures, 20);
  assert.match(report.observations, /Tudo certo/);
  assert.equal(report.periodMonth, 8);
  assert.equal(report.periodMonthName, "Agosto");
  assert.equal(report.periodYear, 2026);
  assert.ok(report.fullSections.some((section) => section.title.includes("RESUMO DOS SOMATORIOS")));
  assert.match(report.rawText, /FIM DO RELATORIO/);
});

test("preserva seções extras que variam entre planos", () => {
  const text = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - PLANO EXEMPLO
Mes/Ano de pagamento solicitado: 03/2025
Prestador: CLINICA TESTE
INFORMACOES EXCLUSIVAS DO PLANO
Campo adicional: conteúdo variável
Outro dado livre
RESUMO DOS SOMATORIOS
SOMATORIO VALOR PAGAMENTO: 100,00
FIM DO RELATORIO`;
  const report = parseReport(text, "C:\\Claude\\Plano Exemplo\\MARCO_2025\\relatorio.txt", "C:\\Claude");

  assert.equal(report.periodMonth, 3);
  assert.equal(report.periodYear, 2025);
  assert.ok(report.fullSections.some((section) => section.title === "INFORMACOES EXCLUSIVAS DO PLANO"));
  assert.ok(report.fullSections.some((section) => section.content.includes("Campo adicional")));
  assert.ok(report.fullSections.some((section) => section.fields.some((field) => field.label === "Campo adicional")));
});

test("interpreta tabela simplificada e agrupa o valor pago por data", () => {
  const text = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - SULAMERICA
Data do Pagamento informado pelo Convenio: 10/08/2026 | 17/08/2026
Mes/Ano de pagamento desejado: AGOSTO 2026
TABELA DE DEMONSTRATIVOS DE CONTA MEDICA
Data Pagamento       Valor Apresentado      Valor Liberado   Download
10/08/2026                      908,94              908,94   OK (.xml + .pdf)
17/08/2026                  157.589,41          123.187,41   OK (.xml + .pdf)
TOTAL (2 itens)             158.498,35          124.096,35
RESUMO DOS SOMATORIOS
Valor Liberado (efetivamente pago pelo plano) ............ R$ 124.096,35
FIM DO RELATORIO`;
  const report = parseReport(text, "C:\\Claude\\Sulamerica\\AGOSTO_2026\\relatorio.txt", "C:\\Claude");

  assert.equal(report.paymentsByDate.length, 2);
  assert.equal(report.paymentsByDate[0].paymentCents, 90894);
  assert.equal(report.paymentsByDate[1].paymentCents, 12318741);
  assert.equal(report.totals.paymentCents, 12409635);
  assert.equal(report.requestedPeriod, "AGOSTO 2026");
});

test("interpreta DESCRICAO PAGAMENTO de largura fixa com total", () => {
  const text = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - INTERMEDICA/HAPVIDA
Data do Pagamento informado pelo Convenio: 20/09/2026
Data de geracao do relatorio: 06/10/2026
Mes/ano processado: SETEMBRO/2026
DESCRICAO PAGAMENTO
Numero Processo  Numero Lote  Previsao Pagamento  Valor Producao  Valor Pagamento  Download
------------------------------------------------------------------------------------------------
2660630295       1326         20/09/2026          3.500,00        3.500,00         OK (.xml + .xlsx)
2660630252       1325         20/09/2026          680,00          680,00           OK (.xml + .xlsx)
------------------------------------------------------------------------------------------------
TOTAL                                             4.180,00        4.180,00
QTD DEMONSTRATIVOS`;
  const report = parseReport(text, "C:\\Claude\\DemonstPagProjeto\\Intermedica\\SETEMBRO_2026\\relatorio_Intermedica.txt", "C:\\Claude\\DemonstPagProjeto");

  assert.equal(report.title, "RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - INTERMEDICA/HAPVIDA");
  assert.equal(report.paymentDateText, "20/09/2026");
  assert.equal(report.generatedAt, "06/10/2026");
  assert.equal(report.processedPeriod, "SETEMBRO/2026");
  assert.equal(report.paymentDescription.columns.length, 6);
  assert.equal(report.paymentDescription.rows.length, 2);
  assert.equal(report.paymentDescription.total[0], "TOTAL");
  assert.equal(report.paymentsByDate[0].paymentCents, 418000);
});

test("corrige na aba Demonstrativo as colunas monetárias desalinhadas", () => {
  const text = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - INTERMEDICA
Mes/ano processado: OUTUBRO/2026
DESCRICAO PAGAMENTO
Numero Processo Numero Lote  Previsao Pag   Valor Producao  Valor Pagamento        PCC      IRRF     ISS    INSS  Download
------------------------------------------------------------------------------------------------------------------------------------
2660740859      203430       20/10/2026             360,00           360,00      16,74      0,00    0,00    0,00  OK (.xml + .xlsx)
2660737968      1349         20/10/2026             500,00           500,00      23,25      0,00    0,00    0,00  OK (.xml + .xlsx)
2660737746      1348         20/10/2026           7.200,00         7.200,00     334,80    108,00    0,00    0,00  OK (.xml + .xlsx)
QTD DEMONSTRATIVOS`;
  const report = parseReport(text, "C:\\Claude\\Intermedica\\OUTUBRO_2026\\relatorio_Intermedica.txt", "C:\\Claude");

  assert.deepEqual(report.paymentDescription.columns, [
    "Numero Processo", "Numero Lote", "Previsao Pagamento", "Valor Producao", "Valor Pagamento",
    "PCC", "IRRF", "ISS", "INSS", "Download",
  ]);
  assert.equal(report.paymentDescription.rows[0][4], "360,00");
  assert.equal(report.paymentDescription.rows[0][5], "16,74");
  assert.equal(report.paymentDescription.rows[1][5], "23,25");
  assert.equal(report.paymentDescription.rows[2][5], "334,80");
  assert.equal(report.paymentDescription.rows[0][9], "OK (.xml + .xlsx)");
  assert.equal(report.paymentsByDate[0].paymentCents, 806000);
});

test("aceita tabelas separadas por ponto e vírgula ou tabulação", () => {
  const semicolon = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - PLANO A
DESCRICAO PAGAMENTO
Data Pagamento;Valor Apresentado;Valor Liberado;Download
10/10/2026;R$ 500,00;R$ 480,00;OK
QTD DEMONSTRATIVOS`;
  const tabs = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - PLANO B
DESCRICAO PAGAMENTO
Data Pagamento\tValor Apresentado\tValor Liberado\tDownload
11/10/2026\tR$ 900,00\tR$ 875,00\tOK
QTD DEMONSTRATIVOS`;

  const semicolonReport = parseReport(semicolon, "C:\\Claude\\PlanoA\\OUTUBRO_2026\\relatorio.txt", "C:\\Claude");
  const tabReport = parseReport(tabs, "C:\\Claude\\PlanoB\\OUTUBRO_2026\\relatorio.txt", "C:\\Claude");
  assert.equal(semicolonReport.paymentDescription.rows[0][2], "R$ 480,00");
  assert.equal(tabReport.paymentDescription.rows[0][2], "R$ 875,00");
});

test("mantém Caberj e Caberj Integral como convênios distintos", () => {
  const text = `RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO\nMes desejado (Relatorio Controle.txt): OUTUBRO 2026 | Mes/Ano consultado no portal: 09/2026`;
  const caberj = parseReport(text, "C:\\Base\\Caberj\\OUTUBRO_2026\\relatorio_Caberj.txt", "C:\\Base");
  const integral = parseReport(text, "C:\\Base\\CaberjIntegral\\OUTUBRO_2026\\relatorio_CaberjIntegral.txt", "C:\\Base");

  assert.equal(caberj.agreement, "Caberj");
  assert.equal(integral.agreement, "Caberj Integral");
  assert.notEqual(caberj.agreement, integral.agreement);
  assert.equal(caberj.periodMonth, 10);
  assert.equal(caberj.periodYear, 2026);
  assert.equal(integral.periodMonth, 10);
  assert.equal(integral.periodYear, 2026);
});

test("interpreta DESCRICAO PAGAMENTO separada por barras e varias datas", () => {
  const text = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - SULAMERICA
Periodo pesquisado..: 01/09/2026 a 30/09/2026  (SETEMBRO 2026)
Data do Pagamento informado pelo Convenio:
  - 10/09/2026
  - 17/09/2026
Data de geracao do relatorio: 05/10/2026 19:21
DESCRICAO PAGAMENTO
Data Pagamento | Valor Apresentado | Valor Liberado | Download
----------------------------------------------------------------
10/09/2026 | R$ 4.600,00 | R$ 4.600,00 | OK (.xml + .pdf)
17/09/2026 | R$ 189.489,85 | R$ 170.118,09 | OK (.xml + .pdf)
----------------------------------------------------------------
TOTAL | R$ 194.089,85 | R$ 174.718,09 |
QTD DEMONSTRATIVOS`;
  const report = parseReport(text, "C:\\Claude\\DemonstPagProjeto\\Sulamerica\\SETEMBRO_2026\\relatorio_Sulamerica.txt", "C:\\Claude\\DemonstPagProjeto");

  assert.deepEqual(report.paymentDates, ["10/09/2026", "17/09/2026"]);
  assert.equal(report.processedPeriod, "SETEMBRO/2026");
  assert.equal(report.paymentDescription.rows.length, 2);
  assert.equal(report.paymentDescription.total[2], "R$ 174.718,09");
  assert.equal(report.paymentsByDate[1].paymentCents, 17011809);
});

test("ignora bordas ASCII na tabela de DESCRICAO PAGAMENTO", () => {
  const text = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - SULAMERICA
Mes/ano processado: OUTUBRO/2026
DESCRICAO PAGAMENTO
+------------------+----------------------+----------------------+------------------------+
| Data Pagamento   | Valor Apresentado    | Valor Liberado       | Download               |
+------------------+----------------------+----------------------+------------------------+
| 10/10/2026       | R$ 4.600,00          | R$ 4.500,00          | OK (.xml + .pdf)       |
| 17/10/2026       | R$ 1.200,00          | R$ 1.100,00          | OK (.xml + .pdf)       |
+------------------+----------------------+----------------------+------------------------+
| TOTAL            | R$ 5.800,00          | R$ 5.600,00          |                        |
+------------------+----------------------+----------------------+------------------------+
QTD DEMONSTRATIVOS`;
  const report = parseReport(text, "C:\\Claude\\Sulamerica\\OUTUBRO_2026\\relatorio_Sulamerica.txt", "C:\\Claude");

  assert.deepEqual(report.paymentDescription.columns, ["Data Pagamento", "Valor Apresentado", "Valor Liberado", "Download"]);
  assert.equal(report.paymentDescription.rows.length, 2);
  assert.equal(report.paymentDescription.rows[0][2], "R$ 4.500,00");
  assert.equal(report.paymentDescription.total[2], "R$ 5.600,00");
  assert.equal(report.paymentsByDate[1].paymentCents, 110000);
});

test("aceita separadores Markdown e caixas Unicode nas tabelas", () => {
  const markdown = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - PLANO MARKDOWN
DESCRICAO PAGAMENTO
| Data Pagamento | Valor Apresentado | Valor Liberado | Download |
|:----------------|------------------:|---------------:|----------|
| 10/10/2026 | R$ 500,00 | R$ 480,00 | OK |
QTD DEMONSTRATIVOS`;
  const unicode = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - PLANO UNICODE
DESCRICAO PAGAMENTO
┌────────────────┬───────────────────┬────────────────┐
│ Data Pagamento │ Valor Apresentado │ Valor Liberado │
├────────────────┼───────────────────┼────────────────┤
│ 20/10/2026     │ R$ 900,00         │ R$ 875,00      │
└────────────────┴───────────────────┴────────────────┘
QTD DEMONSTRATIVOS`;

  const markdownReport = parseReport(markdown, "C:\\Claude\\Markdown\\OUTUBRO_2026\\relatorio_Markdown.txt", "C:\\Claude");
  const unicodeReport = parseReport(unicode, "C:\\Claude\\Unicode\\OUTUBRO_2026\\relatorio_Unicode.txt", "C:\\Claude");

  assert.deepEqual(markdownReport.paymentDescription.columns, ["Data Pagamento", "Valor Apresentado", "Valor Liberado", "Download"]);
  assert.equal(markdownReport.paymentDescription.rows[0][2], "R$ 480,00");
  assert.deepEqual(unicodeReport.paymentDescription.columns, ["Data Pagamento", "Valor Apresentado", "Valor Liberado"]);
  assert.equal(unicodeReport.paymentDescription.rows[0][2], "R$ 875,00");
});

test("interpreta INFORMACOES GUIAS por data em formatos fixo e separado por barras", () => {
  const fixed = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - INTERMEDICA
INFORMACOES GUIAS
Data de pagamento 20/09/2026
Guia               Valor Informado  Valor Liberado
--------------------------------------------------
288523239          500,00           500,00
292027498          160,00           160,00
--------------------------------------------------
TOTAL (2 guias)    660,00           660,00
OBSERVACOES`;
  const fixedReport = parseReport(fixed, "C:\\Claude\\Intermedica\\SETEMBRO_2026\\relatorio_Intermedica.txt", "C:\\Claude");
  assert.equal(fixedReport.guideInformation.length, 1);
  assert.deepEqual(fixedReport.guideInformation[0].columns, ["Guia", "Valor Informado", "Valor Liberado"]);
  assert.equal(fixedReport.guideInformation[0].rows.length, 2);
  assert.equal(fixedReport.guideInformation[0].total[0], "TOTAL (2 guias)");
  assert.equal(fixedReport.guideInformation[0].guideCount, 2);

  const pipes = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - SULAMERICA
INFORMACOES GUIAS
Data de pagamento: 10/09/2026
Guia | Nome do Beneficiario | Valor Informado | Valor Liberado
--------------------------------------------------------------
212405168 | PACIENTE TESTE | R$ 4.600,00 | R$ 4.600,00
TOTAL | 1 guia(s) | R$ 4.600,00 | R$ 4.600,00
Data de pagamento: 17/09/2026
Guia | Nome do Beneficiario | Valor Informado | Valor Liberado
--------------------------------------------------------------
232250718 | OUTRO PACIENTE | R$ 500,00 | R$ 450,00
TOTAL | 1 guia(s) | R$ 500,00 | R$ 450,00
FIM DO RELATORIO`;
  const pipeReport = parseReport(pipes, "C:\\Claude\\Sulamerica\\SETEMBRO_2026\\relatorio_Sulamerica.txt", "C:\\Claude");
  assert.equal(pipeReport.guideInformation.length, 2);
  assert.equal(pipeReport.guideInformation[1].paymentDate, "17/09/2026");
  assert.equal(pipeReport.guideInformation[0].rows[0][1], "PACIENTE TESTE");
  assert.equal(pipeReport.guideInformation[1].total[3], "R$ 450,00");
  assert.equal(pipeReport.guideInformation[0].guideCount, 1);
});

test("distingue a quantidade de guias da quantidade de linhas", () => {
  const text = `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - INTERMEDICA
INFORMACOES GUIAS
Data de pagamento 20/09/2026
Guia            Valor Informado   Valor Liberado
1001                     100,00           100,00
1001                     200,00           200,00
1002                     150,00           150,00
TOTAL (2 guias)          450,00           450,00
Conferencia contra o Valor Pagamento de 20/09/2026 no portal
(R$ 450,00): CONFERE.
FIM DO RELATORIO`;

  const report = parseReport(text, "C:\\Claude\\Intermedica\\SETEMBRO_2026\\relatorio_Intermedica.txt", "C:\\Claude");

  assert.equal(report.guideInformation[0].rows.length, 3);
  assert.equal(report.guideInformation[0].guideCount, 2);
  assert.deepEqual(report.guideInformation[0].total, ["TOTAL (2 guias)", "450,00", "450,00"]);
});

test("preserva dois demonstrativos da Intermedica no mesmo mês", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "demonstrativos-intermedica-"));
  const folder = path.join(root, "Intermedica", "OUTUBRO_2026");
  fs.mkdirSync(folder, { recursive: true });
  const reportFor = (date, amount) => `
RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO - INTERMEDICA
Data do Pagamento informado pelo Convenio: ${date}
Mes/ano processado: OUTUBRO/2026
DESCRICAO PAGAMENTO
Data Pagamento | Valor Apresentado | Valor Liberado | Download
${date} | R$ ${amount} | R$ ${amount} | OK
QTD DEMONSTRATIVOS`;

  try {
    fs.writeFileSync(path.join(folder, "relatorio_Intermedica_20-10-2026.txt"), reportFor("20/10/2026", "220.732,99"));
    fs.writeFileSync(path.join(folder, "relatorio_Intermedica_30-10-2026.txt"), reportFor("30/10/2026", "660,00"));

    const result = loadReports(root);
    const intermedica = result.reports.filter((report) => report.agreement === "Intermedica");
    assert.equal(intermedica.length, 2);
    assert.deepEqual(intermedica.map((report) => report.paymentDateText).sort(), ["20/10/2026", "30/10/2026"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
