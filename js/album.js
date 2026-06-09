// アルバム詳細：?album=slug に対応する写真一覧 + ライトボックス
const params = new URLSearchParams(location.search);
const slug = params.get("album");
const t = (k, v) => (window.I18N ? window.I18N.t(k, v) : k);   // 多言語ヘルパー

// 戻り先：作品一覧から来たら一覧へ、3D体験から来たらギャラリー（作品整列）へ
// （テキストは data-i18n を切替え、i18n.js が言語に応じて適用）
const backEl = document.getElementById("back");
if (backEl && params.get("from") === "collections") {
  backEl.href = "gallery.html";
  backEl.setAttribute("data-i18n", "album.back.works");
}

const grid = document.getElementById("grid");
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lb-img");
const lbCap = document.getElementById("lb-cap");
let photos = [];
let current = 0;

(async function init() {
  const res = await fetch("data/manifest.json", { cache: "no-store" });
  const manifest = await res.json();
  const album = (manifest.albums || []).find((a) => a.slug === slug) || manifest.albums?.[0];
  if (!album) { document.getElementById("album-title").textContent = "アルバムが見つかりません"; return; }

  document.title = `${album.title} — made_linlin`;
  document.getElementById("album-title").textContent = album.title;
  document.getElementById("album-sub").textContent =
    `${album.subtitle ? album.subtitle + " ・ " : ""}${t("album.count", { n: album.count })}`;

  photos = album.photos || [];
  photos.forEach((ph, i) => {
    const fig = document.createElement("figure");
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = ph.thumb || ph.full;
    img.alt = `${album.title} ${i + 1}`;
    const cap = document.createElement("figcaption");
    cap.textContent = [ph.date, ph.lens].filter(Boolean).join("  ·  ");
    fig.append(img, cap);
    fig.addEventListener("click", () => openLightbox(i));
    grid.appendChild(fig);
  });

  // スクロールで順にフェードイン
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.08 });
  grid.querySelectorAll("figure").forEach((f) => io.observe(f));
})();

// ---- ライトボックス ----
function openLightbox(i) {
  current = i;
  renderLightbox();
  lb.classList.add("is-on");
  lb.setAttribute("aria-hidden", "false");
  lockScroll();   // 背景（一覧）のスクロールを固定
}
function renderLightbox() {
  const ph = photos[current];
  lbImg.src = ph.full;
  lbCap.textContent = [ph.date, ph.camera, ph.lens].filter(Boolean).join("   ·   ");
}
function close() { lb.classList.remove("is-on"); lb.setAttribute("aria-hidden", "true"); unlockScroll(); }
function step(d) { current = (current + d + photos.length) % photos.length; renderLightbox(); }

// 背景スクロール固定（iOS対応: position:fixed 方式 / 閉じたら元の位置へ戻す）
let _lbScrollY = 0;
function lockScroll() {
  _lbScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.position = "fixed";
  document.body.style.top = `-${_lbScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}
function unlockScroll() {
  if (document.body.style.position !== "fixed") return;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo(0, _lbScrollY);
}

document.getElementById("lb-close").addEventListener("click", close);
document.getElementById("lb-prev").addEventListener("click", () => step(-1));
document.getElementById("lb-next").addEventListener("click", () => step(1));
lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
window.addEventListener("keydown", (e) => {
  if (!lb.classList.contains("is-on")) return;
  if (e.key === "Escape") close();
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});
