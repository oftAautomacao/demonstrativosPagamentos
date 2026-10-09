const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { decodeReport } = require("./report-parser");

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const TYPE_PATTERNS = {
  medical: /^relatorio[\s_-]+guia[\s_-]*(\d{2})-(\d{2})-(\d{4})\.txt$/i,
  import: /^relatorio[\s_-]+importacao[\s_-]*(\d{2})-(\d{2})-(\d{4})\.txt$/i,
};

function normalizedFileName(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function periodLabel(folderName) {
  const match = String(folderName).match(/^([A-Za-zÀ-ÿ]+)[_-](\d{4})$/);
  if (!match) return folderName.replace(/_/g, " ");
  const month = match[1].toLocaleLowerCase("pt-BR");
  return `${month.charAt(0).toLocaleUpperCase("pt-BR")}${month.slice(1)} ${match[2]}`;
}

function clean(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

function normalize(value = "") {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function splitPipeRow(line) {
  const values = line.split("|").map(clean);
  if (!values[0]) values.shift();
  if (!values.at(-1)) values.pop();
  return values;
}

function parseFixedMedicalRow(line, extended) {
  const money = "(?:R\\$\\s*)?[\\d.]+,\\d{2}";
  const simplePattern = new RegExp(`^\\s*(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(${money})\\s+(${money})\\s+(\\d{2}\\/\\d{2}\\/\\d{4})(?:\\s+(.*?))?\\s*$`);
  const extendedPattern = new RegExp(`^\\s*(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(${money})\\s+(${money})\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\S+)\\s+(\\d{2}\\/\\d{2}\\/\\d{4})(?:\\s+(.*?))?\\s*$`);
  const match = line.match(extended ? extendedPattern : simplePattern);
  return match ? match.slice(1).map(clean) : null;
}

function parseFixedMedicalTotal(line, columns) {
  const countMatch = line.match(/TOTAL\s*(?:\((\d+)\s+linhas?\)|\s+(\d+)\s+linhas?)/i);
  const amounts = line.match(/(?:R\$\s*)?[\d.]+,\d{2}/g) || [];
  const total = Array.from({ length: columns.length }, () => "");
  total[0] = "TOTAL";
  if (countMatch) total[1] = `${countMatch[1] || countMatch[2]} linhas`;
  const valueIndex = columns.indexOf("Valor");
  const informedIndex = columns.indexOf("Valor Informado");
  if (valueIndex >= 0) total[valueIndex] = clean(amounts[0] || "");
  if (informedIndex >= 0) total[informedIndex] = clean(amounts[1] || "");
  return total;
}

function parseBrazilianMoney(value) {
  const normalized = String(value || "")
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : null;
}

function formatBrazilianCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value).replace(/\s/g, " ");
}

function addMedicalGlosa(table) {
  const normalizedColumns = table.columns.map(normalize);
  const valueIndex = normalizedColumns.findIndex((column) => column === "valor");
  const informedIndex = normalizedColumns.findIndex((column) => column === "valor informado");
  if (valueIndex < 0 || informedIndex < 0) return table;

  const insertAt = informedIndex + 1;
  const withGlosa = (values) => {
    const result = [...values];
    const value = parseBrazilianMoney(values[valueIndex]);
    const informed = parseBrazilianMoney(values[informedIndex]);
    result.splice(insertAt, 0, value === null || informed === null ? "" : formatBrazilianCurrency(informed - value));
    return result;
  };

  const columns = [...table.columns];
  columns.splice(insertAt, 0, "Glosa");
  return {
    columns,
    rows: table.rows.map(withGlosa),
    total: table.total?.length ? withGlosa(table.total) : [],
  };
}

function parseMedicalTable(rawText = "") {
  const lines = String(rawText).replace(/\r\n?/g, "\n").split("\n");
  const headerIndex = lines.findIndex((line) => {
    const value = normalize(line);
    return value.includes("codconvenio") && value.includes("guia") && value.includes("tuss") && value.includes("valor");
  });
  if (headerIndex < 0) return { columns: [], rows: [], total: [] };

  const header = lines[headerIndex];
  const pipeDelimited = header.includes("|");
  const extended = normalize(header).includes("filme") || normalize(header).includes("codgosa");
  const columns = pipeDelimited
    ? splitPipeRow(header)
    : extended
      ? ["CodConvenio", "Guia", "TUSS", "Valor", "Valor Informado", "Filme", "Qtde", "CodGosa", "ValorAux1", "ValorAux2", "ValorAux3", "ValorInst", "Data", "Nome"]
      : ["CodConvenio", "Guia", "TUSS", "Valor", "Valor Informado", "Data", "Nome"];
  const rows = [];
  let total = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (!clean(line) || /^\s*[-=]{5,}\s*$/.test(line)) continue;
    if (/^\s*(conferencia|obs\.?\s*:)/i.test(line)) break;
    if (/^\s*total\b/i.test(line)) {
      total = pipeDelimited ? splitPipeRow(line) : parseFixedMedicalTotal(line, columns);
      while (total.length < columns.length) total.push("");
      total = total.slice(0, columns.length);
      continue;
    }

    const values = pipeDelimited ? splitPipeRow(line) : parseFixedMedicalRow(line, extended);
    if (!values || values.length < 3) continue;
    while (values.length < columns.length) values.push("");
    rows.push(values.slice(0, columns.length));
  }

  return addMedicalGlosa({ columns, rows, total });
}

