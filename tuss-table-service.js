const path = require("node:path");
const { spawn } = require("node:child_process");

const EDITOR_PATH = path.join(__dirname, "tuss_table_editor.py");
const PYTHON_COMMAND = process.env.PYTHON_COMMAND || (process.platform === "win32" ? "python" : "python3");
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 60_000;

function runEditor(mode, rootPath, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_COMMAND, [EDITOR_PATH, mode, rootPath], {
      windowsHide: true,
      stdio: [payload ? "pipe" : "ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONUTF8: "1" },
    });
    let output = "";
    let errorOutput = "";
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(reject, new Error("A leitura da tabela TUSS excedeu o tempo máximo."));
    }, PROCESS_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output, "utf8") > MAX_OUTPUT_BYTES) {
        child.kill();
        finish(reject, new Error("A tabela TUSS excedeu o limite permitido."));
      }
    });
    child.stderr.on("data", (chunk) => { errorOutput += chunk; });
    child.on("error", (error) => {
      const message = error.code === "ENOENT"
        ? "Python não foi encontrado. Instale o Python e execute: pip install -r requirements.txt"
        : error.message;
      finish(reject, new Error(message));
    });
    child.on("close", (code) => {
      if (settled) return;
      let result;
      try {
        result = JSON.parse(output.trim());
      } catch {
        finish(reject, new Error(errorOutput.trim() || "O editor TUSS retornou uma resposta inválida."));
        return;
      }
      if (code !== 0 || !result.ok) {
        finish(reject, new Error(result.error || errorOutput.trim() || "Não foi possível processar a tabela TUSS."));
        return;
      }
      finish(resolve, result);
    });

    if (payload) child.stdin.end(JSON.stringify(payload));
  });
}

module.exports = {
  listTussTables: (rootPath) => runEditor("list", rootPath),
  saveTussTable: (rootPath, payload) => runEditor("save", rootPath, payload),
};
