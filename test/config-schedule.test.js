const test = require("node:test");
const assert = require("node:assert/strict");

const {
  automaticDownloadDate,
  automaticDownloadTime,
  compareConfigRowsByDownload,
  nextImportSchedule,
} = require("../public/config-schedule");

test("calcula as datas de download a partir da competência desejada", () => {
  assert.equal(automaticDownloadDate("Sulamerica", 11, 2026), "2026-11-20");
  assert.equal(automaticDownloadDate("Intermédica", 11, 2026), "2026-11-20");
  for (const plan of ["Fio Saúde", "FioSaude", "Itaú", "Itau", "Porto Seguro", "PortoSeguro"]) {
    assert.equal(automaticDownloadDate(plan, 11, 2026), "2026-11-25");
  }
  assert.equal(automaticDownloadDate("Caberj", 11, 2026), "2026-12-01");
  assert.equal(automaticDownloadDate("Caberj Integral", 11, 2026), "2026-12-01");
  assert.equal(automaticDownloadDate("Varredura Anterior", 11, 2026), "2026-12-01");
  assert.equal(automaticDownloadDate("Tesouraria", 11, 2026), "2026-12-02");
});

test("define os horarios de download dos convenios e linhas operacionais", () => {
  assert.deepEqual({
    fioSaude: automaticDownloadTime("Fio Saúde"),
    portoSeguro: automaticDownloadTime("Porto Seguro"),
    itau: automaticDownloadTime("Itaú"),
    caberj: automaticDownloadTime("Caberj"),
    caberjIntegral: automaticDownloadTime("Caberj Integral"),
    sulamerica: automaticDownloadTime("Sulamerica"),
    intermedica: automaticDownloadTime("Intermédica"),
    varredura: automaticDownloadTime("Varredura Anterior"),
    tesouraria: automaticDownloadTime("Tesouraria"),
  }, {
    fioSaude: "01:00",
    portoSeguro: "02:30",
    itau: "02:00",
    caberj: "01:00",
    caberjIntegral: "01:30",
    sulamerica: "01:00",
    intermedica: "02:00",
    varredura: "02:00",
    tesouraria: "07:00",
  });
});

test("ordena planos por data, horario e nome mantendo linhas operacionais no topo", () => {
  const rows = [
    { agreement: "Fio Saúde", downloadDate: "2026-11-25", downloadTime: "01:00" },
    { agreement: "Itaú", downloadDate: "2026-11-25", downloadTime: "02:00" },
    { agreement: "Porto Seguro", downloadDate: "2026-11-25", downloadTime: "02:30" },
    { agreement: "Sulamerica", downloadDate: "2026-11-20", downloadTime: "01:00" },
    { agreement: "Intermedica", downloadDate: "2026-11-20", downloadTime: "02:00" },
    { agreement: "Tesouraria", systemRow: true, systemOrder: 1, downloadDate: "2026-12-02", downloadTime: "07:00" },
    { agreement: "Varredura Anterior", systemRow: true, systemOrder: 0, downloadDate: "2026-12-01", downloadTime: "02:00" },
  ];

  assert.deepEqual(rows.sort(compareConfigRowsByDownload).map((row) => row.agreement), [
    "Varredura Anterior",
    "Tesouraria",
    "Sulamerica",
    "Intermedica",
    "Fio Saúde",
    "Itaú",
    "Porto Seguro",
  ]);
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
