"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { listPersonas } = require("../preview/wpay/demo-fixtures");
const { getPreviewModel } = require("../preview/wpay/preview-model");

const ASSETS = Object.freeze({
  "/": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"]
});
function createPreviewServer() {
  // Explicit files only; no path assembled from an incoming URL.
  const assets = new Map(Object.entries(ASSETS).map(([url, [file, mime]]) => [url, { mime, body: fs.readFileSync(path.join(__dirname, "../preview/wpay/web", file)) }]));
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    const send = (status, value) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); };
    // Host and Origin restrictions keep this demo off cross-origin browser pages.
    const expectedHost = `127.0.0.1:${server.address()?.port}`;
    if (req.headers.host !== expectedHost || (req.headers.origin && req.headers.origin !== `http://${expectedHost}`)) return send(403, { error: "PREVIEW_ORIGIN_REQUIRED" });
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return send(405, { error: "METHOD_NOT_ALLOWED" }); }
    const raw = req.url || "";
    // Validate the raw target before URL normalization can erase dot segments.
    if (!raw.startsWith("/") || raw.startsWith("//") || /[%\\\u0000-\u0020#]/.test(raw) || raw.split("?")[0].split("/").some(part => part === "." || part === "..")) return send(400, { error: "INVALID_PREVIEW_PATH" });
    const [pathname, query = "", ...extra] = raw.split("?");
    if (extra.length) return send(400, { error: "INVALID_QUERY" });
    if (pathname === "/favicon.ico" && !query) { res.writeHead(204); return res.end(); }
    const asset = assets.get(pathname);
    if (asset) {
      if (query) return send(400, { error: "INVALID_QUERY" });
      res.writeHead(200, { "Content-Type": asset.mime }); return res.end(asset.body);
    }
    if (pathname === "/demo/personas") {
      if (query) return send(400, { error: "INVALID_QUERY" });
      return send(200, { demo: true, personas: listPersonas() });
    }
    if (pathname === "/demo/model") {
      if (!/^persona=[a-z]+$/.test(query)) return send(400, { error: "INVALID_DEMO_SELECTION" });
      const model = getPreviewModel(query.slice(8));
      if (!model) return send(404, { error: "UNKNOWN_DEMO_PERSONA" });
      return send(200, model);
    }
    return send(404, { error: "PREVIEW_NOT_FOUND" });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
function startPreviewServer({ port = 4173 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) return Promise.reject(new Error("INVALID_PREVIEW_PORT"));
  const server = createPreviewServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(server); });
  });
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--port" || !/^\d{1,5}$/.test(args[1]) || Number(args[1]) < 1 || Number(args[1]) > 65535) {
    console.error("Usage: node scripts/serve-wpay-preview.js --port 4173"); process.exitCode = 1;
  } else {
    startPreviewServer({ port: Number(args[1]) }).then(server => {
      console.log(`WPay demo preview: http://127.0.0.1:${server.address().port} — no live transactions`);
      for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
    }).catch(() => { console.error("Preview could not start. Check that the loopback port is available."); process.exitCode = 1; });
  }
}
module.exports = Object.freeze({ createPreviewServer, startPreviewServer });
