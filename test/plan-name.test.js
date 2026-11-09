const test = require("node:test");
const assert = require("node:assert/strict");
const { canonicalPlanName, normalizedPlanKey, samePlanName } = require("../plan-name");

test("padroniza as variações de FioSaude como Fio Saúde", () => {
  for (const name of ["FioSaude", "Fio Saude", "Fio Saúde", "fio_saude"]) {
    assert.equal(canonicalPlanName(name), "Fio Saúde");
  }
  assert.equal(normalizedPlanKey("Fio Saúde"), "fiosaude");
  assert.equal(samePlanName("FioSaude", "Fio Saúde"), true);
});

test("mantém Caberj Integral com a grafia visual separada", () => {
  assert.equal(canonicalPlanName("CaberjIntegral"), "Caberj Integral");
  assert.equal(canonicalPlanName("Caberj Integral"), "Caberj Integral");
});

test("padroniza Itaú e Porto Seguro para exibição", () => {
  assert.equal(canonicalPlanName("Itau"), "Itaú");
  assert.equal(canonicalPlanName("Itaú"), "Itaú");
  assert.equal(canonicalPlanName("PortoSeguro"), "Porto Seguro");
  assert.equal(canonicalPlanName("Porto_Seguro"), "Porto Seguro");
});
