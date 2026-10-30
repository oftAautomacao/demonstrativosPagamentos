const test = require("node:test");
const assert = require("node:assert/strict");
const {
  analyzeStatementText,
  buildPlanCandidates,
  detectStatementBank,
} = require("../statement-analyzer");

test("identifica o banco pelo nome do PDF antes dos convênios presentes no extrato", () => {
  assert.equal(detectStatementBank("Extrato Bradesco Oftallcin 10-2026.pdf", "Cassi Banco do Brasil"), "Bradesco");
  assert.equal(detectStatementBank("Extrato BB Oftallcin 10-2026.pdf", "Bradesco Saúde"), "Banco do Brasil");
});

test("identifica o banco pelo cabeçalho quando o nome do arquivo é genérico", () => {
  assert.equal(detectStatementBank("extrato.pdf", "SISBB - Sistema de Informações Banco do Brasil"), "Banco do Brasil");
  assert.equal(detectStatementBank("extrato.pdf", "Bradesco Net Empresa\nExtrato de conta"), "Bradesco");
});

test("identifica os convênios pagadores usando nome e operadora", () => {
  const candidates = buildPlanCandidates([
    { agreement: "Intermedica", operator: "Hapvida Assistência Médica", title: "RELATORIO - INTERMEDICA/HAPVIDA" },
    { agreement: "Sulamerica", operator: "Sul América Companhia de Seguro Saúde", title: "RELATORIO - SULAMERICA" },
    { agreement: "Unimed Fortaleza", operator: "Unimed Fortaleza", title: "RELATORIO - UNIMED FORTALEZA" },
  ]);
  const result = analyzeStatementText(`
01/10/2026 PIX RECEBIDO HAPVIDA ASSISTENCIA MEDICA 12.450,00
03/10/2026 TED SUL AMERICA CIA SEGURO SAUDE 8.100,00
04/10/2026 PAGAMENTO FORNECEDOR SEM RELACAO 200,00
`, candidates);

  assert.deepEqual(result.matches.map((item) => item.planName), ["Intermédica", "Sulamerica"]);
  assert.match(result.matches[0].occurrences[0].evidence, /HAPVIDA/);
});

test("não confunde palavras genéricas de saúde com um convênio", () => {
  const candidates = buildPlanCandidates([
    { agreement: "Plano Saúde", operator: "Operadora Médica", title: "" },
    { agreement: "Camed", operator: "Camed Saúde", title: "" },
  ]);
  const result = analyzeStatementText("02/10/2026 PAGAMENTO SERVICOS MEDICOS 500,00", candidates);
  assert.deepEqual(result.matches, []);
});

test("preserva pagamentos repetidos do mesmo convênio", () => {
  const candidates = buildPlanCandidates([], ["Camed"]);
  const text = Array.from({ length: 8 }, (_, index) => `${index + 1}/10 CAMED CREDITO ${index},00`).join("\n");
  const result = analyzeStatementText(text, candidates);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].occurrences.length, 8);
});

test("preserva créditos idênticos do mesmo plano como pagamentos separados", () => {
  const candidates = buildPlanCandidates();
  const result = analyzeStatementText(`
01/10/2026
PIX RECEBIDO
REM: SUL AMERICA COMPANHIA
1001
500,00
1.000,00
01/10/2026
PIX RECEBIDO
REM: SUL AMERICA COMPANHIA
1002
500,00
1.500,00
`, candidates);

  const sulamerica = result.matches.find((item) => item.planName === "Sulamerica");
  assert.equal(sulamerica.occurrences.length, 2);
  assert.deepEqual(sulamerica.occurrences.map((item) => item.paymentAmount), ["500,00", "500,00"]);
});

test("usa o catálogo fixo mesmo sem relatórios cadastrados", () => {
  const candidates = buildPlanCandidates();
  const result = analyzeStatementText(`
01/10 PIX RECEBIDO AMIL ASSISTENCIA MEDICA 100,00
02/10 CREDITO POSTAL SAUDE 200,00
03/10 TED PREVENT SENIOR PRIVATE OPERADORA 300,00
04/10 CREDITO UNIMED RIO COOPERATIVA TRAB MEDICO 400,00
`, candidates);

  assert.deepEqual(result.matches.map((item) => item.planName), ["Amil", "Postal Saúde", "Prevent Senior", "Unimed"]);
});

