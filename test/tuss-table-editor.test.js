const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, "..");

test("lê, edita e exclui linhas das tabelas de ajuste TUSS", async () => {
  const command = process.platform === "win32" ? "python" : "python3";
  const { stdout, stderr } = await execFileAsync(command, [
    "-m", "unittest", "discover", "-s", "test", "-p", "test_tuss_table_editor.py",
  ], { cwd: projectRoot, windowsHide: true, timeout: 60_000 });
  assert.match(`${stdout}\n${stderr}`, /Ran 5 tests/);
  assert.match(`${stdout}\n${stderr}`, /OK/);
});
