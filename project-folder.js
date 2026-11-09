const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function resolveProjectFolder(report, reportsRoot) {
  const root = path.resolve(String(reportsRoot || ""));
  const filePath = path.resolve(String(report?.filePath || ""));
  const folder = path.dirname(filePath);
  const relative = path.relative(root, folder);
  if (!report?.filePath || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("A pasta do projeto não pertence ao diretório de relatórios configurado.");
  }
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error("A pasta deste projeto não foi encontrada.");
  }
  return folder;
}

function resolveRelativeProjectFolder(relativeFolder, reportsRoot) {
  const root = path.resolve(String(reportsRoot || ""));
  const requested = String(relativeFolder || "").trim();
  if (!requested || path.isAbsolute(requested)) {
    throw new Error("O local relativo do projeto é inválido.");
  }
  const folder = path.resolve(root, requested);
  const relative = path.relative(root, folder);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("A pasta do projeto não pertence ao diretório de relatórios configurado.");
  }
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error("A pasta deste projeto não foi encontrada.");
  }
  return folder;
}

function launchFolder(folder, {
  platform = process.platform,
  spawnImpl = spawn,
} = {}) {
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  const windowsPowerShell = path.join(windowsRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const commands = {
    win32: [windowsPowerShell, [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Invoke-Item -LiteralPath $env:DEMONST_PROJECT_FOLDER",
    ]],
    darwin: ["open", [folder]],
    linux: ["xdg-open", [folder]],
  };
  const command = commands[platform];
  if (!command) throw new Error("Este sistema não possui um explorador de arquivos compatível.");
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(command[0], command[1], {
        stdio: "ignore",
        windowsHide: true,
        env: platform === "win32"
          ? { ...process.env, DEMONST_PROJECT_FOLDER: folder }
          : process.env,
      });
    } catch (error) {
      reject(new Error(`O Explorador do Windows não pôde ser iniciado: ${error.message}`));
      return;
    }
    const timeout = setTimeout(() => {
      reject(new Error("O Explorador do Windows não confirmou a abertura da pasta."));
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`O Explorador do Windows não pôde ser iniciado: ${error.message}`));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ opened: true, folder, method: platform === "win32" ? "windows-shell" : platform });
      else reject(new Error(`O sistema não conseguiu abrir a pasta (código ${code ?? "desconhecido"}).`));
    });
  });
}

function openProjectFolder(report, reportsRoot, options = {}) {
  return launchFolder(resolveProjectFolder(report, reportsRoot), options);
}

function openRelativeProjectFolder(relativeFolder, reportsRoot, options = {}) {
  return launchFolder(resolveRelativeProjectFolder(relativeFolder, reportsRoot), options);
}

module.exports = {
  launchFolder,
  openProjectFolder,
  openRelativeProjectFolder,
  resolveProjectFolder,
  resolveRelativeProjectFolder,
};
