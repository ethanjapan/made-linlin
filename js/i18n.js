// =====================================================================
//  多言語（日本語 / 繁體中文・台灣 / English）
//  - HTML側: data-i18n="key"（textContent）/ data-i18n-html="key"（innerHTML, <br>可）
//            data-i18n-attr="placeholder:key;aria-label:key2"（属性）
//  - JS側  : window.I18N.t("key", { n: 5 })  ※{n}を置換
//  - 言語切替: 右上のスイッチャー。localStorageに保存し、確実性のためリロードして適用。
// =====================================================================
(function () {
  const LANGS = ["ja", "zh-TW", "en"];
  const LABEL = { ja: "日本語", "zh-TW": "繁中", en: "EN" };

  const DICT = {
    ja: {
      "meta.desc": "風景・光・静けさ。made_linlin の写真作品集。",
      "nav.works": "作品一覧",
      "toggle.mode": "朝 / 夜",
      "hero.title": "静けさを、<br>光のままに。",
      "hero.lead": "スクロールして、森のなかへ。",
      "approach": "— その扉の向こうに、いくつもの瞬間がある —",
      "gallery.sub": "選ぶと、その一枚が連れていく場所へ。",
      "motion": "傾けて、視点を動かす",
      "cta.lead": "— その先は、Instagram で。",
      "cta.btn": "Instagram でフォロー",
      "cta.note": "新作と、日々の光を。",
      "cta.foot": "Made with light.",
      "works.back": "← 入口の体験へ",
      "works.search": "検索（作品名・タグ・コレクション…）",
      "works.tags": "タグ",
      "works.years": "年",
      "works.clear": "クリア",
      "works.loading": "作品を読み込み中…",
      "works.loaderr": "作品の読み込みに失敗しました。",
      "works.empty": "該当する作品がありません。",
      "works.count.all": "全{n}作品",
      "works.count.some": "{n}作品",
      "album.count": "{n}点",
      "album.back.home": "← 入口へもどる",
      "album.back.works": "← 作品一覧へもどる",
    },
    "zh-TW": {
      "meta.desc": "風景・光・靜謐。made_linlin 的攝影作品集。",
      "nav.works": "作品一覽",
      "toggle.mode": "日 / 夜",
      "hero.title": "將靜謐，<br>留如光。",
      "hero.lead": "向下滑動，走進森林。",
      "approach": "— 那扇門的彼端，有無數的瞬間 —",
      "gallery.sub": "選一張，讓它帶你前往某處。",
      "motion": "傾斜手機，移動視角",
      "cta.lead": "— 更多，在 Instagram。",
      "cta.btn": "在 Instagram 追蹤",
      "cta.note": "新作，與日常的光。",
      "cta.foot": "Made with light.",
      "works.back": "← 回到入口體驗",
      "works.search": "搜尋（作品名・標籤・系列…）",
      "works.tags": "標籤",
      "works.years": "年份",
      "works.clear": "清除",
      "works.loading": "作品載入中…",
      "works.loaderr": "作品載入失敗。",
      "works.empty": "沒有符合的作品。",
      "works.count.all": "共 {n} 件作品",
      "works.count.some": "{n} 件作品",
      "album.count": "{n} 張",
      "album.back.home": "← 回到入口",
      "album.back.works": "← 回到作品一覽",
    },
    en: {
      "meta.desc": "Landscapes, light, and stillness. Photography by made_linlin.",
      "nav.works": "Works",
      "toggle.mode": "Day / Night",
      "hero.title": "Stillness,<br>left as light.",
      "hero.lead": "Scroll, into the forest.",
      "approach": "— Beyond that door, countless moments —",
      "gallery.sub": "Choose one — it carries you somewhere.",
      "motion": "Tilt to move the view",
      "cta.lead": "— And beyond, on Instagram.",
      "cta.btn": "Follow on Instagram",
      "cta.note": "New work, and everyday light.",
      "cta.foot": "Made with light.",
      "works.back": "← Back to the entrance",
      "works.search": "Search (title, tag, collection…)",
      "works.tags": "Tags",
      "works.years": "Year",
      "works.clear": "Clear",
      "works.loading": "Loading works…",
      "works.loaderr": "Failed to load works.",
      "works.empty": "No matching works.",
      "works.count.all": "{n} works",
      "works.count.some": "{n} works",
      "album.count": "{n} photos",
      "album.back.home": "← Back to the entrance",
      "album.back.works": "← Back to Works",
    },
  };

  function detect() {
    try { const s = localStorage.getItem("ml-lang"); if (LANGS.includes(s)) return s; } catch (e) {}
    const n = (navigator.language || "ja").toLowerCase();
    if (n.indexOf("zh") === 0) return "zh-TW";
    if (n.indexOf("en") === 0) return "en";
    return "ja";
  }
  let lang = detect();

  function t(key, vars) {
    let s = (DICT[lang] && DICT[lang][key]);
    if (s == null) s = (DICT.ja && DICT.ja[key]);
    if (s == null) return key;
    if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }

  function apply() {
    document.documentElement.lang = (lang === "zh-TW" ? "zh-Hant" : lang);
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (DICT[lang] && DICT[lang][k] != null) el.textContent = t(k);
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const k = el.getAttribute("data-i18n-html");
      if (DICT[lang] && DICT[lang][k] != null) el.innerHTML = t(k);
    });
    document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.getAttribute("data-i18n-attr").split(";").forEach((pair) => {
        const idx = pair.indexOf(":"); if (idx < 0) return;
        const attr = pair.slice(0, idx).trim(), k = pair.slice(idx + 1).trim();
        if (attr && k && DICT[lang] && DICT[lang][k] != null) el.setAttribute(attr, t(k));
      });
    });
    document.querySelectorAll(".lang-switch__btn").forEach((b) => b.classList.toggle("is-on", b.dataset.lang === lang));
    const md = document.querySelector('meta[name="description"]');
    if (md && DICT[lang] && DICT[lang]["meta.desc"]) md.setAttribute("content", t("meta.desc"));
  }

  function setLang(l) {
    if (!LANGS.includes(l) || l === lang) return;
    try { localStorage.setItem("ml-lang", l); } catch (e) {}
    lang = l;
    location.reload();   // 確実に全要素(JS生成含む)へ反映
  }

  function buildSwitcher() {
    if (document.querySelector(".lang-switch")) return;
    const host = document.createElement("div");
    host.className = "lang-switch";
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", "Language");
    LANGS.forEach((l) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lang-switch__btn";
      b.dataset.lang = l;
      b.textContent = LABEL[l];
      b.addEventListener("click", () => setLang(l));
      host.appendChild(b);
    });
    document.body.appendChild(host);
  }

  function injectStyles() {
    if (document.getElementById("lang-switch-style")) return;
    const css =
      ".lang-switch{position:fixed;bottom:1.4rem;left:1.4rem;z-index:11;display:flex;gap:.1rem;padding:.25rem;border-radius:99px;" +
      "background:rgba(18,16,14,.5);border:1px solid rgba(244,239,231,.28);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}" +
      ".lang-switch__btn{-webkit-appearance:none;appearance:none;background:none;border:none;cursor:pointer;color:rgba(244,239,231,.55);" +
      "font-family:'Zen Kaku Gothic New',system-ui,sans-serif;font-size:.72rem;letter-spacing:.06em;padding:.35rem .7rem;border-radius:99px;transition:color .3s,background .3s;}" +
      ".lang-switch__btn:hover{color:#f4efe7;}" +
      ".lang-switch__btn.is-on{color:#16130d;background:linear-gradient(120deg,#f3d8a8,#e9c9a0);}" +
      "@media (max-width:640px){.lang-switch{bottom:1rem;left:1rem;}.lang-switch__btn{font-size:.7rem;padding:.32rem .6rem;}}";
    const s = document.createElement("style");
    s.id = "lang-switch-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  window.I18N = { t: t, setLang: setLang, get lang() { return lang; } };

  function init() { injectStyles(); buildSwitcher(); apply(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
