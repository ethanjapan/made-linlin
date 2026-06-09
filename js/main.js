// =====================================================================
//  made_linlin Photography — 実写・深度パララックス × 3Dスクロール
//  実写画像 + 深度マップで「写真の中へ入っていく」没入。朝/夜トグル付き。
//  ライブラリ: three (ESM) / GSAP + ScrollTrigger / Lenis (UMD global)
// =====================================================================
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const Lenis = window.Lenis;
gsap.registerPlugin(ScrollTrigger);

// 安定した視口サイズ。iOSの動的ツールバーで揺れる VH() ではなく
// documentElement.clientHeight(=レイアウト視口・ツールバー開閉で不変)を使う＝カクつき防止。
let _vw = document.documentElement.clientWidth;
let _vh = document.documentElement.clientHeight;
const VW = () => _vw;
const VH = () => _vh;
function refreshViewport() {        // 実サイズが変わった時だけ true（回転など）。ツールバー開閉は false
  const w = document.documentElement.clientWidth, h = document.documentElement.clientHeight;
  if (w === _vw && h === _vh) return false;
  _vw = w; _vh = h; return true;
}

// ---- 進行レンジ ------------------------------------------------------
const APPROACH_END = 0.58;   // ここまでで写真の奥へ入る
const ASSEMBLE_START = 0.48; // 作品が飛び始める
const ASSEMBLE_END   = 0.92; // 整列完了
const DEPTH_SCALE = 5.5;     // 深度の押し出し量（大きいほど立体）

// シーン素材（実写画像＋深度マップ）。本番はあなたの教会の朝/夜レンダに差し替え。
// depth に Depth Anything V2 で作った深度PNGを置くと「実深度」で自動的に立体化。
// 無ければ画像から擬似深度を自動生成（フォールバック）。
const SCENES = {
  day:   { url: "public/img/scene/morning.jpg", depth: "public/img/scene/morning_depth.png", bg: "#aeb6bf", fog: "#c3c7cc" },
  night: { url: "public/img/scene/night.jpg",   depth: "public/img/scene/night_depth.png",   bg: "#070b16", fog: "#0b1020" },
};

const state = {
  progress: 0, manifest: null, panels: [], hovered: null, ready: false,
  mix: 0, night: false, layers: null, backdrops: {}, inCTA: false,
};

// Instagram 誘導（締めCTA）。manifest.site.instagram があれば優先。無ければ下を自分のアカウントに。
const INSTAGRAM = { url: "https://www.instagram.com/made_linlin/", handle: "@made_linlin" };

// 3D演出の「完了スクロール位置」。ギャラリー(作品整列)で進行=1にし、その先のCTAは普通に流す。
let zoneEnd = 0;
function measureZone() {
  const g = document.querySelector(".panel--gallery");
  zoneEnd = g ? Math.max(1, g.offsetTop + g.offsetHeight - VH()) : 0;
}

const canvas    = document.getElementById("scene");
const captionEl  = document.getElementById("caption");
const pointer   = new THREE.Vector2(-2, -2);
const raycaster = new THREE.Raycaster();
const _v        = new THREE.Vector3();   // ラベルの3D→2D投影用

// ---- 端末判定（モバイル / タッチ / 縦持ち）----
const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
let isMobile = isTouch && Math.min(VW(), VH()) < 820;
let isPortrait = VH() >= VW();
function measureDevice() {
  isMobile = isTouch && Math.min(VW(), VH()) < 820;
  isPortrait = VH() >= VW();
}
// 視点パララックス：PC=マウス / スマホ=ジャイロ を pTarget に集約 → parallax で平滑化
const pTarget  = new THREE.Vector2(0, 0);
const parallax = new THREE.Vector2(0, 0);

// ---------------------------------------------------------------------
//  Renderer / Scene / Camera
// ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));   // スマホもPCと同品質
renderer.setSize(VW(), VH());
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SCENES.day.bg);
scene.fog = new THREE.FogExp2(new THREE.Color(SCENES.day.fog), 0.012);

const camera = new THREE.PerspectiveCamera(isPortrait ? 64 : 50, VW() / VH(), 0.1, 400);
const lookTarget = new THREE.Vector3(0, 1.9, -40);

