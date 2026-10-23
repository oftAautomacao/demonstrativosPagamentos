const test = require("node:test");
const assert = require("node:assert/strict");

const { comparableValue, compareCellValues } = require("../public/table-sort");

test("compara valores monetários e números no formato brasileiro", () => {
  assert.equal(comparableValue("R$ 1.234,56").value, 1234.56);
  assert.ok(compareCellValues("R$ 25,00", "R$ 100,00") < 0);
  assert.ok(compareCellValues("1.500", "320") > 0);
});

test("compara datas cronologicamente", () => {
  assert.ok(compareCellValues("09/10/2026", "19/10/2026") < 0);
  assert.ok(compareCellValues("09/10/2026", "19/10/2026", -1) > 0);
});

test("faz ordenação natural de texto e mantém vazios no fim", () => {
  assert.ok(compareCellValues("Guia 2", "Guia 10") < 0);
  assert.ok(compareCellValues("—", "Sulamérica") > 0);
  assert.ok(compareCellValues("", "Sulamérica", -1) > 0);
});
