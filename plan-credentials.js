const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const FILE_NAME = "loginsenha.txt";
const MAX_FILE_BYTES = 256 * 1024;

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function fileVersion(filePath) {
  return fs.statSync(filePath, { bigint: true }).mtimeNs.toString();
}

function credentialId(rootPath, filePath) {
  return crypto.createHash("sha256").update(path.relative(rootPath, filePath)).digest("hex").slice(0, 16);
}

function splitText(text) {
  const parts = text.split(/(\r\n|\n|\r)/);
  const lines = [];
  for (let index = 0, lineNumber = 1; index < parts.length; index += 2, lineNumber += 1) {
    if (index === parts.length - 1 && parts[index] === "" && index > 0) break;
    lines.push({ text: parts[index], ending: parts[index + 1] || "", lineNumber });
  }
  return lines;
}

function parseCredentialFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length > MAX_FILE_BYTES) throw new Error("O arquivo LoginSenha.txt excede o limite permitido.");
  const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const text = buffer.subarray(hasBom ? 3 : 0).toString("utf8");
  const lines = splitText(text);
  const fields = [];

  for (const line of lines) {
    if (!line.text.trim()) continue;
    const match = line.text.match(/^(\s*)([^:=|]+?)(\s*)([:=|])(\s*)(.*)$/);
    const id = String(line.lineNumber);
    if (match) {
      const label = match[2].trim();
      fields.push({
        id,
        label,
        value: match[6],
        sensitive: /senha|password|token|segredo/i.test(label.normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
        _prefix: `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}`,
        _line: line,
      });
    } else {
      fields.push({ id, label: `Linha ${line.lineNumber}`, value: line.text, sensitive: false, _prefix: "", _line: line });
    }
  }
  return { buffer, hasBom, lines, fields };
}

function findCredentialFiles(rootPath) {
  const resolvedRoot = path.resolve(rootPath);
  const plans = fs.readdirSync(resolvedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const files = [];
  for (const plan of plans) {
    const planPath = path.join(resolvedRoot, plan.name);
    const match = fs.readdirSync(planPath, { withFileTypes: true })
      .find((entry) => entry.isFile() && entry.name.toLocaleLowerCase("pt-BR") === FILE_NAME);
    if (match) files.push({ planName: plan.name, filePath: path.join(planPath, match.name), fileName: match.name });
  }
  return { resolvedRoot, files };
}

function publicCredential(rootPath, planName, fileName, filePath, parsed) {
  return {
    id: credentialId(rootPath, filePath),
    planName,
    fileName,
    relativePath: path.relative(rootPath, filePath),
    version: fileVersion(filePath),
    fields: parsed.fields.map(({ id, label, value, sensitive }) => ({ id, label, value, sensitive })),
  };
}

function readPlanCredentials(rootPath) {
  const { resolvedRoot, files } = findCredentialFiles(rootPath);
  const plans = [];
  const errors = [];
  for (const file of files) {
    try {
      const parsed = parseCredentialFile(file.filePath);
      plans.push(publicCredential(resolvedRoot, file.planName, file.fileName, file.filePath, parsed));
    } catch (error) {
      errors.push({ planName: file.planName, fileName: file.fileName, message: error.message });
    }
  }
  return { plans, errors };
}

function atomicWrite(filePath, buffer) {
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, buffer, { flag: "wx" });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    if (["EPERM", "EACCES", "EBUSY"].includes(error.code)) {
      throw new Error("Feche o arquivo LoginSenha.txt em outros programas antes de salvar.");
    }
    throw error;
  }
}

function writePlanCredentials(rootPath, planId, version, submittedFields) {
  if (!planId || !Array.isArray(submittedFields)) throw new Error("O convênio e os campos são obrigatórios.");
  const { resolvedRoot, files } = findCredentialFiles(rootPath);
  const file = files.find((item) => credentialId(resolvedRoot, item.filePath) === planId);
  if (!file || !isWithin(path.resolve(file.filePath), resolvedRoot)) throw new Error("O arquivo LoginSenha.txt selecionado não foi encontrado.");
  if (version && fileVersion(file.filePath) !== String(version)) {
    throw new Error("O arquivo LoginSenha.txt foi alterado fora do painel. Atualize antes de salvar novamente.");
  }

  const parsed = parseCredentialFile(file.filePath);
  const submitted = new Map(submittedFields.map((field) => [String(field.id), field.value]));
  const expectedIds = new Set(parsed.fields.map((field) => field.id));
  if (submitted.size !== expectedIds.size || [...submitted.keys()].some((id) => !expectedIds.has(id))) {
    throw new Error("A estrutura do arquivo LoginSenha.txt mudou. Atualize a página.");
  }

  const fieldByLine = new Map(parsed.fields.map((field) => [field._line.lineNumber, field]));
  const updatedText = parsed.lines.map((line) => {
    const field = fieldByLine.get(line.lineNumber);
    if (!field) return `${line.text}${line.ending}`;
    const value = submitted.get(field.id);
    if (value === undefined || value === null) throw new Error(`O campo ${field.label} possui um valor inválido.`);
    const cleanValue = String(value).replace(/[\r\n]/g, "");
    return `${field._prefix}${cleanValue}${line.ending}`;
  }).join("");
  const prefix = parsed.hasBom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0);
  atomicWrite(file.filePath, Buffer.concat([prefix, Buffer.from(updatedText, "utf8")]));

  const refreshed = parseCredentialFile(file.filePath);
  return publicCredential(resolvedRoot, file.planName, file.fileName, file.filePath, refreshed);
}

module.exports = { readPlanCredentials, writePlanCredentials };
