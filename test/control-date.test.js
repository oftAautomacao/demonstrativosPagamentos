const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readControlDate, writeControlDate } = require("../control-date");

test("lê a Data Desejada com mês e ano", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "controle-data-"));
  const filePath = path.join(folder, "Relatorio Controle.txt");
  fs.writeFileSync(filePath, "\uFEFF\nDATA DESEJADA:   Setembro 2026\n\nCONTEUDO", "utf8");

  assert.deepEqual(readControlDate(filePath), { month: 9, year: 2026, value: "Setembro 2026" });
});

test("edita somente o valor e preserva BOM, espaços, quebras e restante do arquivo", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "controle-data-"));
  const filePath = path.join(folder, "Relatorio Controle.txt");
  const original = "\uFEFF\nDATA DESEJADA:   Setembro 2026  \r\n\r\nCONFIGURACAO\r\nLinha final\r\n";
  fs.writeFileSync(filePath, original, "utf8");

  assert.deepEqual(writeControlDate(filePath, 3, 2027), { month: 3, year: 2027, value: "Março 2027" });
  const updated = fs.readFileSync(filePath);
  const expected = Buffer.from(original.replace("Setembro 2026", "Março 2027"), "utf8");
  assert.deepEqual(updated, expected);
});

test("não altera o arquivo quando mês ou ano são inválidos", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "controle-data-"));
  const filePath = path.join(folder, "Relatorio Controle.txt");
  const original = "DATA DESEJADA:   Setembro 2026\n";
  fs.writeFileSync(filePath, original, "utf8");

  assert.throws(() => writeControlDate(filePath, 13, 2027), /mês válido/);
  assert.throws(() => writeControlDate(filePath, 9, 27), /ano válido/);
  assert.equal(fs.readFileSync(filePath, "utf8"), original);
});
