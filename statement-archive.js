const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_STATEMENT_ARCHIVE_ROOT = "C:\\Users\\Master\\OneDrive\\Área de Trabalho\\demonstrativos de Pagamento anual\\Extratos";
const MONTH_NAMES = [
  "", "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

function validPeriod(month, year) {
  const numericMonth = Number(month);
  const numericYear = Number(year);
  return numericMonth >= 1 && numericMonth <= 12 && numericYear >= 2000 && numericYear <= 9999
    ? { month: numericMonth, year: numericYear }
    : null;
}

function statementPeriod({ matches = [], fileName = "", fallbackMonth = 0, fallbackYear = 0 } = {}) {
  const occurrences = new Map();
  for (const match of matches) {
    for (const occurrence of match.occurrences || []) {
      const date = String(occurrence.paymentDate || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const period = date && validPeriod(date[2], date[3]);
      if (!period) continue;
      const key = `${period.year}-${String(period.month).padStart(2, "0")}`;
      occurrences.set(key, (occurrences.get(key) || 0) + 1);
    }
  }

  const mostFrequent = [...occurrences.entries()].sort((left, right) => (
    right[1] - left[1] || right[0].localeCompare(left[0])
  ))[0]?.[0];
  if (mostFrequent) {
    const [year, month] = mostFrequent.split("-").map(Number);
    return { month, year };
  }

  const name = path.basename(String(fileName || ""));
  const yearFirst = name.match(/(?:^|\D)(20\d{2})[_. -](0?[1-9]|1[0-2])(?:\D|$)/);
  if (yearFirst) return validPeriod(yearFirst[2], yearFirst[1]);
  const monthFirst = name.match(/(?:^|\D)(0?[1-9]|1[0-2])[_. -](20\d{2})(?:\D|$)/);
  if (monthFirst) return validPeriod(monthFirst[1], monthFirst[2]);

  return validPeriod(fallbackMonth, fallbackYear);
}

function archiveFolderName(period) {
  return `${period.year}_${String(period.month).padStart(2, "0")}_${MONTH_NAMES[period.month]}`;
}

function uniqueDestination(folderPath, fileName, buffer) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const destination = path.join(folderPath, suffix === 1 ? fileName : `${baseName} (${suffix})${extension}`);
    if (!fs.existsSync(destination)) return { destination, exists: false };
    if (fs.readFileSync(destination).equals(buffer)) return { destination, exists: true };
  }
  throw new Error(`Não foi possível escolher um nome livre para ${fileName}.`);
}

function archiveStatementPdf({
  fileName,
  base64,
  matches = [],
  fallbackMonth = 0,
  fallbackYear = 0,
  rootDir = DEFAULT_STATEMENT_ARCHIVE_ROOT,
} = {}) {
  const safeName = path.basename(String(fileName || ""));
  if (path.extname(safeName).toLocaleLowerCase("pt-BR") !== ".pdf") {
    return { saved: false, skipped: true, reason: "Somente extratos PDF são arquivados." };
  }

  const buffer = Buffer.from(String(base64 || ""), "base64");
  if (!buffer.length || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("O extrato não é um PDF válido e não pôde ser arquivado.");
  }

  const period = statementPeriod({ matches, fileName: safeName, fallbackMonth, fallbackYear });
  if (!period) {
    throw new Error("Não foi possível identificar o mês e o ano para arquivar o extrato.");
  }

  const folderName = archiveFolderName(period);
  const folderPath = path.join(rootDir, folderName);
  fs.mkdirSync(folderPath, { recursive: true });
  const { destination, exists } = uniqueDestination(folderPath, safeName, buffer);
  if (!exists) fs.writeFileSync(destination, buffer, { flag: "wx" });

  return {
    saved: true,
    alreadyExisted: exists,
    fileName: path.basename(destination),
    folderName,
    path: destination,
  };
}

module.exports = {
  DEFAULT_STATEMENT_ARCHIVE_ROOT,
  archiveFolderName,
  archiveStatementPdf,
  statementPeriod,
};
