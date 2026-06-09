// =====================================================================
//  画像ヘルパー: レスポンシブ＋AVIF の <picture> を組む。
//   obj = { avif:{full,mid,thumb}, jpg:{full,mid,thumb} }（写真 or coverSet）。
//   無い（picsum等の旧スキーマ）場合は fallbackSrc の単純 <img>。
// =====================================================================
window.IMG = (function () {
  function srcset(m) { return `${m.thumb} 700w, ${m.mid} 1280w, ${m.full} 2048w`; }
  function esc(s) { return (s || "").toString().replace(/"/g, "&quot;"); }

  // HTML文字列を返す（innerHTML 用）
  function picture(obj, fallbackSrc, opts) {
    opts = opts || {};
    const sizes = opts.sizes || "100vw";
    const alt = esc(opts.alt);
    const cls = opts.cls ? ` class="${opts.cls}"` : "";
    const loading = opts.loading || "lazy";
    if (!obj || !obj.jpg) {   // 旧スキーマ(picsum等): 単純img
      return `<img src="${esc(fallbackSrc)}"${cls} alt="${alt}" loading="${loading}" decoding="async" />`;
    }
    const avifSource = obj.avif ? `<source type="image/avif" srcset="${srcset(obj.avif)}" sizes="${sizes}">` : "";
    return `<picture>` + avifSource +
      `<img src="${esc(obj.jpg.full)}" srcset="${srcset(obj.jpg)}" sizes="${sizes}"${cls} alt="${alt}" loading="${loading}" decoding="async" />` +
      `</picture>`;
  }

  // 単一の最適URL（3D等）: avif→jpg→fallback の順
  function best(obj, fallbackSrc, size) {
    size = size || "mid";
    if (obj && obj.avif && obj.avif[size]) return obj.avif[size];
    if (obj && obj.jpg && obj.jpg[size]) return obj.jpg[size];
    return fallbackSrc;
  }

  return { picture: picture, best: best };
})();
