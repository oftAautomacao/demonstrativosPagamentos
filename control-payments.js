const fs = require("node:fs");

function splitRow(line) {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function paymentColumns(line) {
  if (!line.trim().startsWith("|")) return null;
  const headers = splitRow(line).map(normalizeHeader);
  const explicitStatus = headers.indexOf("status");
  const columns = {
    agreement: headers.findIndex((header) => header === "convenios" || header === "convenio"),
    hadPayment: headers.findIndex((header) => header.includes("houve") && header.includes("pagamento")),
    paymentDate: headers.findIndex((header) => header.includes("data") && header.includes("pagamento")),
    imported: headers.findIndex((header) => header === "importacao"),
    notImported: headers.findIndex((header) => header.includes("linhas") && header.includes("nao importadas")),
    treasuryValue: headers.findIndex((header) => (
      header === "valor na tesouraria" || header === "lavor na teouraria"
    )),
    status: explicitStatus >= 0
      ? explicitStatus
      : headers.findIndex((header) => header.startsWith("status download")),
  };
  return Object.values(columns).slice(0, 5).every((index) => index >= 0) ? columns : null;
}

function readControlPayments(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => paymentColumns(line));
  if (headerIndex < 0) {
    throw new Error("A tabela PAGAMENTOS E IMPORTACAOS nao foi encontrada no Relatorio Controle.txt.");
  }
  const columns = paymentColumns(lines[headerIndex]);

  const rows = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) break;
    if (!line.startsWith("|") || /^\|[-|]+\|$/.test(line)) continue;
    const cells = splitRow(line);
    const row = Object.fromEntries(Object.entries(columns).map(([field, position]) => (
      [field, position >= 0 ? cells[position] || "" : ""]
    )));
    if (Object.values(row).every((cell) => !cell)) continue;
    rows.push(row);
  }

  return { rows, count: rows.length };
}

module.exports = { readControlPayments };
