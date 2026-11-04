const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const ALLOWED_EXTENSIONS = new Set([".pdf", ".csv", ".ofx", ".txt"]);
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const GENERIC_WORDS = new Set([
  "a", "as", "assistencia", "beneficios", "companhia", "convenio", "cooperativa",
  "da", "das", "de", "do", "dos", "e", "empresa", "grupo", "medica", "medico",
  "operadora", "plano", "saude", "seguradora", "seguro", "servicos", "sistema",
]);

const PLAN_CATALOG = [
  { name: "Amil", aliases: ["Amil Saúde", "Amil Assistência Médica", "Amil Assistência Médica Internacional"] },
  { name: "Bradesco", aliases: ["PGTO.SINISTRO AP/CERTIF", "PGTO SINISTRO AP CERTIF", "PAGAMENTO SINISTRO AP CERTIF"] },
  { name: "Bradesco Operadora", aliases: ["Bradesco Operadora", "Operadora Bradesco", "Bradesco Operadora de Planos"] },
  { name: "Bradesco Saúde", aliases: ["Bradesco Saúde", "Bradesco Seguros Saúde", "Bradesco Saúde S.A."] },
  { name: "Caberj", aliases: ["Caberj", "Caberj Saúde", "Caixa de Assistência à Saúde Caberj"] },
  { name: "Caberj Integral Saúde", aliases: ["Caberj Integral Saúde", "Integral Saúde Caberj", "Caberj I S S A"] },
  { name: "Capesesp", aliases: ["Capesesp", "Caixa de Previdência e Assistência dos Servidores da Fundação Nacional de Saúde"] },
  { name: "Cassi", aliases: ["Cassi", "Caixa de Assistência dos Funcionários do Banco do Brasil", "Caixa Assistência Funcionários BB"] },
  { name: "Caurj", aliases: ["Caurj", "Caixa de Assistência Universitária do Rio de Janeiro", "Caixa Assistencial Universitária do Rio de Janeiro"] },
  { name: "Care Plus", aliases: ["Care Plus", "Careplus", "Care Plus Medicina Assistencial"] },
  { name: "Fio Saúde", aliases: ["Fio Saúde", "Fiosaúde", "Caixa de Assistência Oswaldo Cruz", "Caixa Assistência Oswaldo Cruz Fiosaúde"] },
  { name: "Fundação Itaú", aliases: ["Fundação Itaú", "Fundação Saúde Itaú", "Fundação Itaú Unibanco", "Fundação Itaúsa"] },
  { name: "Geap", aliases: ["Geap", "Geap Saúde", "Geap Autogestão em Saúde", "Fundação de Seguridade Social Geap"] },
  { name: "Intermédica", aliases: ["Intermédica", "NotreDame Intermédica", "Notre Dame Intermédica", "Hapvida NotreDame Intermédica", "Hapvida NDI"] },
  { name: "Mediservice", aliases: ["Mediservice", "Mediservice Administradora de Planos de Saúde"] },
  { name: "Petrobras", aliases: ["Petrobras", "Saúde Petrobras", "Associação Petrobras de Saúde", "APS Saúde Petrobras"] },
  { name: "Porto Seguro", aliases: ["Porto Seguro", "Porto Seguro Saúde", "Porto Saúde"] },
  { name: "Postal Saúde", aliases: ["Postal Saúde", "Caixa de Assistência e Saúde dos Empregados dos Correios", "Caixa Assistência Saúde Empregados Correios"] },
  { name: "Prevent Senior", aliases: ["Prevent Senior", "PreventSenior", "Prevent Senior Private Operadora de Saúde"] },
  { name: "Real Grandeza", aliases: ["Real Grandeza", "Fundação Real Grandeza", "Real Grandeza Fundação de Previdência e Assistência Social", "Real Grandeza Saúde"] },
  { name: "Sulamerica", aliases: ["Sulamerica", "Sul América", "Sul América Saúde", "Sul América Companhia de Seguro Saúde"] },
  { name: "Telos Benner", aliases: ["Telos Benner", "Telos Fundação Embratel", "Fundação Embratel de Seguridade Social", "Benner Saúde Telos"] },
  { name: "Unimed", aliases: ["Unimed", "Unimed Rio", "Unimed Ferj", "Unimed Federação", "Unimed Seguros Saúde", "Unimed Cooperativa de Trabalho Médico"] },
  { name: "Caixa de Assistência", aliases: ["Caixa de Assistência", "Caixa Assistencial", "Caixa de Assistenci", "Caixa Assistenci", "Caixa A A Saúde", "CX Assistência", "CX Assistencial", "CX Assistenci", "CX Assist"] },
];

