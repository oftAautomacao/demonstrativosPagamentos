const fs = require("node:fs");

const MONTH_NAMES = [
  "",
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const DESIRED_DATE_PATTERN = /^([\t ]*DATA DESEJADA[\t ]*:[\t ]*)([^\r\n]*?)([\t ]*)(\r?\n|$)/im;

function normalizedMonth(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function parseDesiredDate(value) {
  const match = String(value || "").trim().match(/^([^\s]+)\s+(\d{4})$/u);
  if (!match) throw new Error("O campo DATA DESEJADA deve estar no formato 'Mês Ano'.");

  const month = MONTH_NAMES.findIndex((name) => normalizedMonth(name) === normalizedMonth(match[1]));
  const year = Number(match[2]);
  if (month < 1 || !Number.isInteger(year)) {
    throw new Error("O campo DATA DESEJADA possui um mês ou ano inválido.");
  }

  return { month, year, value: `${MONTH_NAMES[month]} ${year}` };
}

function readControlDate(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(DESIRED_DATE_PATTERN);
  if (!match) throw new Error("O campo DATA DESEJADA não foi encontrado no Relatorio Controle.txt.");
  return parseDesiredDate(match[2]);
}

function writeControlDate(filePath, month, year) {
  const monthNumber = Number(month);
  const yearNumber = Number(year);
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error("Selecione um mês válido.");
  }
  if (!Number.isInteger(yearNumber) || yearNumber < 1900 || yearNumber > 9999) {
    throw new Error("Informe um ano válido com quatro dígitos.");
  }

  const originalBytes = fs.readFileSync(filePath);
  const text = originalBytes.toString("utf8");
  const match = DESIRED_DATE_PATTERN.exec(text);
  if (!match) throw new Error("O campo DATA DESEJADA não foi encontrado no Relatorio Controle.txt.");

  const value = `${MONTH_NAMES[monthNumber]} ${yearNumber}`;
  const valueStart = match.index + match[1].length;
  const valueEnd = valueStart + match[2].length;
  const byteStart = Buffer.byteLength(text.slice(0, valueStart), "utf8");
  const byteEnd = Buffer.byteLength(text.slice(0, valueEnd), "utf8");
  const updatedBytes = Buffer.concat([
    originalBytes.subarray(0, byteStart),
    Buffer.from(value, "utf8"),
    originalBytes.subarray(byteEnd),
  ]);
  if (!updatedBytes.equals(originalBytes)) fs.writeFileSync(filePath, updatedBytes);

  return { month: monthNumber, year: yearNumber, value };
}

module.exports = {
  MONTH_NAMES,
  parseDesiredDate,
  readControlDate,
  writeControlDate,
};
