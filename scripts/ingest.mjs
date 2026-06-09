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
import readline from "node:readline";
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
  "この写真をカタログ化します。次のJSONだけを返してください（前置き・説明は一切なし）。\n" +
  '{"person": 人物が主要な被写体、または顔がはっきり識別できるなら true ／ 風景等で人がいない・小さく目立たないなら false,' +
  '"collection":"風景|夜景|ポートレート|街|花|静物|動物|その他 のどれか1つ",' +
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
      person: !!o.person,
      collection: COL_SLUG[o.collection] ? o.collection : "その他",
      time: o.time_of_day || null,
      tags: Array.isArray(o.tags) ? o.tags.slice(0, 5) : [],
      title: (o.title_hint || "").toString().slice(0, 24),
    };
  } catch (e) {
    return { person: false, collection: null, time: null, tags: [], title: null, err: e.message };
  }
}

// 対話確認（公開前に必ず）。非対話環境では false（＝公開しない・安全側）。
function confirm(q) {
  if (!process.stdin.isTTY) return Promise.resolve(false);
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(/^y(es)?$/i.test((a || "").trim())); });
  });
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

  // 1) EXIF ＋ AI（人物などを選別＋分類）を全件
  if (!vlmOk) console.log("  ⚠ AI(VLM)に接続できません＝人物の自動選別ができません。Ollama起動(127.0.0.1)を確認してください。\n");
  const all = [];
  let i = 0;
  for (const file of files) {
    const src = path.join(INBOX, file);
    const exif = await readExif(src);
    const vis = vlmOk ? await analyze(src) : { person: false, collection: null, tags: [], title: null };
    process.stdout.write(`\r  AI選別 ${++i}/${files.length}  ${file.slice(0, 18).padEnd(18)} ${vis.person ? "除外(人物)" : (vis.collection || "-")}        `);
    all.push({ file, src, exif, date: exif.date || "undated", vis });
  }
  console.log("\n");

  const kept = all.filter((x) => !x.vis.person);       // 採用
  const excluded = all.filter((x) => x.vis.person);    // AIが人物等として除外

  // 2) 採用分を撮影日でグループ化（各日 = 1アルバム）。コレクション/タイトル/タグは多数決
  const groups = {};
  kept.forEach((it) => { (groups[it.date] ||= []).push(it); });

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
  console.log("  === 振り分け案（採用） ===");
  plan.forEach((a) => {
    console.log(`  ▸ [${a.colJa}] ${a.title}  (${a.items.length}枚 / ${a.date}${a.year ? " / " + a.year : ""})`);
    console.log(`     tags: ${a.tags.join(" , ") || "—"}`);
    const cam = a.items[0].exif;
    console.log(`     EXIF例: ${[cam.date, cam.camera, cam.lens, cam.f, cam.iso].filter(Boolean).join(" · ") || "なし(リサイズで消えた可能性)"}`);
  });
  console.log(`\n  === AI除外（人物など） ${excluded.length}枚 ===`);
  if (excluded.length) excluded.forEach((e) => console.log(`    - ${e.file}`));
  else console.log("    （なし）");
  console.log("");

  if (DRY) { console.log("  --dry: ファイルは動かしていません（確認用）。\n"); return; }
  if (!plan.length) { console.log("  採用できる写真がありませんでした。\n"); return; }

  // 採用分を photos/ へ振り分け＋_album.json
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

  // 除外分は _inbox/_excluded/ へ、採用の元は _inbox/_done/ へ退避
  if (excluded.length) {
    const exDir = path.join(INBOX, "_excluded");
    await fs.mkdir(exDir, { recursive: true });
    for (const e of excluded) await fs.rename(e.src, path.join(exDir, e.file)).catch(() => {});
  }
  const doneDir = path.join(INBOX, "_done");
  await fs.mkdir(doneDir, { recursive: true });
  for (const it of kept) await fs.rename(it.src, path.join(doneDir, it.file)).catch(() => {});

  console.log(`  ✓ ${plan.length}アルバム / ${kept.length}枚を photos/ に振り分け（除外 ${excluded.length}枚は _inbox/_excluded/）。`);
  console.log("\n  ⚠ このコマンドは公開しません。必ず確認してから公開してください:");
  console.log("   1) Finder/プレビューで photos/ を確認（_album.json のタイトル/タグ/featured 調整可）");
  console.log("   2) 除外 _inbox/_excluded/ を確認（戻したい写真は _inbox/ に戻して再実行）");
  console.log("   3) 良ければ公開: git add -A && git commit -m \"写真を追加\" && git push\n");

  if (PUBLISH) {
    const ok = await confirm("  ▶ この内容で公開（build → commit → push）しますか？ [y/N]: ");
    if (!ok) { console.log("  → 公開を中止しました（photos/ には振り分け済み。後で手動pushで公開できます）。\n"); return; }
    console.log("  公開中…");
    execFileSync("node", ["build-gallery.mjs"], { cwd: path.join(ROOT, "scripts"), stdio: "inherit" });
    execFileSync("git", ["-C", ROOT, "add", "-A"], { stdio: "inherit" });
    execFileSync("git", ["-C", ROOT, "commit", "-m", `写真を追加（${plan.length}アルバム/${kept.length}枚）`], { stdio: "inherit" });
    execFileSync("git", ["-C", ROOT, "push"], { stdio: "inherit" });
    console.log("  ✓ 公開しました。\n");
  }
}

main().catch((e) => { console.error("\nエラー:", e.message); process.exit(1); });
