const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CONFIG_DOWNLOAD_TIME_PATH,
  CONFIG_DRAFT_PATH,
  loadConfigDownloadDates,
  loadConfigDownloadTimes,
  parseConfigDownloadDates,
  parseConfigDownloadTimes,
  saveConfigDownloadDate,
  saveConfigDownloadTime,
  validIsoDate,
  validTime,
} = require("../config-draft-firebase");

test("valida datas ISO sem aceitar datas inexistentes", () => {
  assert.equal(validIsoDate("2026-10-31"), true);
  assert.equal(validIsoDate("2026-02-31"), false);
  assert.equal(validIsoDate("31/10/2026"), false);
});

test("interpreta as datas salvas por convênio", () => {
  assert.deepEqual(parseConfigDownloadDates({
    Amil: "2026-10-05",
    Caberj: { dataDownloadDemonstrativo: "2026-10-30" },
    Invalido: "31/10/2026",
  }), {
    Amil: "2026-10-05",
    Caberj: "2026-10-30",
  });
});

test("carrega os rascunhos exclusivamente do Firebase de teste", async () => {
  let request;
  const result = await loadConfigDownloadDates({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ Amil: "2026-10-05" }),
      };
    },
  });
  assert.equal(request.options.method, "GET");
  assert.equal(request.url, `https://teste-b720c-default-rtdb.firebaseio.com/${CONFIG_DRAFT_PATH}.json`);
  assert.deepEqual(result.dates, { Amil: "2026-10-05" });
  assert.equal(result.environment, "teste");
});

test("salva a data no convênio sem criar chave aleatória", async () => {
  let request;
  const result = await saveConfigDownloadDate("Caberj Integral", "2026-10-30", {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 204, text: async () => "" };
    },
  });
  assert.equal(request.options.method, "PATCH");
  assert.equal(request.url, `https://teste-b720c-default-rtdb.firebaseio.com/${CONFIG_DRAFT_PATH}.json?print=silent`);
  assert.deepEqual(JSON.parse(request.options.body), { "Caberj Integral": "2026-10-30" });
  assert.equal(result.path, `/${CONFIG_DRAFT_PATH}/Caberj Integral`);
});

test("uma data vazia remove somente o rascunho do convênio", async () => {
  let body;
  await saveConfigDownloadDate("Amil", "", {
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, status: 204, text: async () => "" };
    },
  });
  assert.deepEqual(body, { Amil: null });
});

test("valida e interpreta os horarios salvos em informacao2", () => {
  assert.equal(validTime("02:30"), true);
  assert.equal(validTime("24:00"), false);
  assert.deepEqual(parseConfigDownloadTimes({
    "Porto Seguro": "02:30",
    Caberj: { horaDownloadDemonstrativo: "01:00" },
    Invalido: "2:00",
  }), {
    "Porto Seguro": "02:30",
    Caberj: "01:00",
  });
});

test("carrega os horarios exclusivamente de informacao2", async () => {
  let request;
  const result = await loadConfigDownloadTimes({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ Tesouraria: "07:00" }),
      };
    },
  });
  assert.equal(request.options.method, "GET");
  assert.equal(request.url, `https://teste-b720c-default-rtdb.firebaseio.com/${CONFIG_DOWNLOAD_TIME_PATH}.json`);
  assert.deepEqual(result.times, { Tesouraria: "07:00" });
  assert.equal(result.path, `/${CONFIG_DOWNLOAD_TIME_PATH}`);
});

test("salva o horario no nome do convenio sem criar chave aleatoria", async () => {
  let request;
  const result = await saveConfigDownloadTime("Caberj Integral", "01:30", {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 204, text: async () => "" };
    },
  });
  assert.equal(request.options.method, "PATCH");
  assert.equal(request.url, `https://teste-b720c-default-rtdb.firebaseio.com/${CONFIG_DOWNLOAD_TIME_PATH}.json?print=silent`);
  assert.deepEqual(JSON.parse(request.options.body), { "Caberj Integral": "01:30" });
  assert.equal(result.path, `/${CONFIG_DOWNLOAD_TIME_PATH}/Caberj Integral`);
});
