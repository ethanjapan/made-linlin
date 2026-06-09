// =====================================================================
//  build-gallery.mjs  (v2: コレクション/将来スケール対応)
//  photos/ を走査して以下を生成:
//   - 鑑賞用(長辺2048)/サムネ(長辺700)/ぼかしLQIP/EXIF
//   - data/manifest.json:
//       albums[]      … 従来通りフラット（既存サイトはこれを読む＝見た目不変）
//       collections[] … テーマ/シリーズ等のグループ（将来の階層表示用）
//   - 各 album に collection / series / year / tags / featured / order を付与
//
//  フォルダ構成は2通りを混在OK:
//   (A) ネスト:  photos/<コレクション>/<アルバム>/*.jpg   ← 親フォルダ=コレクション
//   (B) フラット: photos/<アルバム>/*.jpg                 ← _album.json の collection か "未分類"
//   各アルバムに _album.json（任意）、コレクション定義は photos/collections.json（任意）
// =====================================================================
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import exifr from "exifr";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHOTOS_DIR = path.join(ROOT, "photos");
const OUT_IMG = path.join(ROOT, "public", "img");
const MANIFEST = path.join(ROOT, "data", "manifest.json");

const WEB_EDGE = 2048, THUMB_EDGE = 700;
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);
const isImg = (f) => EXT.has(path.extname(f).toLowerCase()) && !f.startsWith(".");

async function readJson(p, fallback = {}) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return fallback; }
}
async function listDirs(dir) {
  try { return (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name); }
  catch { return []; }
}
async function listImages(dir) {
  try { return (await fs.readdir(dir)).filter(isImg).sort(); } catch { return []; }
}

// レスポンシブ＋AVIF: 各画像を full(2048)/mid(1280)/thumb(700) で出力。
//   JPEGは常に出力。AVIFは「fullでJPEGより明確に小さい時だけ」3サイズ出力＝<picture>で重いAVIFを配らせない安全策。
//   命名: full=name.jpg/.avif, mid=name-1280.jpg/.avif, thumb=thumb/name.jpg/.avif
const SIZES = [
  { key: "full",  edge: 2048, q: 80, dir: "" },
  { key: "mid",   edge: 1280, q: 78, dir: "" },
  { key: "thumb", edge: 700,  q: 72, dir: "thumb" },
];
const AVIF_Q = 50, AVIF_EFFORT = 5;

async function processImage(srcPath, outDir, relBase) {
  const name = path.parse(srcPath).name;
  await fs.mkdir(path.join(outDir, "thumb"), { recursive: true });
  const img = sharp(srcPath, { failOn: "none" }).rotate();
  const meta = await img.metadata();

  const baseName = (s) => (s.key === "mid" ? `${name}-1280` : name);
  const relOf = (s, ext) => path.posix.join(relBase, s.dir ? `${s.dir}/` : "", `${baseName(s)}.${ext}`);
  const fileOf = (s, ext) => path.join(outDir, s.dir, `${baseName(s)}.${ext}`);
  const resize = (s) => img.clone().resize(s.edge, s.edge, { fit: "inside", withoutEnlargement: true });

  const jpg = {}, jpgBytes = {};
  for (const s of SIZES) {
    const buf = await resize(s).jpeg({ quality: s.q, mozjpeg: true, chromaSubsampling: "4:4:4" }).withMetadata().toBuffer();
    await fs.writeFile(fileOf(s, "jpg"), buf);
    jpg[s.key] = relOf(s, "jpg"); jpgBytes[s.key] = buf.length;
  }

  // AVIF: fullで判定→明確に小さければ3サイズ採用
  let avif = null;
  const avifFull = await resize(SIZES[0]).avif({ quality: AVIF_Q, effort: AVIF_EFFORT }).toBuffer();
  if (avifFull.length < jpgBytes.full * 0.9) {
    avif = {};
    for (const s of SIZES) {
      const buf = s.key === "full" ? avifFull : await resize(s).avif({ quality: AVIF_Q, effort: AVIF_EFFORT }).toBuffer();
      await fs.writeFile(fileOf(s, "avif"), buf);
      avif[s.key] = relOf(s, "avif");
    }
  }

  const blur = await img.clone().resize(24).blur().jpeg({ quality: 40 }).toBuffer();
  let exif = {};
  try { exif = (await exifr.parse(srcPath, ["DateTimeOriginal", "Model", "LensModel", "FNumber", "ISO", "FocalLength"])) || {}; } catch {}
  const longEdge = Math.max(meta.width || 0, meta.height || 0);
  const ratio = longEdge ? Math.min(WEB_EDGE / longEdge, 1) : 1;
  return {
    full: jpg.full, thumb: jpg.thumb,        // 後方互換（従来の単一URL）
    jpg, avif,                               // レスポンシブ＋AVIF（picture/srcset用。avif=nullなら未採用）
    w: Math.round((meta.width || 0) * ratio), h: Math.round((meta.height || 0) * ratio),
    blur: `data:image/jpeg;base64,${blur.toString("base64")}`,
    date: exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal).toISOString().slice(0, 10) : null,
    camera: exif.Model || null, lens: exif.LensModel || null,
    f: exif.FNumber ? `f/${exif.FNumber}` : null, iso: exif.ISO ? `ISO${exif.ISO}` : null,
    focal: exif.FocalLength ? `${Math.round(exif.FocalLength)}mm` : null,
  };
}

