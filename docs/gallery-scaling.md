# ギャラリーのスケール設計（将来、アルバムが増えたときの見せ方）

アルバムが3 → 20 → 100…と増えても破綻しないための設計メモ。
**作品数でサイトが自動的に見せ方を変える「3層 + 自動適応」**を採用する。

## 3層アーキテクチャ

| 層 | 役割 | スケール理由 |
|---|---|---|
| **① 3D看板（厳選）** | 教会→入場→**featured/最新の数点**が飛んで整列 | 全部見せず絞るので総数が増えても演出のインパクト一定 |
| **② コレクション** | テーマ/シリーズ/年でグループ化。タイル選択→中のアルバム一覧 | カテゴリ階層は数百でも整理可能（プロの定番） |
| **③ スケーラブルなグリッド＋絞り込み** | 伸びる格子＋タグ/年フィルタ＋検索＋遅延読込 | 縦に伸ばすだけ＝無限・モバイルも安心 |

## 自動適応（実装時のしきい値・目安）

`manifest.json` の `albums.length` と `collections.length` を見て出し分ける：

- **〜9アルバム**：現状のまま（全部が3Dで飛んで整列）。コレクションは無視してOK。
- **10〜30**：3Dは `featured` のみ（無ければ最新6）。その下に「全作品」＝コレクション別グリッド。
- **30〜**：コレクションを主役に。3Dは各コレクションの代表 or featured。グリッドにタグ/年フィルタ＋検索＋遅延読込（IntersectionObserver）を有効化。

> いまは①だけ実装済み。②③は **データが既に対応済み**なので、上記しきい値で段階的に足すだけ。

## データモデル（実装済み・schema 2）

`build-gallery.mjs` が生成する `manifest.json`：

```jsonc
{
  "schema": 2,
  "collections": [
    { "slug": "landscape", "title": "風景", "order": 1, "albumSlugs": ["karuizawa-summer", ...] }
  ],
  "albums": [
    {
      "slug": "...", "title": "...", "subtitle": "...",
      "collection": "風景", "collectionSlug": "landscape", "collectionTitle": "風景",
      "series": "高原", "year": 2025, "tags": ["森","光"], "featured": true, "order": 1,
      "cover": "...", "count": 6, "photos": [ ... ]
    }
  ]
}
```

- `albums[]` は**従来通りフラット**＝既存の3D/アルバム画面はそのまま動く（後方互換）。
- `collections[]` と各albumの `collection/series/year/tags/featured` が**将来の②③用**。

## フォルダ運用（2方式・混在OK）

**(A) コレクションでネスト**（推奨・分かりやすい）
```
photos/
  風景/                       ← コレクション
    軽井沢-高原の夏/ *.jpg     ← アルバム
    海と光/ *.jpg
  夜景/
    夜の東京/ *.jpg
```

**(B) フラット**（今まで通り。コレクションは _album.json で指定 or 「未分類」）
```
photos/
  軽井沢-高原の夏/ *.jpg      （_album.json に "collection":"風景"）
```

### メタの上書き

- `photos/collections.json`（任意）でコレクションの表示名・並び：
  ```json
  { "風景": { "slug":"landscape", "title":"風景", "order":1 } }
  ```
- 各アルバムの `_album.json`（任意）：
  ```json
  { "slug":"karuizawa-summer", "title":"軽井沢 高原の夏", "collection":"風景",
    "series":"高原", "year":2025, "tags":["森","光","夏"], "featured":true, "order":1 }
  ```
- `year` は未指定なら撮影EXIFの最頻年を自動採用。`featured:true` で①の3D看板に載る。

## 実装の順序（将来やるとき）

1. **②コレクション・グリッド**：`index.html` 下部 or 「全作品」リンク先に、`collections[]` を見出し、各 `albumSlugs` を responsive grid（CSS columns/grid）で並べる。アルバム選択は既存の `album.html?album=slug` を再利用。
2. **①3Dを featured 連動**に：`buildPanels` を `albums.filter(a=>a.featured)`（featuredが無ければ最新N）に。`#gallery` 戻りもそのまま機能。
3. **③絞り込み**：タグ/年/検索のフィルタUI＋ `loading="lazy"`／IntersectionObserver で遅延読込。
4. （任意）コレクション専用ページ `collection.html?c=slug`、パンくず、URL階層。
