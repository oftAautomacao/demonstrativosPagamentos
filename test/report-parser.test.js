const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMoney, parseReport } = require("../report-parser");

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
