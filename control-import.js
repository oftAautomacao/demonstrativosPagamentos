const fs = require("node:fs");

const HEADER_PATTERN = /^\|\s*Convenios\s*\|\s*Executar Importacao\s*\|\s*Agendamento\s*\|\s*$/i;
const DIVIDER = "_".repeat(58);
const SEPARATOR = `|${"-".repeat(18)}|${"-".repeat(22)}|${"-".repeat(14)}|`;

function normalizeExecution(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  if (normalized === "sim") return "Sim";
  if (normalized === "nao") return "Nao";
  throw new Error("Executar Importacao deve ser 'Sim' ou 'Nao'.");
}

function locateTable(text) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => HEADER_PATTERN.test(line.trim()));
  if (headerIndex < 0) {
    throw new Error("A tabela CONFIGURACAO IMPORTACAO nao foi encontrada no Relatorio Controle.txt.");
  }

  let startIndex = headerIndex;
  if (headerIndex > 0 && /^_+$/.test(lines[headerIndex - 1].trim())) startIndex = headerIndex - 1;

  let endIndex = headerIndex + 1;
  while (endIndex < lines.length) {
    const line = lines[endIndex].trim();
    if (!line || (!/^\|.*\|$/.test(line) && !/^_+$/.test(line))) break;
    endIndex += 1;
  }

  return { lines, newline, headerIndex, startIndex, endIndex };
}

function parseRows(lines, headerIndex, endIndex) {
  const rows = [];
  for (let index = headerIndex + 1; index < endIndex; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("|") || /^\|[-|]+\|$/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3 || !cells[0]) continue;
    rows.push({
      agreement: cells[0],
      execute: normalizeExecution(cells[1]),
      schedule: cells[2],
    });
  }
  return rows;
}

function readImportConfig(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const table = locateTable(text);
  const rows = parseRows(table.lines, table.headerIndex, table.endIndex);
  return { rows, count: rows.length };
}

function validateRows(rows) {
  if (!Array.isArray(rows)) throw new Error("A lista de configuracoes e invalida.");
  const names = new Set();
  return rows.map((row, index) => {
    const agreement = String(row?.agreement || "").trim();
    const execute = normalizeExecution(row?.execute);
    const schedule = String(row?.schedule || "").trim();
    if (!agreement) throw new Error(`Informe o convenio da linha ${index + 1}.`);
    if (agreement.length > 16) throw new Error(`O convenio da linha ${index + 1} deve ter no maximo 16 caracteres.`);
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(schedule)) {
      throw new Error(`O agendamento da linha ${index + 1} deve estar no formato DD/MM/AAAA.`);
    }
    const [day, month, year] = schedule.split("/").map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      throw new Error(`O agendamento da linha ${index + 1} nao e uma data valida.`);
    }
    const key = agreement.toLocaleLowerCase("pt-BR");
    if (names.has(key)) throw new Error(`O convenio '${agreement}' esta repetido.`);
    names.add(key);
    return { agreement, execute, schedule };
  });
}

function buildTable(rows) {
  const output = [
    DIVIDER,
    "|  Convenios       | Executar Importacao  | Agendamento  |",
    SEPARATOR,
  ];
  for (const row of rows) {
    output.push(`|  ${row.agreement.padEnd(16)}|        ${row.execute.padEnd(14)}| ${row.schedule.padEnd(13)}|`);
    output.push(SEPARATOR);
  }
  return output;
}

function writeImportConfig(filePath, inputRows) {
  const rows = validateRows(inputRows);
  const original = fs.readFileSync(filePath, "utf8");
  const table = locateTable(original);
  const updatedLines = [
    ...table.lines.slice(0, table.startIndex),
    ...buildTable(rows),
    ...table.lines.slice(table.endIndex),
  ];
  const updated = updatedLines.join(table.newline);
  if (updated !== original) fs.writeFileSync(filePath, updated, "utf8");
  return { rows, count: rows.length };
}

module.exports = {
  readImportConfig,
  writeImportConfig,
  validateRows,
};