test("reconhece razões sociais truncadas e nomes separados entre linhas do PDF", () => {
  const candidates = buildPlanCandidates();
  const result = analyzeStatementText(`
10/10 PIX CAIXA DE ASSISTENCIA DOS FUNCION
11/10 TED CAIXA PREVIDENCIA ASSIST SERVIDORES FUNDACAO NAC
12/10 CREDITO CAIXA DE ASSISTENCIA
OSWALDO CRUZ
13/10 S U L A M E R I C A CIA SEGURO SAUDE
`, candidates);

  assert.deepEqual(result.matches.map((item) => item.planName), ["Capesesp", "Cassi", "Fio Saúde", "Sulamerica"]);
});

test("distingue convênios com nomes semelhantes", () => {
  const candidates = buildPlanCandidates();
  const result = analyzeStatementText(`
01/10 BRADESCO OPERADORA DE PLANOS 100,00
02/10 BRADESCO SAUDE SA 200,00
03/10 CABERJ INTEGRAL SAUDE 300,00
04/10 CAIXA DE ASSISTENCIA A SAUDE CABERJ 400,00
`, candidates);

  assert.deepEqual(result.matches.map((item) => item.planName), [
    "Bradesco Operadora",
    "Bradesco Saúde",
    "Caberj",
    "Caberj Integral Saúde",
  ]);
});

test("ignora nomes de convênios presentes em débitos do Banco do Brasil", () => {
  const candidates = buildPlanCandidates();
  const result = analyzeStatementText(`
01/10/2026
0000
14134 755 Crédito CASSI
170.347
31.686,41 C
33.719.485/0001-27 CAIXA DE ASSISTENCI
01/10/2026
0000
13105 109 Pagamento de Boleto
100.108
3.235,25 D
AMIL ASSISTENCIA ME
01/10/2026
0000
13105 109 Pagamento de Boleto
100.111
3.018,26 D
CONDOMINIO GERAL PORTOGALO
`, candidates);

  assert.deepEqual(result.matches.map((item) => item.planName), ["Cassi"]);
  assert.equal(result.matches[0].occurrences[0].paymentDate, "01/10/2026");
  assert.equal(result.matches[0].occurrences[0].paymentAmount, "31.686,41");
});

test("usa os créditos e abreviações reais do extrato Bradesco", () => {
  const candidates = buildPlanCandidates();
  const result = analyzeStatementText(`
PGTO.SINISTRO AP/CERTIF.
1153374
985,40
1.091,23
RECEB POR FORNECIMENTO
MEDISERVICE OPERADORA PLANOS
SAU
1153375
1.722,80
2.814,03
TED-TRANSF ELET DISPON
REMET.CAIXA A. A. SAUDE
1005431
45.286,73
45.890,90
TED-TRANSF ELET DISPON
REMET.CABERJ I. S. S. A
1037400
3.364,64
49.255,54
PIX ENVIADO
DES: AMIL ASSISTENCIA MED
1031165
-48.000,00
1.255,54
`, candidates);

  assert.deepEqual(result.matches.map((item) => item.planName), [
    "Caberj Integral Saúde",
    "Caixa de Assistência",
    "Mediservice",
  ]);
  const mediservice = result.matches.find((item) => item.planName === "Mediservice");
  assert.equal(mediservice.occurrences[0].paymentAmount, "1.722,80");
});

test("mantém caixas assistenciais genéricas sem atribuir um plano", () => {
  const candidates = buildPlanCandidates();
  const result = analyzeStatementText(`
30/10/2026
TED-TRANSF ELET DISPON
REMET.CAIXA ASSISTENCIAL
1001
2.500,00
5.000,00
`, candidates);

  assert.deepEqual(result.matches.map((item) => item.planName), ["Caixa de Assistência"]);
  assert.equal(result.matches[0].occurrences[0].paymentAmount, "2.500,00");
});
