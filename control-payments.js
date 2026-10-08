const fs = require("node:fs");

const PAYMENTS_HEADER_PATTERN = /^\|\s*Convenios\s*\|\s*Houve pagamento\?\s*\|\s*Data Pagamento\s*\|\s*Importacao\s*\|\s*Linhas Nao Importadas\s*\|\s*$/i;

function readControlPayments(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => PAYMENTS_HEADER_PATTERN.test(line.trim()));
  if (headerIndex < 0) {
    throw new Error("A tabela PAGAMENTOS E IMPORTACAOS nao foi encontrada no Relatorio Controle.txt.");
  }

  const rows = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) break;
    if (!line.startsWith("|") || /^\|[-|]+\|$/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 5 || !cells[0]) continue;
    rows.push({
      agreement: cells[0],
      hadPayment: cells[1],
      paymentDate: cells[2],
      imported: cells[3],
      notImported: cells[4],
    });
  }

  return { rows, count: rows.length };
}

module.exports = { readControlPayments };