// ポストプロセス：ブルーム（光をにじませて映画的に）。光芒・窓明かり・キャンドルが柔らかく発光。
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(VW(), VH()), 0.45, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------
//  深度パララックス背景（実写 + 深度マップで奥行きをつけた板）
// ---------------------------------------------------------------------
// 縦持ち(スマホ)は広角ぶん視野が縦に広いので、背景板を大きめ＋中心を下げて下端の余白を防ぐ
const _portraitBG = VH() >= VW();
const BG_W = _portraitBG ? 104 : 96;
const BG_H = _portraitBG ? 60 : 54;
const BG_Z = -32;
const BG_Y = _portraitBG ? 2.5 : 5;

function loadTexture(url, isDepth = false) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (t) => {
      if (isDepth) { t.colorSpace = THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; }
      else { t.colorSpace = THREE.SRGBColorSpace; }
      resolve(t);
    }, undefined, reject);
  });
}

async function fileExists(url) {
  try { const r = await fetch(url, { method: "HEAD" }); return r.ok; } catch { return false; }
}

// 表紙テクスチャ：EXIF回転を尊重して読み込む（<img>と同じ向き）。
// WebGLのtexImage2DはEXIFを無視して反転することがあるため、createImageBitmap(from-image)で正立化。
async function loadCoverTexture(url) {
  try {
    const blob = await (await fetch(url, { mode: "cors" })).blob();
    const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const tex = new THREE.Texture(bmp);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  } catch (e) {
    return await loadTexture(url);   // 古いブラウザ等は通常読み込みにフォールバック（画像は出る）
  }
}

// 実深度PNGがあればそれを、無ければ画像から擬似深度を返す
async function resolveDepth(sceneDef, colorTex) {
  if (sceneDef.depth && await fileExists(sceneDef.depth)) {
    try { return { tex: await loadTexture(sceneDef.depth, true), real: true }; } catch { /* フォールバックへ */ }
  }
  return { tex: depthTextureFromImage(colorTex.image), real: false };
}

// 画像から簡易深度マップを作る（下＝手前 / 上(空)＝奥、暗部をやや手前に）。
// ※本番は Depth Anything V2 等の実深度マップに差し替えると更にリアル。
function depthTextureFromImage(img) {
  const w = 320, h = 180;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const src = ctx.getImageData(0, 0, w, h).data;
  const depth = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const yn = 1 - y / (h - 1);                 // 下=1, 上=0
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) / 255;
      depth[y * w + x] = Math.min(1, Math.max(0, 0.62 * yn + 0.22 * (1 - lum) + 0.16));
    }
  }
  // 数回ぼかして滑らかな変位に
  const blurred = boxBlur(boxBlur(boxBlur(depth, w, h), w, h), w, h);
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = blurred[i] * 255; out.data[i*4]=out.data[i*4+1]=out.data[i*4+2]=v; out.data[i*4+3]=255; }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  return tex;
}
function boxBlur(a, w, h) {
  const o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < w && yy >= 0 && yy < h) { s += a[yy * w + xx]; n++; }
    }
    o[y * w + x] = s / n;
  }
  return o;
}

function makeBackdrop(colorTex, depthTex, scale = DEPTH_SCALE) {
  const geo = new THREE.PlaneGeometry(BG_W, BG_H, 256, 160);   // スマホもPCと同じ高分割
  const mat = new THREE.MeshBasicMaterial({ map: colorTex, transparent: true, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDepth = { value: depthTex };
    shader.uniforms.uDepthScale = { value: scale };
    shader.vertexShader = "uniform sampler2D uDepth;\nuniform float uDepthScale;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n  transformed.z += (texture2D(uDepth, uv).r - 0.45) * uDepthScale;"
    );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, BG_Y, BG_Z);
  return mesh;
}