// 1アルバム分を構築（dir=アルバムフォルダ, collectionName=所属コレクション名 or null）
async function buildAlbum(dir, folderName, collectionName) {
  const files = await listImages(dir);
  if (!files.length) return null;
  const meta = await readJson(path.join(dir, "_album.json"));
  const slug = meta.slug || folderName;
  const outDir = path.join(OUT_IMG, slug);
  const relBase = path.posix.join("public", "img", slug);
  await fs.mkdir(outDir, { recursive: true });

  const photos = [];
  for (const file of files) {
    try { photos.push(await processImage(path.join(dir, file), outDir, relBase)); }
    catch (e) { console.warn(`  ⚠ ${file}: ${e.message}`); }
  }
  if (!photos.length) return null;
  photos.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  // 年: _album.json優先、無ければ撮影日の最頻年
  let year = meta.year || null;
  if (!year) {
    const years = photos.map((p) => p.date && p.date.slice(0, 4)).filter(Boolean);
    if (years.length) { const c = {}; years.forEach((y) => (c[y] = (c[y] || 0) + 1)); year = +Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; }
  }
  // 表紙: _album.json の cover(ファイル名)に一致する写真、無ければ先頭
  const coverPhoto = meta.cover
    ? (photos.find((p) => path.parse(p.full).name === path.parse(meta.cover).name) || photos[0])
    : photos[0];
  return {
    slug,
    title: meta.title || folderName,
    subtitle: meta.subtitle || "",
    collection: meta.collection || collectionName || "未分類",
    series: meta.series || null,
    year: year || null,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    featured: !!meta.featured,
    order: meta.order ?? 999,
    cover: coverPhoto.full,                                        // 後方互換（単一URL）
    coverSet: { jpg: coverPhoto.jpg, avif: coverPhoto.avif },      // レスポンシブ＋AVIF
    count: photos.length,
    photos,
  };
}

async function main() {
  const collectionsMeta = await readJson(path.join(PHOTOS_DIR, "collections.json")); // 任意: {名前:{slug,title,order,description}}
  const topDirs = (await listDirs(PHOTOS_DIR)).sort();
  const albums = [];

  for (const top of topDirs) {
    const topPath = path.join(PHOTOS_DIR, top);
    const imgsHere = await listImages(topPath);
    if (imgsHere.length) {
      // (B) フラット: top自体がアルバム
      console.log(`▶ [album] ${top} … ${imgsHere.length}枚`);
      const a = await buildAlbum(topPath, top, null);
      if (a) albums.push(a);
    } else {
      // (A) ネスト: top=コレクション, 配下=アルバム
      const subAlbums = (await listDirs(topPath)).sort();
      for (const sub of subAlbums) {
        const subPath = path.join(topPath, sub);
        const n = (await listImages(subPath)).length;
        if (!n) continue;
        console.log(`▶ [${top}] ${sub} … ${n}枚`);
        const a = await buildAlbum(subPath, sub, top);
        if (a) albums.push(a);
      }
    }
  }

  albums.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  // コレクション一覧を構築（出現順 + collections.json のメタ/並び）
  const colMap = new Map();
  for (const a of albums) {
    if (!colMap.has(a.collection)) {
      const m = collectionsMeta[a.collection] || {};
      colMap.set(a.collection, {
        slug: m.slug || a.collection,
        title: m.title || a.collection,
        description: m.description || "",
        order: m.order ?? 999,
        albumSlugs: [],
      });
    }
    colMap.get(a.collection).albumSlugs.push(a.slug);
    a.collectionTitle = colMap.get(a.collection).title;
    a.collectionSlug = colMap.get(a.collection).slug;
  }
  const collections = [...colMap.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  const manifest = {
    site: { title: "made_linlin — Photography", author: "made_linlin" },
    generatedAt: new Date().toISOString(),
    schema: 2,
    collections,
    albums,
  };
  await fs.mkdir(path.dirname(MANIFEST), { recursive: true });
  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`✓ manifest.json 生成: ${collections.length}コレクション / ${albums.length}アルバム / 計${albums.reduce((n, a) => n + a.count, 0)}枚`);
}

main().catch((e) => { console.error(e); process.exit(1); });
