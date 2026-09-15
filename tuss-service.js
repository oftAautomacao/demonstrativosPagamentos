const path = require("node:path");
const { spawn } = require("node:child_process");

const PROCESSOR_PATH = path.join(__dirname, "tuss_processor.py");
const PYTHON_COMMAND = process.env.PYTHON_COMMAND || (process.platform === "win32" ? "python" : "python3");
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 120_000;

function runProcessor(mode, rootPath, reportPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_COMMAND, [PROCESSOR_PATH, mode, rootPath, reportPath], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
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
      finish(reject, new Error("A análise TUSS excedeu o tempo máximo de dois minutos."));
    }, PROCESS_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output, "utf8") > MAX_OUTPUT_BYTES) {
        child.kill();
        finish(reject, new Error("A resposta da análise TUSS excedeu o limite permitido."));
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
        finish(reject, new Error(errorOutput.trim() || "O processador TUSS retornou uma resposta inválida."));
        return;
      }
      if (code !== 0 || !result.ok) {
        finish(reject, new Error(result.error || errorOutput.trim() || "Não foi possível processar os códigos TUSS."));
        return;
      }
      finish(resolve, result);
    });
  });
}

module.exports = {
  analyzeTuss: (rootPath, reportPath) => runProcessor("analyze", rootPath, reportPath),
  applyTussCorrections: (rootPath, reportPath) => runProcessor("apply", rootPath, reportPath),
};
