const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const {
  openRelativeProjectFolder,
  resolveProjectFolder,
  resolveRelativeProjectFolder,
} = require("../project-folder");

test("abre no Explorador a pasta relativa da competência sem reler os relatórios", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "projeto-demonstrativo-"));
  const folder = path.join(root, "CaberjIntegral", "OUTUBRO_2026");
  fs.mkdirSync(folder, { recursive: true });
  let spawned;
  try {
    const result = await openRelativeProjectFolder(path.join("CaberjIntegral", "OUTUBRO_2026"), root, {
      platform: "win32",
      spawnImpl(command, args, options) {
        spawned = { command, args, options };
        const child = new EventEmitter();
        queueMicrotask(() => child.emit("close", 0));
        return child;
      },
    });
    assert.equal(result.folder, folder);
    assert.equal(result.method, "windows-shell");
    assert.match(spawned.command, /[\\/]powershell\.exe$/i);
    assert.match(spawned.args.join(" "), /Invoke-Item -LiteralPath/);
    assert.equal(spawned.options.env.DEMONST_PROJECT_FOLDER, folder);
    assert.equal(spawned.options.windowsHide, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("impede abrir uma pasta fora da raiz configurada", () => {
  const root = path.join(os.tmpdir(), "raiz-demonstrativos");
  assert.throws(() => resolveProjectFolder({
    filePath: path.join(os.tmpdir(), "fora", "relatorio.txt"),
  }, root), /não pertence ao diretório/);
  assert.throws(() => resolveRelativeProjectFolder("..\\fora", root), /não pertence ao diretório/);
});
