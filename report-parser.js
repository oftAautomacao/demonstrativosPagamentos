const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const REPORT_PATTERN = /^relatorio_.+\.txt$/i;

function decodeReport(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function clean(value = "") {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseMoney(value = "0") {
  const normalized = String(value)
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function findValue(lines, label) {
  const wanted = normalizeKey(label);
  const line = lines.find((item) => normalizeKey(item).startsWith(wanted));
  if (!line) return "";
  return clean(line.slice(line.indexOf(":") + 1));
}

function findSection(lines, title, nextTitles = []) {
  const normalizedTitle = normalizeKey(title);
  const start = lines.findIndex((line) => normalizeKey(line).includes(normalizedTitle));
  if (start < 0) return [];

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const normalized = normalizeKey(lines[index]);
    if (nextTitles.some((next) => normalized.includes(normalizeKey(next)))) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

function fixedWidthColumns(line) {
  const columns = [];
  const pattern = /\S(?:.*?\S)?(?=\s{2,}|$)/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    columns.push({ label: clean(match[0]), start: match.index });
  }
  return columns;
}

function sliceFixedWidthRow(line, starts) {
  return starts.map((start, index) => clean(line.slice(start, starts[index + 1] ?? line.length)));
}

function parsePaymentDescription(lines) {
  const section = findSection(lines, "DESCRICAO PAGAMENTO", ["QTD DEMONSTRATIVOS"])
    .filter((line) => clean(line) && !isDivider(line));
  if (section.length < 2) return { columns: [], rows: [], total: [] };

  const header = section[0];
  const pipeDelimited = header.includes("|");
  let columns;
  let starts = [];
  if (pipeDelimited) {
    columns = header.split("|").map(clean).filter(Boolean);
  } else {
    const definitions = fixedWidthColumns(header);
    columns = definitions.map((column) => column.label);
    starts = definitions.map((column) => column.start);
  }

  const rows = [];
  let total = [];
  for (const line of section.slice(1)) {
    const values = pipeDelimited
      ? line.split("|").map(clean).filter((_, index, all) => !(index === 0 && !all[index]) && !(index === all.length - 1 && !all[index]))
      : sliceFixedWidthRow(line, starts);
    while (values.length < columns.length) values.push("");
    const normalizedFirst = normalizeKey(values[0] || "");
    if (normalizedFirst.startsWith("total")) total = values.slice(0, columns.length);
    else if (values.some(Boolean)) rows.push(values.slice(0, columns.length));
  }
  return { columns, rows, total };
}

function paymentsFromDescription(description) {
  const normalized = description.columns.map(normalizeKey);
  const dateIndex = normalized.findIndex((column) => column.includes("data pagamento") || column.includes("previsao pagamento"));
  const presentedIndex = normalized.findIndex((column) => column.includes("valor apresentado") || column.includes("valor producao"));
  const paymentIndex = normalized.findIndex((column) => column.includes("valor liberado") || column.includes("valor pagamento"));
  if (dateIndex < 0 || paymentIndex < 0) return [];

  const grouped = new Map();
  for (const values of description.rows) {
    const paymentDate = values[dateIndex] || "";
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(paymentDate)) continue;
    const current = grouped.get(paymentDate) || { paymentDate, presentedCents: 0, paymentCents: 0, entries: 0 };
    current.presentedCents += presentedIndex >= 0 ? parseMoney(values[presentedIndex]) : 0;
    current.paymentCents += parseMoney(values[paymentIndex]);
    current.entries += 1;
    grouped.set(paymentDate, current);
  }
  return [...grouped.values()].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
}

function extractDeclaredPaymentDates(lines) {
  const start = lines.findIndex((line) => normalizeKey(line).startsWith("data do pagamento informado pelo convenio"));
  if (start < 0) return [];
  const dates = [];
  for (let index = start; index < Math.min(lines.length, start + 10); index += 1) {
    if (index > start && normalizeKey(lines[index]).startsWith("data de geracao do relatorio")) break;
    dates.push(...(lines[index].match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || []));
  }
  return [...new Set(dates)];
}

function parseGuideInformation(lines) {
  const section = findSection(lines, "INFORMACOES GUIAS", ["OBSERVACOES", "FIM DO RELATORIO"]);
  const groups = [];
  let current = null;

  function commit() {
    if (current?.columns.length) groups.push(current);
    current = null;
  }

  for (const line of section) {
    const dateMatch = clean(line).match(/^Data de pagamento\s*:?[\s]*(\d{2}\/\d{2}\/\d{4})$/i);
    if (dateMatch) {
      commit();
      current = { paymentDate: dateMatch[1], columns: [], rows: [], total: [], pipeDelimited: false, starts: [] };
      continue;
    }
    if (!current || !clean(line) || isDivider(line)) continue;

    if (current.columns.length === 0) {
      current.pipeDelimited = line.includes("|");
      if (current.pipeDelimited) {
        current.columns = line.split("|").map(clean).filter(Boolean);
      } else {
        const definitions = fixedWidthColumns(line);
        current.columns = definitions.map((column) => column.label);
        current.starts = definitions.map((column) => column.start);
      }
      continue;
    }

    const values = current.pipeDelimited
      ? line.split("|").map(clean).filter((value, index, all) => !((index === 0 || index === all.length - 1) && !value))
      : sliceFixedWidthRow(line, current.starts);
    while (values.length < current.columns.length) values.push("");
    if (normalizeKey(values[0] || "").startsWith("total")) current.total = values.slice(0, current.columns.length);
    else if (values.some(Boolean)) current.rows.push(values.slice(0, current.columns.length));
  }
  commit();

  return groups.map(({ pipeDelimited, starts, ...group }) => group);
}

function parseItems(lines) {
  const section = findSection(lines, "TABELA DE DEMONSTRATIVOS", [
    "QUANTIDADE DE DEMONSTRATIVOS",
    "RESUMO DOS SOMATORIOS",
  ]);
  const items = [];
  const rowPattern = /^\s*(\d+)\s+(\S+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+(.+?)\s*$/;

  for (const line of section) {
    const match = line.match(rowPattern);
    if (!match) continue;
    items.push({
      processNumber: match[1],
      batchNumber: match[2],
      paymentForecast: match[3],
      productionCents: parseMoney(match[4]),
      paymentCents: parseMoney(match[5]),
      pccCents: parseMoney(match[6]),
      irrfCents: parseMoney(match[7]),
      issCents: parseMoney(match[8]),
      inssCents: parseMoney(match[9]),
      download: clean(match[10]),
    });
  }
  return items;
}

function parsePaymentsByDate(lines, items) {
  const section = findSection(lines, "TABELA DE DEMONSTRATIVOS", [
    "QUANTIDADE DE DEMONSTRATIVOS",
    "RESUMO DOS SOMATORIOS",
  ]);
  const directRows = [];
  const directPattern = /^\s*(\d{2}\/\d{2}\/\d{4})\s+([\d.,]+)\s+([\d.,]+)(?:\s+(.+?))?\s*$/;

  for (const line of section) {
    const match = line.match(directPattern);
    if (!match) continue;
    directRows.push({
      paymentDate: match[1],
      presentedCents: parseMoney(match[2]),
      paymentCents: parseMoney(match[3]),
      entries: 1,
    });
  }

  const source = directRows.length
    ? directRows
    : items.map((item) => ({
      paymentDate: item.paymentForecast,
      presentedCents: item.productionCents,
      paymentCents: item.paymentCents,
      entries: 1,
    }));
  const grouped = new Map();
  for (const row of source) {
    if (!row.paymentDate) continue;
    const current = grouped.get(row.paymentDate) || { paymentDate: row.paymentDate, presentedCents: 0, paymentCents: 0, entries: 0 };
    current.presentedCents += row.presentedCents;
    current.paymentCents += row.paymentCents;
    current.entries += row.entries;
    grouped.set(row.paymentDate, current);
  }
  return [...grouped.values()].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
}

function parseDownloads(lines) {
  const section = findSection(lines, "QUANTIDADE DE DEMONSTRATIVOS", [
    "RESUMO DOS SOMATORIOS",
  ]);
  const downloads = [];
  const rowPattern = /^\s*(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/;

  for (const line of section) {
    const match = line.match(rowPattern);
    if (!match) continue;
    downloads.push({
      processNumber: match[1],
      batchNumber: match[2],
      xml: Number(match[3]),
      xlsx: Number(match[4]),
      total: Number(match[5]),
      status: clean(match[6]),
    });
  }
  return downloads;
}

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}

function extractSummaryNumber(lines, label) {
  const value = findValue(lines, label);
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function extractSummaryMoney(lines, label) {
  return parseMoney(findValue(lines, label));
}

function parseObservations(lines) {
  const section = findSection(lines, "OBSERVACOES", ["FIM DO RELATORIO"]);
  return section
    .filter((line) => !/^\s*[=-]{20,}\s*$/.test(line))
    .join("\n")
    .trim();
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function extractPeriodParts(...values) {
  for (const value of values.filter(Boolean)) {
    const normalized = normalizeKey(value);
    const yearMatch = normalized.match(/\b(20\d{2})\b/);
    if (!yearMatch) continue;

    let month = 0;
    const numericMonth = normalized.match(/(?:^|\D)(0?[1-9]|1[0-2])[\/_-](?:20\d{2})(?:\D|$)/);
    if (numericMonth) month = Number(numericMonth[1]);
    if (!month) {
      const monthIndex = MONTHS.findIndex((name) => normalized.includes(normalizeKey(name)));
      if (monthIndex >= 0) month = monthIndex + 1;
    }
    if (month) return { month, monthName: MONTHS[month - 1], year: Number(yearMatch[1]) };
  }
  return { month: 0, monthName: "Não identificado", year: 0 };
}

function isDivider(line) {
  return /^\s*[=\-_]{8,}\s*$/.test(line);
}

function isSectionHeading(line) {
  const value = clean(line);
  if (!value || value.length > 120 || value.includes(":")) return false;
  if (/^FIM DO RELATORIO$/i.test(value) || /^\d/.test(value)) return false;
  const letters = value.match(/[A-Za-zÀ-ÿ]/g) || [];
  if (letters.length < 4) return false;
  const upperLetters = value.match(/[A-ZÀ-Þ]/g) || [];
  return upperLetters.length / letters.length > 0.88;
}

function parseFullSections(lines) {
  const sections = [];
  let current = { title: "Informações gerais", lines: [] };

  function commit() {
    const content = current.lines.filter((line) => !isDivider(line)).join("\n").trim();
    if (content) {
      const normalizedTitle = normalizeKey(current.title);
      let category = "Informações adicionais";
      if (normalizedTitle.includes("tabela") || normalizedTitle.includes("demonstrativo")) category = "Tabela e demonstrativos";
      else if (normalizedTitle.includes("resumo") || normalizedTitle.includes("somatorio")) category = "Resumo financeiro";
      else if (normalizedTitle.includes("observa")) category = "Observações";
      else if (normalizedTitle.includes("arquivo") || normalizedTitle.includes("download")) category = "Arquivos e downloads";

      const fields = [];
      for (const line of content.split("\n")) {
        const value = clean(line);
        let match = value.match(/^([^:]{2,90}):\s*(.+)$/);
        if (!match) match = value.match(/^(.{2,90}?)\s*\.{3,}\s*(.+)$/);
        if (!match) match = value.match(/^(.{2,90}?)\s*->\s*(.+)$/);
        if (match) fields.push({ label: clean(match[1]), value: clean(match[2]) });
      }
      sections.push({ title: current.title, content, category, fields });
    }
  }

  for (const originalLine of lines) {
    const line = originalLine.trimEnd();
    if (isDivider(line) || /^FIM DO RELATORIO$/i.test(clean(line))) continue;
    if (isSectionHeading(line)) {
      commit();
      current = { title: clean(line), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  commit();
  return sections;
}

function inferContext(filePath, rootPath) {
  const relative = path.relative(rootPath, filePath);
  const parts = relative.split(path.sep);
  const projectIndex = parts.findIndex((part) => normalizeKey(part) === "demonstpagprojeto");
  const baseIndex = projectIndex >= 0 ? projectIndex + 1 : 0;
  const agreement = clean((parts[baseIndex] || "Plano não identificado").replace(/_/g, " "));
  const period = parts.length > baseIndex + 2 ? parts[baseIndex + 1] : path.basename(path.dirname(filePath));
  return { agreement, period, relativePath: relative };
}

function parseReport(text, filePath, rootPath, stats = {}) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const items = parseItems(lines);
  let paymentsByDate = parsePaymentsByDate(lines, items);
  const paymentDescription = parsePaymentDescription(lines);
  const guideInformation = parseGuideInformation(lines);
  if (paymentsByDate.length === 0) paymentsByDate = paymentsFromDescription(paymentDescription);
  const downloads = parseDownloads(lines);
  const context = inferContext(filePath, rootPath);
  const paymentDates = [...new Set(paymentsByDate.map((item) => item.paymentDate).filter(Boolean))];
  if (paymentDates.length === 0) {
    paymentDates.push(...extractDeclaredPaymentDates(lines));
  }

  const taxesCents = sum(items, "pccCents") + sum(items, "irrfCents") + sum(items, "issCents") + sum(items, "inssCents");
  const productionCents = sum(items, "productionCents") || sum(paymentsByDate, "presentedCents") || extractSummaryMoney(lines, "SOMATORIO VALOR PRODUCAO") || extractSummaryMoney(lines, "Valor Apresentado");
  const paymentCents = sum(items, "paymentCents") || sum(paymentsByDate, "paymentCents") || extractSummaryMoney(lines, "SOMATORIO VALOR PAGAMENTO") || extractSummaryMoney(lines, "Valor Liberado");
  const summaryTaxes = extractSummaryMoney(lines, "SOMATORIO TOTAL DOS IMPOSTOS");
  const processedPeriodSource = findValue(lines, "Mes/ano processado") || findValue(lines, "Periodo pesquisado");
  const requestedPeriod = findValue(lines, "Mes/Ano de pagamento solicitado") || findValue(lines, "Mes/Ano de pagamento desejado") || processedPeriodSource;
  const periodParts = extractPeriodParts(requestedPeriod, processedPeriodSource, context.period, paymentDates[0]);
  if (paymentsByDate.length === 0 && paymentDates.length === 1) {
    paymentsByDate = [{ paymentDate: paymentDates[0], presentedCents: productionCents, paymentCents, entries: items.length || 1 }];
  }

  return {
    id: crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 12),
    contentHash: crypto.createHash("sha256").update(text).digest("hex"),
    fileName: path.basename(filePath),
    filePath,
    modifiedAt: stats.mtime ? stats.mtime.toISOString() : null,
    ...context,
    title: clean(lines.find((line) => normalizeKey(line).includes("relatorio de demonstrativos de pagamento")) || "Relatório de demonstrativos de pagamento"),
    paymentDates,
    paymentDateText: paymentDates.join(" · "),
    requestedPeriod,
    processedPeriod: findValue(lines, "Mes/ano processado") || (periodParts.month && periodParts.year ? `${periodParts.monthName.toLocaleUpperCase("pt-BR")}/${periodParts.year}` : ""),
    periodMonth: periodParts.month,
    periodMonthName: periodParts.monthName,
    periodYear: periodParts.year,
    generatedAt: findValue(lines, "Data de geracao do relatorio"),
    provider: findValue(lines, "Prestador"),
    operator: findValue(lines, "Operadora"),
    items,
    paymentsByDate,
    paymentDescription,
    guideInformation,
    downloads,
    observations: parseObservations(lines),
    fullSections: parseFullSections(lines),
    rawText: text.replace(/^\uFEFF/, "").trim(),
    totals: {
      processes: extractSummaryNumber(lines, "Quantidade de demonstrativos (processos)") || items.length || paymentsByDate.length,
      procedures: extractSummaryNumber(lines, "Quantidade de itens/procedimentos pagos"),
      productionCents,
      paymentCents,
      differenceCents: productionCents - paymentCents,
      pccCents: sum(items, "pccCents") || extractSummaryMoney(lines, "PCC (PIS/COFINS/CSLL)"),
      irrfCents: sum(items, "irrfCents") || extractSummaryMoney(lines, "IRRF"),
      issCents: sum(items, "issCents") || extractSummaryMoney(lines, "ISS"),
      inssCents: sum(items, "inssCents") || extractSummaryMoney(lines, "INSS"),
      taxesCents: taxesCents || summaryTaxes,
      netCents: paymentCents - (taxesCents || summaryTaxes),
    },
  };
}

function walkReports(directory) {
  const files = [];
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkReports(fullPath));
    else if (entry.isFile() && REPORT_PATTERN.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function scoreCanonical(report) {
  const normalized = normalizeKey(report.filePath);
  let score = 0;
  if (!normalized.includes("claude outputs")) score += 10;
  if (/\b\d{4}\b/.test(report.period)) score += 3;
  return score;
}

function loadReports(rootPath) {
  const parsed = walkReports(rootPath).map((filePath) => {
    const buffer = fs.readFileSync(filePath);
    return parseReport(decodeReport(buffer), filePath, rootPath, fs.statSync(filePath));
  });

  const groups = new Map();
  for (const report of parsed) {
    if (!groups.has(report.contentHash)) groups.set(report.contentHash, []);
    groups.get(report.contentHash).push(report);
  }

  const reports = [...groups.values()].map((duplicates) => {
    duplicates.sort((a, b) => scoreCanonical(b) - scoreCanonical(a));
    const canonical = duplicates[0];
    return {
      ...canonical,
      duplicateCount: duplicates.length - 1,
      duplicatePaths: duplicates.slice(1).map((item) => item.filePath),
    };
  });

  reports.sort((a, b) => {
    const dateA = a.generatedAt.split("/").reverse().join("");
    const dateB = b.generatedAt.split("/").reverse().join("");
    return dateB.localeCompare(dateA) || a.agreement.localeCompare(b.agreement, "pt-BR");
  });

  return {
    rootPath,
    scannedFiles: parsed.length,
    duplicateFiles: parsed.length - reports.length,
    reports,
    scannedAt: new Date().toISOString(),
  };
}

module.exports = { decodeReport, loadReports, parseMoney, parseReport };
