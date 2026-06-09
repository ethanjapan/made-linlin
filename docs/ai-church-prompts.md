# 軽井沢高原教会 朝/夜ヒーロー画像 — 生成プロンプト & 手順

トップ3D背景の朝/夜プレートを **あなたのComfyUI(Flux/SDXL)** で生成するための実戦リファレンス。
（リサーチ: 公式 candle.karuizawachurch.org ほか／2026年のフォトリアル生成・深度マップ事情を統合）

被写体の要点（公式準拠・ここを外さない）：
- **地面まで降りる急勾配の三角A型フレーム木造礼拝堂**（A-frame）。
- **正面妻面の全面が木格子（ラティス）の大ガラス窓**。こけら葺き（木板）屋根、板張り＋丸太の壁、頂部に小さな十字架。
- カラマツの新緑の森、参道（木立のアーチ）、芝のアプローチ。
- ❌ 石造・モダン・白壁ゴシック・コンクリートにしない（必ずネガティブへ）。

---

## ① 朝（morning.jpg）— Flux/SDXL ポジティブ

```
photorealistic wide-angle architectural photograph, 16:9 cinematic hero shot, a small rustic Japanese mountain chapel in Karuizawa highlands, steep A-frame triangular gable timber roof descending all the way to the ground, large triangular gable window made of clear glass with a wooden lattice grid filling the entire front facade, weathered wood-shingle roof, board-clad timber walls with exposed rustic logs, small wooden cross atop the spire, viewed straight-on from a green lawn approach aisle lined with an arch of trees, surrounded and embraced by a lush fresh-green larch forest, soft morning natural light, gentle backlight with dappled komorebi sunlight filtering through the trees onto the front glass, clear blue sky and green treetops above, light morning mist for aerial depth, serene solemn peaceful atmosphere, layered depth from foreground path to chapel to sky, muted natural color grade, no oversaturation, no blown highlights, soft shadows, shot on full-frame camera 24mm lens, fine natural texture, high detail, professional landscape architecture photography
```

## ② 夜（night.jpg）— サマーキャンドルナイト

```
photorealistic wide-angle night photograph, 16:9 cinematic hero shot, the same small rustic Japanese A-frame timber mountain chapel in Karuizawa during a summer candle night festival, after sunset deep blue hour, the steep triangular wooden chapel sits on a low hill as a dark silhouette in a dense forest with warm cream-white light glowing softly from its large latticed gable window, thousands of real flickering candle lanterns scattered through the dark forest creating countless warm amber point lights at every distance, a cone-shaped lantern tree of stacked glowing lanterns as a focal point, a neat river of candles lined along a courtyard like a milky way, a dark gravel path in the foreground lit only by a handheld lantern, deep amber and honey color temperature around 2000K, no white or blue LED light, high contrast low-key lighting with the forest falling into near black, uneven flickering glow with each light slightly different, shallow depth of field with many warm bokeh orbs melting into the distance, faint stars above the high treetops, faint twilight blue lingering in the sky, thin drifting haze and subtle lens flare, high-iso film grain, dreamy intimate fairytale mood like a scene from a storybook, muted realistic night grade, professional low-light photography, shot on full-frame camera 24mm lens, high detail
```

## ③ ネガティブ（共通）

```
cartoon, illustration, painting, drawing, anime, 3d render, cgi, low poly, plastic, oversaturated, overexposed, blown highlights, HDR halo, oversharpened, ringing artifacts, fake bokeh, perfectly uniform bokeh balls, neon, white LED, cool blue artificial light (for night), text, watermark, signature, logo, people faces in focus, deformed architecture, warped lines, crooked roof, stone church, modern glass skyscraper, white plaster european cathedral, gothic church, concrete building, lens dirt, jpeg artifacts, blurry, out of focus subject, distorted perspective, duplicate building
```

---

## ④ 生成設定