async function buildBackdrop() {
  const [dayTex, nightTex] = await Promise.all([loadTexture(SCENES.day.url), loadTexture(SCENES.night.url)]);
  const [dayD, nightD] = await Promise.all([resolveDepth(SCENES.day, dayTex), resolveDepth(SCENES.night, nightTex)]);
  // 実深度なら押し出しを控えめ(3.6)に、擬似深度なら強め(5.5)に
  const dayMesh = makeBackdrop(dayTex, dayD.tex, dayD.real ? 3.6 : DEPTH_SCALE);
  const nightMesh = makeBackdrop(nightTex, nightD.tex, nightD.real ? 3.6 : DEPTH_SCALE);
  nightMesh.position.z = BG_Z - 0.06;
  dayMesh.renderOrder = 0; nightMesh.renderOrder = 1;
  scene.add(dayMesh, nightMesh);
  state.backdrops = { day: dayMesh, night: nightMesh };

  // 夜だけの動的レイヤ（星・キャンドル・蛍）
  state.layers = buildNightLayers();
  scene.add(state.layers.group);

  setMix(0);
}

function buildNightLayers() {
  const group = new THREE.Group();
  const rnd = mulberry32(99);
  const mk = (n, spec, mat) => {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const [x, y, z] = spec(rnd, i); pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, mat); group.add(p); return p;
  };
  const baseMat = (color, size) => new THREE.PointsMaterial({
    color, size, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const k = 1;   // スマホもPCと同じ粒数（軽量化しない）
  // 星（上空・広く）
  const stars = mk(Math.round(520 * k), (r) => [(r()-0.5)*70, 8 + r()*22, BG_Z - 2 - r()*6], baseMat(0xdfe8ff, 0.12));
  // キャンドル（足元〜中景・暖色）
  const candles = mk(Math.round(140 * k), (r) => [(r()-0.5)*46, -3 + r()*5, -20 - r()*14], baseMat(0xffb060, 0.22));
  // 蛍（中景をふわふわ）
  const fireflies = mk(Math.round(36 * k), (r) => [(r()-0.5)*30, r()*7, -16 - r()*12], baseMat(0xffe08a, 0.16));
  // 朝の浮遊する光の粒（木漏れ日に舞う埃・花粉）
  const motes = mk(Math.round(80 * k), (r) => [(r()-0.5)*40, r()*11, -8 - r()*24], baseMat(0xfff0d8, 0.07));
  return { group, stars, candles, fireflies, motes };
}

// 朝↔夜のクロスフェード（mix: 0=朝, 1=夜）
function setMix(m) {
  state.mix = m;
  if (state.backdrops.day) state.backdrops.day.material.opacity = 1 - m;
  if (state.backdrops.night) state.backdrops.night.material.opacity = m;
  scene.background.copy(new THREE.Color(SCENES.day.bg)).lerp(new THREE.Color(SCENES.night.bg), m);
  scene.fog.color.copy(new THREE.Color(SCENES.day.fog)).lerp(new THREE.Color(SCENES.night.fog), m);
  renderer.toneMappingExposure = 1.0 - 0.12 * m;
}

// ---------------------------------------------------------------------
//  写真パネル（manifest を読み、アルバム表紙ごとに1枚を飛ばす）
// ---------------------------------------------------------------------
async function loadManifest() {
  const res = await fetch("data/manifest.json", { cache: "no-store" });
  state.manifest = await res.json();
  const all = state.manifest.albums || [];
  const featured = all.filter((a) => a.featured);
  // 入り口(3D)には featured:true のアルバムだけを飛ばす。1つも無ければ全アルバム。
  buildPanels(featured.length ? featured : all);
}

function buildPanels(albums) {
  const n = albums.length;
  const portrait = VH() >= VW();
  const cols = Math.min(n, portrait ? 2 : 3);
  const rows = Math.ceil(n / cols);
  const CZ = -25, CY = 2.0;

  // 動的サイズ：ギャラリー視点(カメラz=-15)から見て、グリッド全体が画面の一定割合に収まるよう自動縮小。
  // 枚数が増えるほど自動で小さくなり、画面いっぱいの圧迫感を防いで周囲に余白を残す。
  const dist = CZ - (-15);                                   // = 10（updateScene のドリー終点と一致）
  const fov = portrait ? 64 : 50;
  const visH = 2 * dist * Math.tan(fov * Math.PI / 360);
  const visW = visH * (VW() / VH());
  const gap = 0.30;                                          // パネルに対する隙間の割合
  const fillW = portrait ? 0.84 : 0.66, fillH = portrait ? 0.68 : 0.72;   // 画面に対する占有率（残りが余白）
  const cardAR = 0.8;                                        // カードの w/h（縦長）
  let PW = (visW * fillW) / (cols + (cols - 1) * gap);
  let PH = PW / cardAR;
  const maxPH = (visH * fillH) / (rows + (rows - 1) * gap);
  if (PH > maxPH) { PH = maxPH; PW = PH * cardAR; }          // 縦が溢れるなら縦基準で縮小
  const GX = PW * (1 + gap), GY = PH * (1 + gap);

  // スマホ用ラベル（PCのホバー吹き出しの代替＝各アルバムの下にタイトルを常時表示）
  let labelHost = document.getElementById("panel-labels");
  if (!labelHost) { labelHost = document.createElement("div"); labelHost.id = "panel-labels"; labelHost.setAttribute("aria-hidden", "true"); document.body.appendChild(labelHost); }
  labelHost.innerHTML = "";

  const rnd = mulberry32(7);

  albums.forEach((album, idx) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x111418, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);

    loadCoverTexture(album.cover)
      .then((tex) => { mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true; })
      .catch(() => { mat.map = makeFallbackTexture(album.title); mat.color.set(0xffffff); mat.needsUpdate = true; });

    const row = Math.floor(idx / cols);
    const colInRow = idx - row * cols;
    const colsInRow = Math.min(cols, n - row * cols);
    const target = new THREE.Vector3(
      (colInRow - (colsInRow - 1) / 2) * GX,
      CY + ((rows - 1) / 2 - row) * GY,
      CZ
    );
    const start = new THREE.Vector3((rnd()-0.5)*46, rnd()*12, -46 - rnd()*26);
    mesh.position.copy(start);
    mesh.rotation.set((rnd()-0.5)*1.4, (rnd()-0.5)*2.2, (rnd()-0.5)*1.2);
    mesh.scale.setScalar(0.2);
    mesh.userData = { album, idx };
    scene.add(mesh);

    const labelEl = document.createElement("div");
    labelEl.className = "panel-label";
    labelEl.innerHTML = `<span class="panel-label__t"></span><span class="panel-label__m"></span>`;
    labelEl.querySelector(".panel-label__t").textContent = album.title;
    labelEl.querySelector(".panel-label__m").textContent = `${album.count}点`;
    labelHost.appendChild(labelEl);

    state.panels.push({ mesh, album, start, target, baseY: target.y, startRot: mesh.rotation.clone(), labelEl, halfH: PH / 2 });
  });
}

