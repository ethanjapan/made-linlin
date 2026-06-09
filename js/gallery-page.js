// 作品一覧（コレクション別グリッド + タグ/年フィルタ + 検索 + 遅延読込）
const main = document.getElementById("works-main");
const loadingEl = document.getElementById("works-loading");
const emptyEl = document.getElementById("works-empty");
const filterEl = document.getElementById("works-filter");
const tagsEl = document.getElementById("filter-tags");
const yearsEl = document.getElementById("filter-years");
const yearsRow = document.getElementById("filter-years-row");
const countEl = document.getElementById("works-count");
const clearBtn = document.getElementById("works-clear");
const searchInput = document.getElementById("works-search");

const state = { q: "", tags: new Set(), years: new Set() };
const entries = [];   // { album, cardEl, searchText }
const sections = [];  // { sectionEl, cardEls: [] }

(async function init() {
  let m;
  try { m = await (await fetch("data/manifest.json", { cache: "no-store" })).json(); }
  catch { loadingEl.textContent = "作品の読み込みに失敗しました。"; return; }
  loadingEl.remove();

  const albumsBySlug = Object.fromEntries((m.albums || []).map((a) => [a.slug, a]));
  const collections = (m.collections && m.collections.length)
    ? m.collections
    : [{ slug: "all", title: "作品", description: "", albumSlugs: (m.albums || []).map((a) => a.slug) }];

  collections.forEach((col) => {
    const albums = (col.albumSlugs || []).map((s) => albumsBySlug[s]).filter(Boolean);
    if (!albums.length) return;

    const sec = document.createElement("section");
    sec.className = "works-collection";
    sec.id = `col-${col.slug}`;
    const sub = [col.description, `${albums.length}作品`].filter(Boolean).join("  ・  ");
    sec.innerHTML = `<header class="works-collection__head"><h2>${col.title}</h2><p>${sub}</p></header>`;
    const g = document.createElement("div");
    g.className = "works-grid";
    const cardEls = [];

    albums.forEach((a) => {
      const card = document.createElement("a");
      card.className = "work-card";
      card.href = `album.html?album=${encodeURIComponent(a.slug)}&from=collections`;
      const meta = [`${a.count}点`, a.year || null].filter(Boolean).join("  ・  ");
      const tags = (a.tags || []).slice(0, 3).map((t) => `<span>${t}</span>`).join("");
      const lqip = a.photos && a.photos[0] && a.photos[0].blur ? a.photos[0].blur : null;
      card.innerHTML = `
        <div class="work-card__img"${lqip ? ` style="background-image:url('${lqip}')"` : ""}>
          <img loading="lazy" decoding="async" src="${a.cover}" alt="${a.title}" />
        </div>
        <div class="work-card__overlay">
          <span class="work-card__title">${a.title}</span>
          <span class="work-card__sub">${meta}</span>
          ${tags ? `<span class="work-card__tags">${tags}</span>` : ""}
        </div>`;
      const img = card.querySelector("img");
      if (img.complete) img.classList.add("loaded");
      else img.addEventListener("load", () => img.classList.add("loaded"), { once: true });

      g.appendChild(card);
      cardEls.push(card);
      entries.push({
        album: a, cardEl: card,
        searchText: [a.title, a.subtitle, a.collectionTitle, a.collection, a.series, ...(a.tags || [])]
          .filter(Boolean).join(" ").toLowerCase(),
      });
    });

    sec.appendChild(g);
    main.appendChild(sec);
    sections.push({ sectionEl: sec, cardEls });
  });

  if (!entries.length) { emptyEl.hidden = false; return; }

  buildFilters(m.albums || []);
  wireEvents();
  observeFadeIn();
  applyFilter();

  // ヘッダー（戻る/検索/絞り込み）は「ページ最上部に戻った時だけ」表示。
  // 途中での上スクロールでは出さない（うるさくならないように）。
  const header = document.getElementById("works-header");
  let hidden = false;
  const setHidden = (h) => { if (h !== hidden) { hidden = h; header.classList.toggle("is-hidden", h); } };
  window.addEventListener("scroll", () => {
    setHidden(window.scrollY > 40);   // 最上部(40px以内)だけ表示、それ以外は隠す
  }, { passive: true });
})();

// ---- フィルタUIの構築（ユニークなタグ・年） ----
function buildFilters(albums) {
  const tagSet = new Set(), yearSet = new Set();
  albums.forEach((a) => { (a.tags || []).forEach((t) => tagSet.add(t)); if (a.year) yearSet.add(a.year); });
  const tags = [...tagSet].sort((a, b) => a.localeCompare(b, "ja"));
  const years = [...yearSet].sort((a, b) => b - a);

  if (!tags.length && !years.length) return;   // 絞るものが無ければバー非表示
  filterEl.hidden = false;

  if (tags.length) tags.forEach((t) => tagsEl.appendChild(makePill(t, "tag")));
  else tagsEl.closest(".works-filter__row").hidden = true;

  if (years.length) years.forEach((y) => yearsEl.appendChild(makePill(String(y), "year", y)));
  else yearsRow.hidden = true;
}
function makePill(label, kind, value) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "works-pill works-pill--filter";
  b.textContent = label;
  b.dataset.kind = kind;
  b.dataset.value = value ?? label;
  return b;
}

// ---- イベント ----
function wireEvents() {
  filterEl.addEventListener("click", (e) => {
    const pill = e.target.closest(".works-pill--filter");
    if (!pill) return;
    const set = pill.dataset.kind === "tag" ? state.tags : state.years;
    const val = pill.dataset.kind === "year" ? Number(pill.dataset.value) : pill.dataset.value;
    if (set.has(val)) set.delete(val); else set.add(val);
    pill.classList.toggle("is-active");
    applyFilter();
  });
  let t;
  searchInput.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = searchInput.value.trim().toLowerCase(); applyFilter(); }, 120);
  });
  clearBtn.addEventListener("click", () => {
    state.q = ""; state.tags.clear(); state.years.clear();
    searchInput.value = "";
    filterEl.querySelectorAll(".is-active").forEach((p) => p.classList.remove("is-active"));
    applyFilter();
  });
}

// ---- 絞り込み適用 ----
function matches(a) {
  if (state.q) {
    const e = entries.find((x) => x.album === a);
    if (!e || !e.searchText.includes(state.q)) return false;
  }
  if (state.tags.size && !(a.tags || []).some((t) => state.tags.has(t))) return false;
  if (state.years.size && !state.years.has(a.year)) return false;
  return true;
}
function applyFilter() {
  let visible = 0;
  entries.forEach((e) => {
    const ok = matches(e.album);
    e.cardEl.classList.toggle("filtered-out", !ok);
    if (ok) visible++;
  });
  sections.forEach((s) => {
    const any = s.cardEls.some((c) => !c.classList.contains("filtered-out"));
    s.sectionEl.hidden = !any;
  });
  const active = state.q || state.tags.size || state.years.size;
  countEl.textContent = active ? `${visible}作品` : `全${entries.length}作品`;
  clearBtn.hidden = !active;
  emptyEl.hidden = visible !== 0;
}

// ---- スクロールでフェードイン ----
function observeFadeIn() {
  const io = new IntersectionObserver((entries2) => {
    entries2.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.06 });
  document.querySelectorAll(".work-card").forEach((c) => io.observe(c));
}
