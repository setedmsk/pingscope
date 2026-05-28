import http from "node:http";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const history = [];

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"]
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16_384) {
        reject(new Error("Payload muito grande."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function parseNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function validateTarget(value) {
  const target = String(value || "").trim();

  if (!target) {
    return { error: "Informe um IP ou dominio." };
  }

  if (target.length > 253) {
    return { error: "Destino muito longo." };
  }

  if (/[\s/\\]/.test(target) || target.startsWith("-")) {
    return { error: "Use apenas IP ou dominio, sem espacos ou barras." };
  }

  if (net.isIP(target)) {
    return { target };
  }

  if (target.includes(":")) {
    return { error: "IPv6 invalido." };
  }

  const labels = target.split(".");
  const validDomain = labels.every((label) => {
    return (
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-zA-Z0-9_][a-zA-Z0-9_-]*[a-zA-Z0-9_]$|^[a-zA-Z0-9_]$/.test(label)
    );
  });

  if (!validDomain) {
    return { error: "Dominio invalido." };
  }

  return { target: target.toLowerCase() };
}

function pingArgs(target, options) {
  const timeoutMs = parseNumber(options.timeoutMs, 2500, 500, 10_000);
  const count = parseNumber(options.count, 1, 1, 4);

  if (process.platform === "win32") {
    return {
      command: "ping",
      args: ["-n", String(count), "-w", String(timeoutMs), target],
      timeoutMs
    };
  }

  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  return {
    command: "ping",
    args: ["-c", String(count), "-W", String(timeoutSeconds), target],
    timeoutMs
  };
}

function toNumber(value) {
  return Number(String(value).replace(",", "."));
}

function parsePingOutput(output) {
  const timeMatches = [...output.matchAll(/(?:time|tempo)[=<]\s*([\d.,]+)\s*ms/gi)];
  const times = timeMatches
    .map((match) => toNumber(match[1]))
    .filter((value) => Number.isFinite(value));

  const rttMatch = output.match(/=\s*([\d.,]+)\/([\d.,]+)\/([\d.,]+)\/([\d.,]+)\s*ms/i);
  const averageMatch =
    output.match(/(?:average|media|m.dia)[^=\d]*=\s*([\d.,]+)\s*ms/i) ||
    output.match(/(?:avg)[^=\d]*=\s*([\d.,]+)\s*ms/i);

  let latencyMs = null;
  if (times.length) {
    latencyMs = Math.round((times.reduce((total, value) => total + value, 0) / times.length) * 10) / 10;
  } else if (rttMatch) {
    latencyMs = Math.round(toNumber(rttMatch[2]) * 10) / 10;
  } else if (averageMatch) {
    latencyMs = Math.round(toNumber(averageMatch[1]) * 10) / 10;
  }

  const lossMatch =
    output.match(/(\d+(?:[\.,]\d+)?)%\s*(?:packet loss|loss|perda)/i) ||
    output.match(/\((\d+(?:[\.,]\d+)?)%\s*(?:packet loss|loss|perda)/i);
  const packetLoss = lossMatch ? toNumber(lossMatch[1]) : null;

  return { latencyMs, packetLoss };
}

function runPing(target, options) {
  const { command, args, timeoutMs } = pingArgs(target, options);
  const startedAt = performance.now();

  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        timeout: timeoutMs + 1500,
        windowsHide: true,
        maxBuffer: 64_000
      },
      (error, stdout, stderr) => {
        const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
        const output = `${stdout || ""}\n${stderr || ""}`.trim();
        const parsed = parsePingOutput(output);
        const online = !error && (parsed.packetLoss === null || parsed.packetLoss < 100);

        resolve({
          target,
          online,
          latencyMs: online ? parsed.latencyMs ?? durationMs : null,
          durationMs,
          packetLoss: parsed.packetLoss,
          checkedAt: new Date().toISOString(),
          raw: output.split(/\r?\n/).slice(-8).join("\n"),
          error: error ? readablePingError(error) : null
        });
      }
    );
  });
}

function readablePingError(error) {
  if (error.killed || error.signal === "SIGTERM") {
    return "Tempo esgotado.";
  }

  if (error.code === "ENOENT") {
    return "Comando ping nao encontrado neste sistema.";
  }

  return "Sem resposta do destino.";
}

async function handlePing(request, response, url) {
  try {
    let payload = {};
    if (request.method === "POST") {
      const body = await readBody(request);
      payload = body ? JSON.parse(body) : {};
    } else {
      payload = Object.fromEntries(url.searchParams);
    }

    const validation = validateTarget(payload.target);
    if (validation.error) {
      sendJson(response, 400, { ok: false, error: validation.error });
      return;
    }

    const result = await runPing(validation.target, {
      timeoutMs: payload.timeoutMs,
      count: payload.count
    });

    history.unshift(result);
    history.splice(50);

    sendJson(response, 200, { ok: true, result });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: error instanceof SyntaxError ? "JSON invalido." : error.message
    });
  }
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(requested);
  const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);
  const relative = path.relative(publicDir, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const contents = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "content-type": mimeTypes.get(extension) || "application/octet-stream",
      "cache-control": extension === ".html" ? "no-store" : "public, max-age=3600"
    });
    response.end(contents);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, platform: process.platform });
    return;
  }

  if (url.pathname === "/api/history") {
    sendJson(response, 200, { ok: true, history });
    return;
  }

  if (url.pathname === "/api/ping" && (request.method === "POST" || request.method === "GET")) {
    await handlePing(request, response, url);
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
    return;
  }

  await serveStatic(response, url.pathname);
});

server.listen(port, host, () => {
  const localUrl = `http://localhost:${port}`;
  const lanUrls = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${port}`);

  console.log(`PingScope rodando em ${localUrl}`);
  for (const lanUrl of lanUrls) {
    console.log(`Celular na mesma rede: ${lanUrl}`);
  }
});