**本命：Flux.1 Krea Dev**（無印devより「AIっぽさ」が少なく、過飽和/白飛びを抑えて実写感が高い）
- guidance(CFG) = **3.0〜3.5**（フォトリアルは低いほど自然）
- sampler = **euler** / scheduler = **beta** / steps = **28**前後
- 解像度 = **1344×768** or 1216×832（16:9ヒーロー）。VRAM節約は fp8_e4m3fn

**代替：Juggernaut XL v9（SDXL・建築/直線に強い）**
- sampler = DPM++ 2M Karras / steps = 30〜40 / CFG = **3〜5**（高CFGは輪郭リンギングで破綻）
- Refiner は最後の20〜40%区間を denoise 0.2〜0.4

**直線維持（A型屋根に有効・任意）**
- ControlNet: Flux=Shakker Labs Union Pro 2.0 / SDXL=xinsir Union。直線重視は **MLSD**（Cannyより建物向き）
- **朝→夜の構図を揃えるコツ**：先に朝を1枚確定 → その Depth/MLSD を hint に夜を生成。教会位置が揃い、深度マップを朝夜で共有できる。

**アップスケール（ヒーロー画質仕上げ）**
- Ultimate SD Upscale + **4x-UltraSharp**（タイルimg2img）。画像経由なら denoise 0.2〜0.35。最終は長辺 **2048px** で書き出し（sRGB埋め込み）。

---

## ⑤ 深度マップ（Depth Anything V2）

サイトの立体感は「実深度マップ」で激変します。各プレートから生成してください。

**方式①（推奨・簡単）kijai/ComfyUI-DepthAnythingV2**
1. ComfyUI Manager で導入（または `git clone https://github.com/kijai/ComfyUI-DepthAnythingV2`）
2. `DownloadAndLoadDepthAnythingV2Model`（variant=**vitl** 推奨）→ `DepthAnything_V2`
3. 生成・アップスケール済みプレートを入力 → 正規化深度（**近=明 / 遠=暗**）
4. `SaveImage` で保存：朝 → `morning_depth.png` / 夜 → `night_depth.png`

**方式②ControlNet Aux**：`DepthAnythingV2Preprocessor`（ckpt=depth_anything_v2_vitl.pth, resolution=**1024**推奨）

> 構図が朝夜で揃っていれば、深度は「朝の1枚を共有」でもOK。

---

## ⑥ サイトへの組み込み（これだけ）

`public/img/scene/` に4枚を置くだけで自動認識します：

```
public/img/scene/morning.jpg        ← 朝プレート（既存の仮を上書き）
public/img/scene/night.jpg          ← 夜プレート（既存の仮を上書き）
public/img/scene/morning_depth.png  ← 朝の深度（置くと「実深度」へ自動切替）
public/img/scene/night_depth.png    ← 夜の深度（無ければ擬似深度に自動フォールバック）
```

- `js/main.js` の `SCENES` は既に `depth:` パスを参照済み。**深度PNGがあれば実深度・押し出し3.6**、無ければ画像から擬似深度。コード変更不要。
- 右上「朝 / 夜」ボタンで2枚をクロスフェード（選択は次回も記憶）。夜は星・キャンドル・蛍が重なる。

## ⑦ つまずきポイント（リサーチ由来）

- **被写体不一致**：Flux/SDXLは固有名で正しく描けない。A型急勾配＋妻面ガラス格子＋こけら葺き＋丸太を明示し、石造/モダン/白壁ゴシックをネガティブへ。出力を公式写真と必ず照合。
- **夜のCG臭**：完全均一なボケ玉＝AIっぽさの元。生火は1800〜2200Kで点ごとに揺らぎ。白/青LEDを混ぜない。
- **縁裂け（ディスオクルージョン）**：深度押し出しが強すぎ/前進しすぎで背景が伸びる。`DEPTH_SCALE` 3.0〜4.0、前進控えめ、fog＋画面端を暗くで隠す。
- **深度の色空間**：深度テクスチャは sRGB変換しない（コード側で `NoColorSpace` 設定済み）。
- **色管理**：プレートは sRGB 埋め込み・落ち着いたグレードで。あなたの写真本体（DPP4の色）と画面上で喧嘩しないトーンに。
