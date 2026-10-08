const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readPlanCredentials, writePlanCredentials } = require("../plan-credentials");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "plan-credentials-"));
  const intermedica = path.join(root, "Intermedica");
  const sulamerica = path.join(root, "Sulamerica");
  const ignored = path.join(root, "Sem Login");
  fs.mkdirSync(intermedica);
  fs.mkdirSync(sulamerica);
  fs.mkdirSync(ignored);
  fs.writeFileSync(path.join(intermedica, "LoginSenha.txt"), Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from("CNPJ :  valor-antigo\r\nsenha: segredo\r\n", "utf8"),
  ]));
  fs.writeFileSync(path.join(sulamerica, "LoginSenha.txt"), "Usuário: operador\nsenha: outra\n", "utf8");
  return root;
}

test("lê somente os convênios que possuem LoginSenha.txt", () => {
  const root = fixture();
  try {
    const result = readPlanCredentials(root);
    assert.deepEqual(result.plans.map((plan) => plan.planName), ["Intermedica", "Sulamerica"]);
    assert.deepEqual(result.plans[0].fields.map((field) => field.label), ["CNPJ", "senha"]);
    assert.equal(result.plans[0].fields[1].sensitive, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("edita apenas os valores e preserva BOM, separadores e quebras", () => {
  const root = fixture();
  try {
    const plan = readPlanCredentials(root).plans[0];
    const updated = writePlanCredentials(root, plan.id, plan.version, [
      { id: plan.fields[0].id, value: "novo-cnpj" },
      { id: plan.fields[1].id, value: "nova-senha" },
    ]);
    const file = fs.readFileSync(path.join(root, "Intermedica", "LoginSenha.txt"));
    assert.deepEqual([...file.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(file.subarray(3).toString("utf8"), "CNPJ :  novo-cnpj\r\nsenha: nova-senha\r\n");
    assert.equal(updated.fields[1].value, "nova-senha");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("recusa sobrescrever uma versão externa mais recente", () => {
  const root = fixture();
  try {
    const plan = readPlanCredentials(root).plans[0];
    assert.throws(() => writePlanCredentials(root, plan.id, "1", plan.fields), /alterado fora do painel/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
