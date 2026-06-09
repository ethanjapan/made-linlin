# made_linlin — Photography（3Dスクロール写真集）

大自然のなかの教会 → 接近 → 入場 → 作品が飛んできて整列、という1本のカメラテイクで
アルバムへ誘導する写真ポートフォリオ。GitHub Pages で公開、写真はフォルダに入れて push するだけで自動更新。

## 写真の追加（あなたがやること）

**コレクション（テーマ/シリーズ）でグループ化**できます。将来アルバムが増えても破綻しない設計 → [docs/gallery-scaling.md](docs/gallery-scaling.md)

```
photos/
  風景/                      ← コレクション
    軽井沢-高原の夏/          ← アルバム
      DSC_0001.jpg           ← ここに JPEG を入れる
    海と光/
      ...
  夜景/
    夜の東京/
      ...
```

- 上のように **`photos/<コレクション>/<アルバム>/`** で入れると自動でグループ化されます。
- 従来の **`photos/<アルバム>/`**（フラット）も引き続きOK（コレクション未指定＝「未分類」）。
- 入れたら `git add . && git commit -m "add photos" && git push` → GitHub Actions が最適化＋manifest生成＋公開。

> 色について：鑑賞用画像は **ICCプロファイルを保持したままリサイズのみ**。
> DPP4 / R5 Mark II で作った色は変更しません。書き出しは sRGB 埋め込み推奨。

### コレクションやアルバムを整える（任意）

- **コレクション**：`photos/collections.json` で表示名・並びを指定
  ```json
  { "風景": { "slug": "landscape", "title": "風景", "order": 1 } }
  ```
- **アルバム**：`photos/<...>/<アルバム>/_album.json`
  ```json
  { "slug": "karuizawa-summer", "title": "軽井沢 高原の夏", "subtitle": "森と光のあいだ",
    "collection": "風景", "series": "高原", "year": 2025, "tags": ["森","光"],
    "featured": true, "order": 1, "cover": "DSC_0007.jpg" }
  ```
  `featured:true` は将来トップの3D看板に載る印。`year` 未指定なら撮影EXIFの最頻年を自動採用。

## 背景シーン（朝/夜の教会）の差し替え

トップの3D背景は実写画像＋深度パララックスです。`public/img/scene/` の2枚を置き換えるだけ：

| ファイル | 用途 |
|---|---|
| `public/img/scene/morning.jpg` | 朝の教会（横長16:9 推奨・2K程度） |
| `public/img/scene/night.jpg` | 夜の教会（サマーキャンドルナイト／星空・ライトアップ） |

- 現在は **ComfyUI(RealVisXL V5.0)で生成した軽井沢高原教会風A型チャペル**（朝/夜・構図一致）＋ **Depth Anything V2 の実深度マップ**（`morning_depth.png`/`night_depth.png`）が入った状態。RealESRGANで高解像度化済み。
- 深度PNGがあれば `js/main.js` が自動で実深度（押し出し3.6）を使用。差し替えたい場合は4枚を上書きするだけ。
- 右上の「朝 / 夜」ボタンで2枚をクロスフェード。夜は星・キャンドル・蛍のパーティクルが重なります。
- さらに寄せるなら ControlNet で公式の軽井沢高原教会に忠実化、生成手順は [docs/ai-church-prompts.md](docs/ai-church-prompts.md)。

## ローカルで確認

```bash
cd scripts && npm install        # 初回のみ（sharp/exifr）
node build-gallery.mjs           # photos/ → public/img + data/manifest.json
cd .. && npx serve .             # 任意の静的サーバで開く
```

## 公開（GitHub Pages）

1. このフォルダを GitHub リポジトリにして push（ブランチ `main`）
2. リポジトリ Settings → Pages → Source を **GitHub Actions** に設定
3. 以後 push するたび自動ビルド＆公開

## 構成

| パス | 役割 |
|---|---|
| `index.html` / `js/main.js` | 3Dスクロール体験（three + GSAP + Lenis） |
| `album.html` / `js/album.js` | アルバム一覧＋ライトボックス |
| `data/manifest.json` | 写真メタ（**自動生成**。手で触らない） |
| `photos/` | あなたの原本（公開されない） |
| `public/img/` | 公開用に最適化された画像（自動生成） |
| `scripts/build-gallery.mjs` | 画像最適化＋manifest生成 |
| `.github/workflows/deploy.yml` | push→ビルド→公開 |

## ロードマップ

- [x] フェーズ0/1：骨組み＋3D演出＋自動更新（**いまここ**・仮素材）
- [ ] フェーズ2：教会への接近〜入場をAI生成シーケンスに差し替え
- [ ] フェーズ3：デザイン仕上げ・色管理・レスポンシブ・速度最適化
