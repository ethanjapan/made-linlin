import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = path.join(ROOT, "public/img/scene/morning.jpg");
const out = path.join(ROOT, "public/og.jpg");
const svg = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.38" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.62"/>
  </linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="86" y="546" font-family="Georgia,'Times New Roman',serif" font-size="78" fill="#f4efe7">made_linlin</text>
  <text x="90" y="590" font-family="Helvetica,Arial,sans-serif" font-size="21" fill="#e9c9a0" letter-spacing="9">PHOTOGRAPHY</text>
</svg>`);
await sharp(base).resize(1200, 630, { fit: "cover", position: "attention" })
  .composite([{ input: svg, top: 0, left: 0 }])
  .jpeg({ quality: 85, mozjpeg: true }).toFile(out);
const meta = await sharp(out).metadata();
console.log(`og.jpg: ${meta.width}x${meta.height}`);