// ---------------------------------------------------------------------
//  毎フレーム更新
// ---------------------------------------------------------------------
function updateScene(time) {
  const p = state.progress;

  // カメラ：写真の奥へドリー（+ マウス視差）
  const camT = THREE.MathUtils.clamp(p / APPROACH_END, 0, 1);
  const eased = camT * camT * (3 - 2 * camT);
  // 視点パララックス（PC=マウス / スマホ=ジャイロ）を平滑化して反映
  parallax.lerp(pTarget, 0.12);
  const px = THREE.MathUtils.clamp(parallax.x, -1, 1);
  const py = THREE.MathUtils.clamp(parallax.y, -1, 1);
  camera.position.x = px * 1.1;
  camera.position.y = THREE.MathUtils.lerp(2.6, 1.95, eased) + py * 0.5;
  camera.position.z = THREE.MathUtils.lerp(12, -15, eased);
  lookTarget.set(px * 1.4, 1.9 + py * 0.5, -40);
  camera.lookAt(lookTarget);

  // パネル：飛んできて整列
  const interactive = p > ASSEMBLE_START + 0.08 && !state.inCTA;
  state.panels.forEach((pn, i) => {
    const span = (ASSEMBLE_END - ASSEMBLE_START);
    const stagger = i * 0.06;
    let a = (p - (ASSEMBLE_START + stagger)) / (span - stagger);
    a = THREE.MathUtils.clamp(a, 0, 1);
    const e = 1 - Math.pow(1 - a, 3);
    pn.mesh.position.lerpVectors(pn.start, pn.target, e);
    if (a >= 1) pn.mesh.position.y = pn.baseY + Math.sin(time * 0.6 + i) * 0.05;
    pn.mesh.rotation.x = pn.startRot.x * (1 - e);
    pn.mesh.rotation.y = pn.startRot.y * (1 - e);
    pn.mesh.rotation.z = pn.startRot.z * (1 - e);
    const tScale = (state.hovered === pn) ? 1.09 : 1.0;
    const sc = THREE.MathUtils.lerp(0.2, tScale, e);
    pn.mesh.scale.x += (sc - pn.mesh.scale.x) * 0.2;
    pn.mesh.scale.y += (sc - pn.mesh.scale.y) * 0.2;
  });

  // ギャラリー進入で背景を少し沈め、作品を引き立てる
  if (state.backdrops.day) {
    const enter = THREE.MathUtils.clamp((p - APPROACH_END) / (1 - APPROACH_END), 0, 1);
    const dim = 1 - 0.5 * enter;
    state.backdrops.day.material.color.setScalar(dim);
    state.backdrops.night.material.color.setScalar(dim);
  }

  // 夜レイヤのきらめき
  if (state.layers && state.mix > 0.001) {
    const m = state.mix;
    state.layers.stars.material.opacity = m * (0.65 + 0.35 * Math.sin(time * 1.5));
    state.layers.candles.material.opacity = m * (0.6 + 0.4 * Math.abs(Math.sin(time * 3.1 + 1)));
    state.layers.fireflies.material.opacity = m * (0.5 + 0.5 * Math.sin(time * 0.8));
    state.layers.fireflies.rotation.y = time * 0.04;
    state.layers.candles.material.size = 0.2 + 0.05 * Math.sin(time * 5.0);
  } else if (state.layers) {
    state.layers.stars.material.opacity = 0;
    state.layers.candles.material.opacity = 0;
    state.layers.fireflies.material.opacity = 0;
  }
  // 朝の光の粒（昼に見える・ふわふわ漂う）
  if (state.layers) {
    state.layers.motes.material.opacity = (1 - state.mix) * (0.30 + 0.14 * Math.sin(time * 0.6));
    state.layers.motes.rotation.y = time * 0.016;
  }

  // スマホ：各アルバムの下にタイトルを常時表示（PCのホバー吹き出しの代替）。整列後に出す。
  const showLabels = isTouch && state.ready && p > ASSEMBLE_END - 0.06 && !state.inCTA;
  state.panels.forEach((pn) => {
    if (!pn.labelEl) return;
    if (!showLabels) { if (pn.labelEl.style.opacity !== "0") pn.labelEl.style.opacity = "0"; return; }
    _v.set(pn.mesh.position.x, pn.mesh.position.y - pn.halfH, pn.mesh.position.z).project(camera);
    if (_v.z > 1) { pn.labelEl.style.opacity = "0"; return; }   // 背後なら隠す
    pn.labelEl.style.transform =
      `translate(${(_v.x * 0.5 + 0.5) * VW()}px, ${(-_v.y * 0.5 + 0.5) * VH()}px) translate(-50%, 8px)`;
    pn.labelEl.style.opacity = "1";
  });

  if (interactive && state.ready && !isTouch) handleHover();   // ホバーはPCのみ
  else if (state.hovered) clearHover();
}