function normalize(value = "") {
  const normalized = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalized.replace(/\b(?:[a-z]\s+){2,}[a-z]\b/g, (spaced) => spaced.replace(/\s+/g, ""));
}

function cleanEvidence(value = "") {
  return String(value).replace(/\s+/g, " ").trim().slice(0, 220);
}

function aliasVariants(value = "") {
  const original = String(value).trim();
  if (!original) return [];
  return [original, ...original.split(/[\/|]/)]
    .map(normalize)
    .filter((alias) => alias.length >= 3);
}

function significantTokens(value = "") {
  return normalize(value).split(" ").filter((token) => token.length >= 3 && !GENERIC_WORDS.has(token));
}

function buildPlanCandidates(reports = [], configuredNames = []) {
  const plans = new Map();
  const addPlan = (name, aliases = []) => {
    const planName = String(name || "").trim();
    if (!planName) return;
    const normalizedName = normalize(planName);
    const knownPlan = [...plans.values()].find((item) => item.aliases.has(normalizedName));
    const key = knownPlan?.key || normalizedName;
    if (!plans.has(key)) plans.set(key, { key, name: planName, aliases: new Set() });
    const plan = plans.get(key);
    for (const value of [planName, ...aliases]) {
      for (const alias of aliasVariants(value)) plan.aliases.add(alias);
    }
  };

  for (const plan of PLAN_CATALOG) addPlan(plan.name, plan.aliases);

  for (const report of reports) {
    const titlePlan = String(report.title || "").split(/\s+-\s+/).slice(1).join(" - ");
    addPlan(report.agreement, [report.operator, titlePlan]);
  }
  for (const name of configuredNames) addPlan(name);

  return [...plans.values()].map((plan) => ({ name: plan.name, aliases: [...plan.aliases] }));
}

function aliasMatchScore(normalizedLine, alias) {
  if (!normalizedLine || !alias) return 0;
  if (` ${normalizedLine} `.includes(` ${alias} `)) return 1_000 + alias.length;
  const tokens = significantTokens(alias);
  if (!tokens.length) return 0;
  if (tokens.length === 1 && normalize(alias).split(" ").length > 1) return 0;
  const lineTokens = normalizedLine.split(" ").filter(Boolean);
  const matches = tokens.filter((token) => lineTokens.some((lineToken) => (
    lineToken === token
    || (lineToken.length >= 6 && token.length >= 6 && (lineToken.startsWith(token) || token.startsWith(lineToken)))
  ))).length;
  if (matches < Math.min(2, tokens.length) || (matches / tokens.length < 0.5 && matches < 3)) return 0;
  return Math.round((matches / tokens.length) * 500) + matches * 20 + Math.min(alias.length, 99);
}

function genericAssistanceScore(normalizedLine) {
  if (!normalizedLine) return 0;
  if (/\b(?:cx|caixa)(?:\s+de)?\s+assist[a-z]*\b/.test(normalizedLine)) return 850;
  return 0;
}

function planMatchScore(candidate, normalizedLine) {
  let score = Math.max(0, ...candidate.aliases.map((alias) => aliasMatchScore(normalizedLine, alias)));
  if (candidate.name === "Caixa de Assistência") {
    score = Math.max(score, genericAssistanceScore(normalizedLine));
    score = Math.min(score, 300);
  }
  return score;
}

function searchableEntries(lines) {
  const entries = lines.map((line, index) => ({ evidence: line, normalized: normalize(line), start: index, end: index }));
  for (const size of [2, 3]) {
    for (let index = 0; index <= lines.length - size; index += 1) {
      const evidence = cleanEvidence(lines.slice(index, index + size).join(" "));
      entries.push({ evidence, normalized: normalize(evidence), start: index, end: index + size - 1 });
    }
  }
  return entries;
}

