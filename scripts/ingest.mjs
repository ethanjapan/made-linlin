// =====================================================================
//  ingest.mjs — 写真の自動取り込み（半自動）
//  _inbox/ に入れた写真を:
//   1) EXIF読取（撮影日/機種/レンズ/F/ISO/焦点）  ※exifr
//   2) ローカル Qwen-VL（Ollama）で内容分類（コレクション/タグ/時間帯/タイトル案）
//   3) 撮影日ごとに photos/<コレクション>/<日付>/ へ振り分け＋_album.json生成
//   4) 結果を表示 → あなたがローカルで確認 → 問題なければ自分で push（公開）
//
//  使い方:
//    node scripts/ingest.mjs            … 解析＆振り分け（公開はしない＝確認用）
//    node scripts/ingest.mjs --dry      … 解析だけ（ファイルは動かさない・確認のみ）
//    node scripts/ingest.mjs --publish  … 振り分け後にそのまま build+commit+push まで実行
//
//  前提: Mac の Ollama に vision モデル（既定 qwen2.5vl:7b）。無ければタグ無しで日付分類のみ。
// =====================================================================
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import exifr from "exifr";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = path.join(ROOT, "_inbox");
const PHOTOS = path.join(ROOT, "photos");
// ※ "localhost" は Node fetch が IPv6(::1) を優先し別Ollamaに当たる事があるため 127.0.0.1 固定
const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODEL = process.env.VLM || "qwen2.5vl:7b";
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry");
const PUBLISH = args.has("--publish");

// コレクション名(日本語) → slug。未知は romaji 風の簡易slug。
const COL_SLUG = {
  "風景": "landscape", "夜景": "cityscape", "ポートレート": "portrait",
  "街": "street", "花": "flower", "静物": "stilllife", "動物": "animal", "その他": "misc",
};
const COL_DESC = {
  "風景": "自然と光のあいだ", "夜景": "灯りと都市", "ポートレート": "人と光",
  "街": "街の呼吸", "花": "咲くもの", "静物": "静かなもの", "動物": "いきもの", "その他": "雑記",
};

const isImg = (f) => EXT.has(path.extname(f).toLowerCase()) && !f.startsWith(".");
const slugify = (s) => (s || "").toString().normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "set";

async function listInbox() {
  try { return (await fs.readdir(INBOX)).filter(isImg).sort(); }
  catch { return []; }
}

async function readExif(p) {
  let e = {};
  try { e = (await exifr.parse(p, ["DateTimeOriginal", "CreateDate", "Model", "LensModel", "FNumber", "ISO", "FocalLength"])) || {}; } catch {}
  const dt = e.DateTimeOriginal || e.CreateDate || null;
  return {
    date: dt ? new Date(dt).toISOString().slice(0, 10) : null,
    camera: e.Model || null, lens: e.LensModel || null,
    f: e.FNumber ? `f/${e.FNumber}` : null, iso: e.ISO ? `ISO${e.ISO}` : null,
    focal: e.FocalLength ? `${Math.round(e.FocalLength)}mm` : null,
  };
}

const PROMPT =
  "この写真を見て、次のJSONだけを返してください（前置き・説明は一切なし）。\n" +
  '{"collection":"風景|夜景|ポートレート|街|花|静物|動物|その他 のどれか1つ",' +
  '"time_of_day":"昼|夕|夜",' +
  '"tags":["内容を表す日本語タグを3〜5個"],' +
  '"title_hint":"この一枚に合う短い詩的な日本語のアルバム名候補（10文字前後）"}';

async function analyze(p) {
  try {
    const b64 = (await fs.readFile(p)).toString("base64");
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt: PROMPT, images: [b64], stream: false, format: "json", options: { temperature: 0.2 } }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const j = await res.json();
    const o = JSON.parse(j.response);
    return {
      collection: COL_SLUG[o.collection] ? o.collection : "その他",
      time: o.time_of_day || null,
      tags: Array.isArray(o.tags) ? o.tags.slice(0, 5) : [],
      title: (o.title_hint || "").toString().slice(0, 24),
    };
  } catch (e) {
    return { collection: null, time: null, tags: [], title: null, err: e.message };
  }
}