// ---------------------------------------------------------------------
//  ホバー / クリック
// ---------------------------------------------------------------------
function handleHover() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(state.panels.map((p) => p.mesh), false);
  const hit = hits.length ? state.panels.find((p) => p.mesh === hits[0].object) : null;
  if (hit !== state.hovered) {
    state.hovered = hit;
    document.body.style.cursor = hit ? "pointer" : "";
    if (hit) showCaption(hit.album); else hideCaption();
  }
}
function clearHover() { state.hovered = null; document.body.style.cursor = ""; hideCaption(); }
function showCaption(album) {
  captionEl.querySelector(".caption__title").textContent = album.title;
  captionEl.querySelector(".caption__meta").textContent = `${album.count}点 ・ ${album.subtitle || ""}`;
  captionEl.classList.add("is-on");
}
function hideCaption() { captionEl.classList.remove("is-on"); }

window.addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / VW()) * 2 - 1;
  pointer.y = -(e.clientY / VH()) * 2 + 1;
  if (!isTouch) pTarget.set(pointer.x, pointer.y);   // PCはマウスでパララックス
  captionEl.style.left = `${e.clientX + 18}px`;
  captionEl.style.top  = `${e.clientY + 18}px`;
});
// クリック/タップ：その地点でレイキャスト（タッチはホバー無しなので都度判定）
window.addEventListener("click", (e) => {
  if (!state.ready || state.inCTA || state.progress <= ASSEMBLE_START + 0.05) return;
  if (e.target.closest && e.target.closest("a, button")) return;   // UI要素のクリックは無視
  raycaster.setFromCamera({ x: (e.clientX / VW()) * 2 - 1, y: -(e.clientY / VH()) * 2 + 1 }, camera);
  const hits = raycaster.intersectObjects(state.panels.map((p) => p.mesh), false);
  if (!hits.length) return;
  const pn = state.panels.find((p) => p.mesh === hits[0].object);
  if (!pn) return;
  const slug = pn.album.slug;
  gsap.to("body", { opacity: 0, duration: 0.5, onComplete: () => { location.href = `album.html?album=${encodeURIComponent(slug)}`; } });
});