function contextFinancialDirection(lines, entry) {
  const context = normalize(lines.slice(Math.max(0, entry.start - 3), Math.min(lines.length, entry.end + 4)).join(" "));
  if (/\b(?:pix enviado|pix envidado|pagamento de boleto|pagto de boleto|transferencia enviada|transf enviada|des)\b/.test(context)) {
    return "debit";
  }
  if (/\b(?:pix recebido|credito cassi|recebimento fornecedor|receb por fornecimento|ted credito|pgto sinistro|remet|rem)\b/.test(context)) {
    return "credit";
  }
  return "";
}

function moneyCandidates(lines, entry) {
  const candidates = [];
  const first = Math.max(0, entry.start - 6);
  const last = Math.min(lines.length - 1, entry.end + 6);
  for (let index = first; index <= last; index += 1) {
    const distance = index < entry.start ? entry.start - index : index > entry.end ? index - entry.end : 0;
    const expression = /(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*|-?\d+),(\d{2})(?:\s*([CD]))?/gi;
    let match;
    let order = 0;
    while ((match = expression.exec(lines[index])) !== null) {
      const amount = `${match[1].replace(/^-/, "")},${match[2]}`;
      const marker = String(match[3] || "").toLocaleUpperCase("pt-BR");
      const direction = marker === "D" || match[1].startsWith("-") ? "debit" : "credit";
      candidates.push({ amount, direction, distance, index, order, explicit: Boolean(marker) });
      order += 1;
    }
  }
  return candidates;
}

function nearestPaymentDate(lines, entry, transactionIndex) {
  for (let index = entry.start; index <= entry.end; index += 1) {
    if (/data da opera|per[ií]odo|extrato/i.test(lines[index])) continue;
    const embedded = lines[index].match(/\b([0-3]\d\/[01]\d\/\d{4})\b/);
    if (embedded) return embedded[1];
  }
  const anchor = Math.min(entry.start, Number.isInteger(transactionIndex) ? transactionIndex : entry.start);
  for (let index = anchor; index >= Math.max(0, anchor - 40); index -= 1) {
    const match = lines[index].match(/^\s*([0-3]\d\/[01]\d\/\d{4})\s*$/);
    if (match) return match[1];
  }
  for (let index = entry.start; index <= Math.min(lines.length - 1, entry.end + 2); index += 1) {
    const match = lines[index].match(/^\s*([0-3]\d\/[01]\d\/\d{4})\s*$/);
    if (match) return match[1];
  }
  return "";
}

function nearestFinancialDetails(lines, entry) {
  const contextDirection = contextFinancialDirection(lines, entry);
  const candidates = moneyCandidates(lines, entry);
  const compatible = contextDirection ? candidates.filter((candidate) => candidate.direction === contextDirection) : candidates;
  let available = compatible.length ? compatible : candidates;
  const explicit = available.filter((candidate) => candidate.explicit);
  if (explicit.length) {
    available = explicit;
  } else if (contextDirection) {
    const inside = available.filter((candidate) => candidate.index >= entry.start && candidate.index <= entry.end);
    const following = available.filter((candidate) => candidate.index > entry.end);
    if (inside.length) available = inside;
    else if (following.length) available = following;
  }
  available.sort((a, b) => (
    a.distance - b.distance
    || (a.explicit ? 0 : (a.index >= entry.end ? 0 : 1)) - (b.explicit ? 0 : (b.index >= entry.end ? 0 : 1))
    || a.index - b.index
    || a.order - b.order
  ));
  const transaction = available[0] || null;
  const direction = contextDirection || transaction?.direction || "";
  return {
    direction,
    paymentDate: nearestPaymentDate(lines, entry, transaction?.index),
    paymentAmount: transaction?.amount || "",
    transactionKey: transaction ? `money:${transaction.index}:${transaction.order}` : "",
  };
}

