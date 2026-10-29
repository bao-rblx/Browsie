// Copies Tesseract.js into extension/vendor. MV3 forbids remotely-hosted code, so the
// library, worker and WASM core must ship inside the extension package.
// Language data (*.traineddata) is data, not code, and is fetched from the CDN on first use.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "vendor", "tesseract");
mkdirSync(join(out, "core"), { recursive: true });

const tjs = join(root, "node_modules", "tesseract.js", "dist");
cpSync(join(tjs, "tesseract.min.js"), join(out, "tesseract.min.js"));
cpSync(join(tjs, "worker.min.js"), join(out, "worker.min.js"));

const core = join(root, "node_modules", "tesseract.js-core");
for (const f of [
  "tesseract-core.wasm.js", "tesseract-core-simd.wasm.js",
  "tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js",
]) cpSync(join(core, f), join(out, "core", f));

console.log("Vendored Tesseract.js ->", out);