// ---------------------------------------------------------------------
//  ジャイロ視点（スマホ）：傾けると PC のマウス追従と同じ視差になる
// ---------------------------------------------------------------------
let gyroOn = false;
function onOrient(e) {
  if (e.gamma == null || e.beta == null) return;
  // gamma=左右(-90..90) / beta=前後。縦持ちの自然角(約50°)を基準に控えめに振る
  const gx = THREE.MathUtils.clamp(e.gamma / 30, -1, 1);
  const gy = THREE.MathUtils.clamp((e.beta - 50) / 30, -1, 1);
  pTarget.set(gx, -gy);
}
function startGyro() {
  if (gyroOn) return;
  window.addEventListener("deviceorientation", onOrient, true);
  gyroOn = true;
}
async function enableMotion() {
  const D = window.DeviceOrientationEvent;
  try {
    if (D && typeof D.requestPermission === "function") { // iOS 13+：タップ操作の中から許可を要求
      if ((await D.requestPermission()) === "granted") startGyro();
    } else if (D) {                                       // Android 等：そのまま取得
      startGyro();
    }
  } catch { /* 取れなければ視点中央固定にフォールバック */ }
}
function setupMotionUI() {
  const btn = document.getElementById("motion-start");
  if (!btn) return;
  if (!isTouch || !window.DeviceOrientationEvent) { btn.remove(); return; }  // PC等は不要
  btn.hidden = false;
  btn.addEventListener("click", async () => {
    await enableMotion();
    btn.classList.add("is-done");
    setTimeout(() => btn.remove(), 800);
  });
  setTimeout(() => { if (btn.isConnected && !gyroOn) btn.classList.add("is-fade"); }, 9000);
}

// ---------------------------------------------------------------------
//  朝/夜トグル
// ---------------------------------------------------------------------
const modeProxy = { v: 0 };
function reflectToggle(on) {
  const btn = document.getElementById("mode-toggle");
  if (btn) { btn.classList.toggle("is-night", on); btn.setAttribute("aria-pressed", String(on)); }
}
function setNight(on, save = true) {
  state.night = on;
  gsap.to(modeProxy, { v: on ? 1 : 0, duration: 1.5, ease: "power2.inOut", onUpdate: () => setMix(modeProxy.v) });
  reflectToggle(on);
  if (save) { try { localStorage.setItem("ml-scene", on ? "night" : "day"); } catch {} }
}
document.getElementById("mode-toggle")?.addEventListener("click", () => setNight(!state.night));

// 初期状態: 看板は朝のチャペル。前回ユーザーが夜を選んでいればそれを尊重。
function initialNight() {
  try { return localStorage.getItem("ml-scene") === "night"; } catch { return false; }
}

