const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { loadReports } = require("./report-parser");

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const LOCAL_REPORTS_CONFIG = path.join(__dirname, ".reports-root");
const REPORTS_ROOT = getReportsRoot();
const SHOULD_OPEN = process.argv.includes("--open");

function getReportsRoot() {
  if (process.env.REPORTS_ROOT?.trim()) {
    return process.env.REPORTS_ROOT.trim();
  }

  if (fs.existsSync(LOCAL_REPORTS_CONFIG)) {
    const configuredPath = fs.readFileSync(LOCAL_REPORTS_CONFIG, "utf8").trim();
    if (configuredPath) return configuredPath;
  }

  return path.join(__dirname, "relatorios");
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function serveStatic(request, response) {
  const requestPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Arquivo não encontrado");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(response);
}

function openBrowser(url) {
  if (!SHOULD_OPEN) return;
  const commands = {
    win32: ["cmd.exe", ["/c", "start", "", url]],
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
  };
  const command = commands[process.platform];
  if (!command) return;
  const child = spawn(command[0], command[1], { detached: true, stdio: "ignore" });
  child.unref();
}

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url.startsWith("/api/reports")) {
    try {
      sendJson(response, 200, loadReports(REPORTS_ROOT));
    } catch (error) {
      sendJson(response, 500, {
        error: "Não foi possível ler os relatórios.",
        detail: error.message,
        rootPath: REPORTS_ROOT,
      });
    }
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Método não permitido");
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`Painel disponível em ${url}`);
  console.log(`Lendo relatórios de: ${REPORTS_ROOT}`);
  if (SHOULD_OPEN) {
    console.log("Abrindo o painel no navegador...");
    openBrowser(url);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`A porta ${PORT} já está em uso. Feche o painel que já está aberto e tente novamente.`);
  } else {
    console.error("Não foi possível iniciar o painel:", error.message);
  }
  process.exitCode = 1;
});
