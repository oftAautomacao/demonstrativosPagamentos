const test = require("node:test");
const assert = require("node:assert/strict");

const { automaticDownloadDate, nextImportSchedule } = require("../public/config-schedule");

test("calcula as datas de download a partir da competência desejada", () => {
  assert.equal(automaticDownloadDate("Sulamerica", 11, 2026), "2026-11-18");
  assert.equal(automaticDownloadDate("Intermédica", 11, 2026), "2026-11-20");
  for (const plan of ["Fio Saúde", "FioSaude", "Itaú", "Itau", "Porto Seguro", "PortoSeguro"]) {
    assert.equal(automaticDownloadDate(plan, 11, 2026), "2026-11-25");
  }
  assert.equal(automaticDownloadDate("Caberj", 11, 2026), "2026-12-01");
  assert.equal(automaticDownloadDate("Caberj Integral", 11, 2026), "2026-12-01");
});

test("calcula o primeiro dia do mês seguinte na virada do ano", () => {
  assert.equal(automaticDownloadDate("Caberj", 12, 2026), "2027-01-01");
  assert.equal(automaticDownloadDate("Plano sem regra", 11, 2026), "");
});

test("agenda a primeira terça ou quinta no dia do download ou depois", () => {
  assert.equal(nextImportSchedule("2026-11-30"), "01/12/2026");
  assert.equal(nextImportSchedule("2026-12-02"), "03/12/2026");
});

test("mantém o mesmo dia quando o download ocorre na terça ou quinta", () => {
  assert.equal(nextImportSchedule("2026-12-01"), "01/12/2026");
  assert.equal(nextImportSchedule("2026-12-03"), "03/12/2026");
});

test("calcula corretamente a próxima data em viradas de mês e ano", () => {
  assert.equal(nextImportSchedule("2027-12-31"), "04/01/2028");
  assert.equal(nextImportSchedule("2028-02-28"), "29/02/2028");
});

test("ignora datas vazias, mal formatadas ou inexistentes", () => {
  assert.equal(nextImportSchedule(""), "");
  assert.equal(nextImportSchedule("30/11/2026"), "");
  assert.equal(nextImportSchedule("2026-02-30"), "");
});