function parseImportLinesTable(lines) {
  const sectionIndex = lines.findIndex((line) => normalize(line).includes("linhas nao importadas"));
  if (sectionIndex < 0) return { columns: [], rows: [], total: [] };
  const headerIndex = lines.findIndex((line, index) => index > sectionIndex && line.includes("|") && normalize(line).includes("numero guia"));
  if (headerIndex < 0) return { columns: [], rows: [], total: [] };

  const columns = splitPipeRow(lines[headerIndex]);
  const rows = [];
  let endIndex = lines.length;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*_{5,}\s*$/.test(line)) {
      if (rows.length) {
        endIndex = index;
        break;
      }
      continue;
    }
    if (!line.includes("|")) continue;
    const values = splitPipeRow(line);
    if (values.every((value) => !value || /^-+$/.test(value))) continue;
    while (values.length < columns.length) values.push("");
    if (values.slice(0, -1).every((value) => !value) && values.at(-1) && rows.length) {
      rows.at(-1)[columns.length - 1] = clean(`${rows.at(-1)[columns.length - 1]} ${values.at(-1)}`);
    } else {
      rows.push(values.slice(0, columns.length));
    }
  }

  const totalLine = lines.slice(endIndex, endIndex + 4).find((line) => normalize(line).startsWith("soma das"));
  const totalMatch = totalLine?.match(/Soma das\s+(\d+)\s+linhas\s*:\s*(R\$\s*[\d.]+,\d{2})/i);
  const total = [];
  if (totalMatch) {
    total.push(...Array.from({ length: columns.length }, () => ""));
    total[0] = `TOTAL (${totalMatch[1]} linhas)`;
    const valueIndex = columns.map(normalize).findIndex((column) => column.includes("valor recebido"));
    if (valueIndex >= 0) total[valueIndex] = clean(totalMatch[2]);
  }
  return { columns, rows, total };
}

function parseImportPatientsTable(lines) {
  const sectionIndex = lines.findIndex((line) => normalize(line).includes("pacientes inexistente ou valor incorreto"));
  if (sectionIndex < 0) return { columns: [], rows: [], total: [] };
  const headerIndex = lines.findIndex((line, index) => index > sectionIndex && normalize(line).startsWith("guia") && normalize(line).includes("valor informado"));
  if (headerIndex < 0) return { columns: [], rows: [], total: [] };

  const columns = ["Guia", "Nome do Beneficiário", "Valor Informado", "Valor Liberado", "Falta", "Status"];
  const rowPattern = /^\s*(\S+)\s{2,}(.+?)\s{2,}([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+(.+?)\s*$/;
  const rows = [];
  let endIndex = lines.length;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*-{5,}\s*$/.test(line)) {
      if (rows.length) {
        endIndex = index;
        break;
      }
      continue;
    }
    const match = line.match(rowPattern);
    if (match) rows.push(match.slice(1).map(clean));
  }

  const totalLine = lines.slice(endIndex, endIndex + 4).find((line) => normalize(line).startsWith("total em aberto"));
  const totalMatch = totalLine?.match(/Total em aberto\s*:\s*(R\$\s*[\d.]+,\d{2})/i);
  const total = [];
  if (totalMatch) {
    total.push(...Array.from({ length: columns.length }, () => ""));
    total[0] = "TOTAL EM ABERTO";
    total[4] = clean(totalMatch[1]);
  }
  return { columns, rows, total };
}

function parseImportTables(rawText = "") {
  const lines = String(rawText).replace(/\r\n?/g, "\n").split("\n");
  return {
    notImported: parseImportLinesTable(lines),
    invalidPatients: parseImportPatientsTable(lines),
  };
}

function readReadonlyReports(rootPath, type) {
  const pattern = TYPE_PATTERNS[type];
  if (!pattern) throw new Error("Tipo de relatório somente leitura inválido.");
  const root = path.resolve(rootPath);
  const documents = [];
  if (!fs.existsSync(root)) return { type, documents };

  const plans = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  for (const plan of plans) {
    const planPath = path.join(root, plan.name);
    const periods = fs.readdirSync(planPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());
    for (const period of periods) {
      const periodPath = path.join(planPath, period.name);
      for (const entry of fs.readdirSync(periodPath, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const match = normalizedFileName(entry.name).match(pattern);
        if (!match) continue;
        const filePath = path.join(periodPath, entry.name);
        const stats = fs.statSync(filePath);
        if (stats.size > MAX_FILE_BYTES) throw new Error(`O arquivo ${entry.name} excede o limite permitido.`);
        const rawText = decodeReport(fs.readFileSync(filePath)).replace(/^\uFEFF/, "");
        const [, day, month, year] = match;
        documents.push({
          id: crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 16),
          type,
          planName: plan.name,
          periodName: period.name,
          periodLabel: periodLabel(period.name),
          fileName: entry.name,
          relativePath: path.relative(root, filePath),
          reportDate: `${day}/${month}/${year}`,
          sortDate: `${year}-${month}-${day}`,
          modifiedAt: stats.mtime.toISOString(),
          rawText,
          ...(type === "medical" ? { medicalTable: parseMedicalTable(rawText) } : {}),
          ...(type === "import" ? { importTables: parseImportTables(rawText) } : {}),
        });
      }
    }
  }

  documents.sort((left, right) => (
    left.planName.localeCompare(right.planName, "pt-BR")
    || right.sortDate.localeCompare(left.sortDate)
    || right.periodName.localeCompare(left.periodName, "pt-BR")
  ));
  return { type, documents };
}

module.exports = { parseImportTables, parseMedicalTable, readReadonlyReports };