const mode = (arr) => { const c = {}; arr.filter(Boolean).forEach((x) => (c[x] = (c[x] || 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null; };
const topTags = (arrs, k = 4) => { const c = {}; arrs.flat().forEach((t) => (c[t] = (c[t] || 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, k).map((x) => x[0]); };

async function main() {
  const files = await listInbox();
  if (!files.length) { console.log(`\n  _inbox/ に写真がありません。\n  → ${INBOX} に写真を入れてから再実行してください。\n`); return; }

  // VLM 到達確認
  let vlmOk = false;
  try { const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) }); vlmOk = r.ok && JSON.stringify(await r.json()).includes(MODEL.split(":")[0]); } catch {}
  console.log(`\n  取り込み: ${files.length}枚 / VLM(${MODEL}): ${vlmOk ? "ON" : "OFF（タグ無し・日付分類のみ）"}\n`);

  const items = [];
  for (let i = 0; i < files.length; i++) {
    const src = path.join(INBOX, files[i]);
    const exif = await readExif(src);
    const vis = vlmOk ? await analyze(src) : { collection: null, tags: [], title: null, time: null };
    process.stdout.write(`\r  解析 ${i + 1}/${files.length}  ${files[i].slice(0, 24).padEnd(24)} ${vis.collection || "-"}      `);
    items.push({ file: files[i], src, exif, vis, date: exif.date || "undated" });
  }
  console.log("\n");

  // 撮影日でグループ化 → 各日 = 1アルバム（コレクションは多数決）
  const groups = {};
  items.forEach((it) => { (groups[it.date] ||= []).push(it); });

  const plan = [];
  for (const [date, list] of Object.entries(groups).sort()) {
    const colJa = mode(list.map((x) => x.vis.collection)) || "その他";
    const colSlug = COL_SLUG[colJa] || slugify(colJa);
    const title = mode(list.map((x) => x.vis.title)) || (date !== "undated" ? `${date} の記録` : "未分類");
    const tags = topTags(list.map((x) => x.vis.tags));
    const year = date !== "undated" ? Number(date.slice(0, 4)) : null;
    plan.push({ date, colJa, colSlug, title, tags, year, items: list });
  }

  // 表示（確認用）
  console.log("  === 振り分け案 ===");
  plan.forEach((a) => {
    console.log(`  ▸ [${a.colJa}] ${a.title}  (${a.items.length}枚 / ${a.date}${a.year ? " / " + a.year : ""})`);
    console.log(`     tags: ${a.tags.join(" , ") || "—"}`);
    const cam = a.items[0].exif;
    console.log(`     EXIF例: ${[cam.date, cam.camera, cam.lens, cam.f, cam.iso].filter(Boolean).join(" · ") || "なし(リサイズで消えた可能性)"}`);
  });
  console.log("");

  if (DRY) { console.log("  --dry: ファイルは移動していません。\n"); return; }

  // photos/ へ振り分け（コピー）＋ _album.json
  const collectionsPath = path.join(PHOTOS, "collections.json");
  let collections = {};
  try { collections = JSON.parse(await fs.readFile(collectionsPath, "utf8")); } catch {}
  let order = Math.max(0, ...Object.values(collections).map((c) => c.order || 0));

  for (const a of plan) {
    const albumSlug = a.date !== "undated" ? a.date : `set-${slugify(a.title)}`;
    const dir = path.join(PHOTOS, a.colJa, albumSlug);
    await fs.mkdir(dir, { recursive: true });
    for (const it of a.items) await fs.copyFile(it.src, path.join(dir, it.file));
    const album = {
      slug: `${a.colSlug}-${albumSlug}`.replace(/[^\w-]/g, "-"),
      title: a.title, subtitle: "", collection: a.colJa,
      year: a.year, tags: a.tags, featured: false,
    };
    await fs.writeFile(path.join(dir, "_album.json"), JSON.stringify(album, null, 2));
    if (!collections[a.colJa]) collections[a.colJa] = { slug: a.colSlug, title: a.colJa, description: COL_DESC[a.colJa] || "", order: ++order };
  }
  await fs.writeFile(collectionsPath, JSON.stringify(collections, null, 2));

  // 取り込んだ元を _inbox/_done へ退避（重複取り込み防止）
  const done = path.join(INBOX, "_done");
  await fs.mkdir(done, { recursive: true });
  for (const it of items) await fs.rename(it.src, path.join(done, it.file)).catch(() => {});

  console.log(`  ✓ ${plan.length}アルバム / 計${items.length}枚を photos/ に振り分けました。`);
  console.log(`    元写真は _inbox/_done/ に退避済み（不要なら削除可）。\n`);
  console.log("  次の手順:");
  console.log("   1) Finder で photos/ を確認・必要なら _album.json のタイトル/タグ/featured を調整");
  console.log("   2) ローカルプレビューで見た目を確認");
  console.log("   3) 問題なければ: git add -A && git commit -m \"写真を追加\" && git push\n");

  if (PUBLISH) {
    console.log("  --publish: build→commit→push を実行します…");
    execFileSync("node", ["build-gallery.mjs"], { cwd: path.join(ROOT, "scripts"), stdio: "inherit" });
    execFileSync("git", ["-C", ROOT, "add", "-A"], { stdio: "inherit" });
    execFileSync("git", ["-C", ROOT, "commit", "-m", `写真を追加（${plan.length}アルバム/${items.length}枚）`], { stdio: "inherit" });
    execFileSync("git", ["-C", ROOT, "push"], { stdio: "inherit" });
    console.log("  ✓ 公開しました。\n");
  }
}

main().catch((e) => { console.error("\nエラー:", e.message); process.exit(1); });