function analyzeStatementText(text, candidates = []) {
  const lines = String(text || "").split(/\r?\n/).map(cleanEvidence).filter(Boolean);
  const occurrencesByPlan = new Map(candidates.map((candidate) => [candidate.name, []]));
  const seenByPlan = new Map(candidates.map((candidate) => [candidate.name, new Set()]));
  const claimedTransactions = new Map();

  for (const entry of searchableEntries(lines)) {
    let bestCandidate = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = planMatchScore(candidate, entry.normalized);
      if (score > bestScore) {
        bestCandidate = candidate;
        bestScore = score;
      }
    }
    if (!bestCandidate || !bestScore) continue;
    if (bestCandidate.name === "Caixa de Assistência") {
      const expanded = normalize(lines.slice(entry.start, Math.min(lines.length, entry.end + 3)).join(" "));
      const hasSpecificMatch = candidates.some((candidate) => (
        candidate.name !== "Caixa de Assistência"
        && candidate.aliases.some((alias) => aliasMatchScore(expanded, alias) > 0)
      ));
      if (hasSpecificMatch) continue;
    }
    const financial = nearestFinancialDetails(lines, entry);
    if (financial.direction === "debit") continue;
    const occurrences = occurrencesByPlan.get(bestCandidate.name);
    const seen = seenByPlan.get(bestCandidate.name);
    const normalizedEvidence = normalize(entry.evidence);
    let identityIndex = -1;
    let identityScore = 0;
    for (let index = entry.start; index <= entry.end; index += 1) {
      const score = planMatchScore(bestCandidate, normalize(lines[index]));
      if (score > identityScore) {
        identityIndex = index;
        identityScore = score;
      }
    }
    const occurrenceKey = identityIndex >= 0
      ? `line:${identityIndex}`
      : financial.transactionKey || `evidence:${normalizedEvidence}`;
    if (seen.has(occurrenceKey)) continue;
    if (!financial.transactionKey && occurrences.some((item) => {
      const existing = normalize(item.evidence);
      return existing === normalizedEvidence || existing.includes(normalizedEvidence) || normalizedEvidence.includes(existing);
    })) continue;
    const genericPlan = bestCandidate.name === "Caixa de Assistência";
    const previousClaim = financial.transactionKey ? claimedTransactions.get(financial.transactionKey) : null;
    if (previousClaim && (genericPlan || previousClaim.planName !== "Caixa de Assistência")) continue;
    if (previousClaim) {
      const previousOccurrences = occurrencesByPlan.get(previousClaim.planName);
      const previousIndex = previousOccurrences.indexOf(previousClaim.occurrence);
      if (previousIndex >= 0) previousOccurrences.splice(previousIndex, 1);
    }
    const occurrence = {
      evidence: entry.evidence,
      paymentDate: financial.paymentDate,
      paymentAmount: financial.paymentAmount,
    };
    seen.add(occurrenceKey);
    occurrences.push(occurrence);
    if (financial.transactionKey) {
      claimedTransactions.set(financial.transactionKey, { planName: bestCandidate.name, occurrence });
    }
  }

  const matches = candidates
    .map((candidate) => ({ planName: candidate.name, occurrences: occurrencesByPlan.get(candidate.name) }))
    .filter((item) => item.occurrences.length);

  return {
    matches: matches.sort((a, b) => a.planName.localeCompare(b.planName, "pt-BR")),
    analyzedLines: lines.length,
  };
}

const CONSOLIDATE_BY_DATE_PLANS = new Set(["Sulamerica", "Intermédica"]);

function amountToCents(value = "") {
  const normalized = String(value).replace(/[^\d,]/g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function centsToAmount(cents) {
  return (Number(cents) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });
}

function consolidateStatementMatches(matches = []) {
  return matches.map((match) => {
    if (!CONSOLIDATE_BY_DATE_PLANS.has(match.planName)) return match;
    const byDate = new Map();
    for (const occurrence of match.occurrences || []) {
      const key = occurrence.paymentDate || `sem-data-${byDate.size}`;
      const existing = byDate.get(key);
      if (!existing) {
        byDate.set(key, { ...occurrence });
        continue;
      }
      existing.paymentAmount = centsToAmount(
        amountToCents(existing.paymentAmount) + amountToCents(occurrence.paymentAmount),
      );
      existing.evidence = [existing.evidence, occurrence.evidence].filter(Boolean).join(" + ");
    }
    return { ...match, occurrences: [...byDate.values()] };
  });
}

function decodeTextBuffer(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return buffer.toString("latin1");
  }
}

