// Dev-only preview server: serves extension/ and injects a fake chrome.* API into every
// HTML page so the real popup / options / consent / content UI can be viewed in a normal tab.
// Not part of the extension package. Run: node extension/dev/serve.mjs  → http://localhost:5173
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 5173);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json",
};
const STUB = '<script src="/dev/chrome-stub.js"></script>';

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") path = "/dev/index.html";
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    let body = await readFile(file);
    const type = TYPES[extname(file)] || "application/octet-stream";
    if (type.startsWith("text/html") && !path.startsWith("/dev/index")) {
      body = body.toString().replace(/<head>/i, `<head>${STUB}`);
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Browsie UI preview → http://localhost:${PORT}`));
