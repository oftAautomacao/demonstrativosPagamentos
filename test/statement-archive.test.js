const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  DEFAULT_STATEMENT_ARCHIVE_ROOT,
  archiveStatementPdf,
  statementPeriod,
} = require("../statement-archive");

const pdf = Buffer.from("%PDF-1.4\nextrato de teste\n%%EOF");

test("usa a nova pasta de extratos dentro do projeto Claude", () => {
  assert.equal(
    DEFAULT_STATEMENT_ARCHIVE_ROOT,
    "C:\\Users\\Master\\OneDrive\\Documentos\\OFT\\Claude\\DemonstPagProjeto\\demonstrativos de Pagamento anual\\Extratos",
  );
});

test("identifica a competencia mais frequente nas datas do extrato", () => {
  assert.deepEqual(statementPeriod({
    matches: [{ occurrences: [
      { paymentDate: "02/10/2026" },
      { paymentDate: "16/10/2026" },
      { paymentDate: "30/09/2026" },
    ] }],
  }), { month: 10, year: 2026 });
});

test("salva o PDF na pasta AAAA_MM_MES preservando o nome", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "statement-archive-"));
  const result = archiveStatementPdf({
    fileName: "Extrato Bradesco 10-2026.pdf",
    base64: pdf.toString("base64"),
    matches: [{ occurrences: [{ paymentDate: "02/10/2026" }] }],
    rootDir,
  });

  assert.equal(result.folderName, "2026_10_OUTUBRO");
  assert.equal(result.fileName, "Extrato Bradesco 10-2026.pdf");
  assert.deepEqual(fs.readFileSync(result.path), pdf);
});

test("nao duplica o mesmo PDF e nao sobrescreve um arquivo diferente", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "statement-archive-collision-"));
  const input = {
    fileName: "Extrato.pdf",
    matches: [],
    fallbackMonth: 10,
    fallbackYear: 2026,
    rootDir,
  };
  const first = archiveStatementPdf({ ...input, base64: pdf.toString("base64") });
  const repeated = archiveStatementPdf({ ...input, base64: pdf.toString("base64") });
  const different = archiveStatementPdf({
    ...input,
    base64: Buffer.from("%PDF-1.4\noutro arquivo\n%%EOF").toString("base64"),
  });

  assert.equal(first.path, repeated.path);
  assert.equal(repeated.alreadyExisted, true);
  assert.equal(different.fileName, "Extrato (2).pdf");
});