async function extractPdfText(buffer) {
  const scriptPath = path.join(__dirname, "statement-pdf-extractor.py");
  const encoded = buffer.toString("base64");
  const commands = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  let lastError;
  for (const command of commands) {
    try {
      const args = command === "py" ? ["-3", scriptPath] : [scriptPath];
      return await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          windowsHide: true,
          env: { ...process.env, PYTHONUTF8: "1" },
        });
        const stdout = [];
        const stderr = [];
        let outputBytes = 0;
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error("A leitura do PDF excedeu o tempo limite."));
        }, 60_000);
        child.stdout.on("data", (chunk) => {
          outputBytes += chunk.length;
          if (outputBytes > 20 * 1024 * 1024) {
            child.kill();
            reject(new Error("O texto extraído do PDF excedeu o limite permitido."));
            return;
          }
          stdout.push(chunk);
        });
        child.stderr.on("data", (chunk) => stderr.push(chunk));
        child.stdin.on("error", reject);
        child.on("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timeout);
          if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
          else reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `O leitor de PDF encerrou com código ${code}.`));
        });
        child.stdin.end(encoded);
      });
    } catch (error) {
      lastError = error;
      if (error.code !== "ENOENT") break;
    }
  }
  const detail = String(lastError?.stderr || lastError?.message || "").trim();
  throw new Error(detail || "Não foi possível ler o PDF. Verifique a instalação das dependências do projeto.");
}

function decodeUploadedFile(fileName, base64) {
  const extension = path.extname(String(fileName || "")).toLocaleLowerCase("pt-BR");
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Formato não aceito. Envie um arquivo PDF, CSV, OFX ou TXT.");
  }
  if (typeof base64 !== "string" || !base64.trim()) throw new Error("O arquivo enviado está vazio.");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) throw new Error("O arquivo enviado está vazio.");
  if (buffer.length > MAX_FILE_BYTES) throw new Error("O arquivo excede o limite de 12 MB.");
  if (extension === ".pdf" && buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("O arquivo enviado não é um PDF válido.");
  }
  return { buffer, extension };
}

function detectStatementBank(fileName = "", text = "") {
  const normalizedFileName = normalize(path.basename(String(fileName))).toLocaleUpperCase("pt-BR");
  if (normalizedFileName.includes("BRADESCO")) return "Bradesco";
  if (normalizedFileName.includes("BANCO DO BRASIL") || /(^|\s)BB($|\s)/.test(normalizedFileName)) {
    return "Banco do Brasil";
  }

  // O cabeçalho é usado antes do restante do extrato para que nomes de
  // convênios, como Bradesco Saúde, não sejam confundidos com o banco.
  const header = normalize(String(text).split(/\r?\n/).slice(0, 30).join(" ")).toLocaleUpperCase("pt-BR");
  if (header.includes("BANCO DO BRASIL") || header.includes("SISBB")) return "Banco do Brasil";
  if (header.includes("BRADESCO") || header.includes("NET EMPRESA")) return "Bradesco";
  return "Banco não identificado";
}

async function analyzeUploadedStatement({ fileName, base64, candidates }) {
  const { buffer, extension } = decodeUploadedFile(fileName, base64);
  const text = extension === ".pdf" ? await extractPdfText(buffer) : decodeTextBuffer(buffer);
  if (!text.trim()) {
    throw new Error("Não foi possível encontrar texto no extrato. Se ele for uma imagem digitalizada, exporte-o novamente com texto pesquisável.");
  }
  const analysis = analyzeStatementText(text, candidates);
  analysis.matches = consolidateStatementMatches(analysis.matches);
  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
  let occurrenceIndex = 0;
  for (const match of analysis.matches) {
    for (const occurrence of match.occurrences) {
      occurrence.paymentId = crypto.createHash("sha256").update([
        fileHash,
        match.planName,
        occurrence.paymentDate,
        occurrence.paymentAmount,
        occurrence.evidence,
        occurrenceIndex,
      ].join("|")).digest("hex").slice(0, 20);
      occurrenceIndex += 1;
    }
  }
  return {
    fileName: path.basename(fileName),
    sourceBank: detectStatementBank(fileName, text),
    ...analysis,
  };
}

module.exports = {
  MAX_FILE_BYTES,
  analyzeStatementText,
  analyzeUploadedStatement,
  buildPlanCandidates,
  consolidateStatementMatches,
  detectStatementBank,
  normalize,
};
