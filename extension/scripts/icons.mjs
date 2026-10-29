// Generates icons/icon{16,32,48,128}.png with no dependencies (node:zlib only).
// Design: blue rounded square with a white shield-ish circle and a red dot.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
mkdirSync(out, { recursive: true });

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function pixel(x, y, s) {
  const u = (x + 0.5) / s, v = (y + 0.5) / s;
  // rounded square mask
  const r = 0.22, dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
  const d = Math.hypot(u - 0.5, v - 0.52);
  if (Math.hypot(u - 0.68, v - 0.32) < 0.12) return [217, 48, 37, 255];       // red dot
  if (d < 0.27 && d > 0.17) return [255, 255, 255, 255];                       // white ring
  if (d < 0.08) return [255, 255, 255, 255];                                   // pupil
  return [26, 115, 232, 255];                                                  // blue
}

for (const size of [16, 32, 48, 128]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const p = pixel(x, y, size);
      p.forEach((c, i) => (raw[y * (size * 4 + 1) + 1 + x * 4 + i] = c));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(join(out, `icon${size}.png`), png);
}
console.log("Icons written to", out);