// ---------------------------------------------------------------------
//  スクロール（Lenis）＋ テキスト演出
// ---------------------------------------------------------------------
const lenis = new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.9 });
lenis.on("scroll", (e) => {
  const sc = e.scroll ?? lenis.scroll ?? 0;
  // 進行は「ギャラリーまで」で1。CTA区間はクランプ＝3Dは整列状態で固定される。
  state.progress = zoneEnd > 0 ? Math.min(sc / zoneEnd, 1) : (e.progress ?? 0);
  // CTAに入ったら3Dのホバー/クリックを止める（キャプションがCTAに被る・誤遷移を防ぐ）
  state.inCTA = zoneEnd > 0 && sc > zoneEnd + VH() * 0.45;
  ScrollTrigger.update();
});
gsap.ticker.add((time) => { lenis.raf(time * 1000); updateScene(time); composer.render(); });
gsap.ticker.lagSmoothing(0);

gsap.to(".approach__line", { opacity: 1, ease: "none",
  scrollTrigger: { trigger: ".panel--approach", start: "top 70%", end: "center 40%", scrub: true } });
gsap.fromTo(".gallery__head", { opacity: 0, y: 24 }, { opacity: 1, y: 0,
  scrollTrigger: { trigger: ".panel--gallery", start: "top 75%", end: "top 35%", scrub: true } });
gsap.fromTo(".cta__inner", { opacity: 0, y: 30 }, { opacity: 1, y: 0,
  scrollTrigger: { trigger: ".cta", start: "top 80%", end: "top 45%", scrub: true } });
ScrollTrigger.create({ trigger: ".panel--hero", start: "top top", end: "bottom top",
  onUpdate: (self) => { document.querySelector(".scroll-hint")?.classList.toggle("is-faded", self.progress > 0.1); } });

// ---------------------------------------------------------------------
//  リサイズ / 起動
// ---------------------------------------------------------------------
window.addEventListener("resize", () => {
  if (!refreshViewport()) return;   // iOSツールバー開閉(clientHeight不変)は無視＝リサイズしない
  measureDevice();
  camera.aspect = VW() / VH();
  camera.fov = isPortrait ? 64 : 50;
  camera.updateProjectionMatrix();
  renderer.setSize(VW(), VH());
  composer.setSize(VW(), VH());
  bloom.setSize(VW(), VH());
  measureZone();
});

(async function boot() {
  document.getElementById("year").textContent = "2026";
  try { await Promise.all([buildBackdrop(), loadManifest()]); }
  catch (err) { console.error("初期化エラー", err); }
  // 初期シーン（夜起動なら即・夜に。ちらつき防止でアニメ無し）
  if (initialNight()) { state.night = true; modeProxy.v = 1; setMix(1); reflectToggle(true); }

  // Instagram 誘導リンクを配線（manifest.site.instagram 優先）
  const ig = state.manifest && state.manifest.site && state.manifest.site.instagram;
  const igUrl = (ig && ig.url) || INSTAGRAM.url;
  document.querySelectorAll(".js-ig-link").forEach((a) => { a.href = igUrl; });
  const handleEl = document.getElementById("ig-handle");
  if (handleEl) handleEl.textContent = (ig && ig.handle) || INSTAGRAM.handle;

  ScrollTrigger.refresh();
  measureZone();
  state.ready = true;

  // アルバムから戻ってきた時は、イントロを飛ばして「作品が整列したギャラリー」へ直接着地
  const returnToGallery = location.hash === "#gallery";
  if (returnToGallery) {
    state.progress = 1;
    lenis.scrollTo(zoneEnd, { immediate: true });
    ScrollTrigger.update();
    history.replaceState(null, "", location.pathname);  // ハッシュは消す（次回リロードは通常通り）
  }

  // 戻り時はキャッシュ済みなので素早く、初回はいつも通り
  setupMotionUI();   // スマホ：傾き操作（ジャイロ）を有効化するバナー
  gsap.delayedCall(returnToGallery ? 0.05 : 0.4, () => document.getElementById("loader").classList.add("is-hidden"));
})();

// ---------------------------------------------------------------------
//  ヘルパー
// ---------------------------------------------------------------------
function makeFallbackTexture(label = "") {
  const c = document.createElement("canvas"); c.width = 600; c.height = 750;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 600, 750);
  g.addColorStop(0, "#2a2f3a"); g.addColorStop(1, "#11141a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 600, 750);
  ctx.fillStyle = "rgba(233,201,160,.85)"; ctx.font = "300 40px 'Cormorant Garamond', serif"; ctx.textAlign = "center";
  ctx.fillText(label, 300, 390);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
