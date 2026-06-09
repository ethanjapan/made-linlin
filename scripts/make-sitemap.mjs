// sitemap.xml を生成（トップ・作品一覧・各アルバムURL）。manifest からアルバムを自動列挙。
// SITE_URL（公開URL）と SITEMAP_OUT（出力先）は環境変数で上書き可。
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = (process.env.SITE_URL || "https://ethanjapan.github.io/made-linlin").replace(/\/+$/, "");
const OUT = process.env.SITEMAP_OUT || path.join(ROOT, "sitemap.xml");

let m = { albums: [] };
try { m = JSON.parse(await fs.readFile(path.join(ROOT, "data", "manifest.json"), "utf8")); } catch {}

const today = new Date().toISOString().slice(0, 10);
const urls = [`${SITE}/`, `${SITE}/gallery.html`];
for (const a of (m.albums || [])) urls.push(`${SITE}/album.html?album=${encodeURIComponent(a.slug)}&from=collections`);

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u.replace(/&/g, "&amp;")}</loc><lastmod>${today}</lastmod></url>`).join("\n") +
  `\n</urlset>\n`;

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, xml);
console.log(`sitemap: ${urls.length} URLs → ${OUT}`);
