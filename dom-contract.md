# DOM 契約（リデザイン時に保持すべき要素）

`index.html` のマークアップ（見た目）と `style.css` は自由に書き換えてかまいません。
ただし、ロジック（`app.js` / `morse.js`）は以下の **要素ID・`data-action`・クラス名・構造** に依存しています。
リデザインの際は、デザインを変えても下記の契約を満たすようにしてください。これらを保てば、変換・音声・コピー・辞書ロードのロジックはそのまま動きます。

> 触ってよい領域：`index.html` の構造／`style.css`
> 触らない領域：`app.js`（UI統合）／`morse.js`（変換コア）／`xpost.js`（𝕏カウント）／`effects.js`（演出）／`audio.js`（音声）／`contract.js`（契約定義）

**この契約は `contract.js` が単一情報源（single source of truth）です。**
`contract.js` の `REQUIRED_IDS` / `ACTION_ATTRS` / `STATE_CLASSES` を、実行時には
`app.js`（起動時の存在チェック）が、CI では `test/*.test.js` が参照します。
本ドキュメントはその人間向けの解説で、機械的な検証は `contract.js` ＋テストが担います。

---

## 1. 要素 ID（必須）

`app.js` が `contract.js` の `REQUIRED_IDS` を介して `getElementById` で参照します。
**ID 名は変更しないでください**（変更する場合は `contract.js` も合わせて更新）。

| ID | 役割 | 要素の要件 |
|---|---|---|
| `peach` | 🍑 アイコン（つつくと反応） | クリック可能な要素 |
| `tab-enc` / `tab-dec` | エンコード／デコードのタブ | クリック可能な要素 |
| `panel-enc` / `panel-dec` | 各モードのパネル | `style.display` で表示切替される |
| `dict-status` | 漢字辞書のロード状態表示 | テキストとクラスが差し替わる |
| `enc-in` | エンコード入力 | `<textarea>`（`input` イベントで変換） |
| `enc-yomi` | 読み（ひらがな）プレビュー | `<textarea readonly>` |
| `enc-out` | エンコード出力 | `<textarea readonly>` |
| `enc-note` | エンコードのメッセージ表示 | テキストが差し替わる |
| `enc-x-status` | 𝕏 文字数カウンター | テキストとクラスが差し替わる |
| `enc-x-preview` | 超過分プレビューの枠 | `hidden` 属性で表示切替 |
| `enc-x-preview-text` | 超過分プレビュー本文 | 子要素が差し替わる |
| `enc-listen` | エンコードの再生ボタン | **id 必須**（再生状態の追跡・ラベル差替に使用） |
| `dec-in` | デコード入力 | `<textarea>`（`input` イベントで変換） |
| `dec-out` | デコード出力 | `<textarea readonly>` |
| `dec-note` | デコードのメッセージ表示 | テキストが差し替わる |
| `dec-listen` | デコードの再生ボタン | **id 必須**（同上） |
| `credits-modal` | クレジットのモーダル | 背景（自身）クリックで閉じる。`open` クラスで表示 |

---

## 2. `data-action` 属性（必須）

クリック操作は `app.js` の単一の委譲ハンドラ（`document` の `click`）で処理します。
対象要素に `data-action` と、必要な補助属性を付けてください。**要素の種類やネスト位置は自由**ですが、属性は保持してください。

| `data-action` | 補助属性 | 動作 |
|---|---|---|
| `poke` | — | 🍑 をつつく演出＋効果音 |
| `mode` | `data-mode="enc"` / `"dec"` | タブ切替 |
| `sample` | `data-text="…"` | 例文を入力欄へ流し込む |
| `copy` | `data-target="enc-out"` `data-note="enc-note"` | 出力をクリップボードへコピー |
| `listen` | `data-target="enc-out"`（要素自身に `id` も必要） | おしりモールスを再生 |
| `clear` | `data-mode="enc"` / `"dec"` | 入力・出力をクリア |
| `credits-open` | — | クレジットのモーダルを開く |
| `credits-close` | — | クレジットのモーダルを閉じる |

---

## 3. JS が付け外しするクラス名（CSS 側で見た目を定義）

`app.js` が以下のクラスを動的に付与・削除します。CSS で対応するスタイルを用意してください。

| クラス | 付く対象 | 意味 |
|---|---|---|
| `active` | タブ | 選択中のタブ |
| `open` | `#credits-modal` | モーダル表示中 |
| `playing` | 再生ボタン | 再生中（停止表示・アニメーション） |
| `wiggle` | `#peach` | 揺れアニメーション |
| `over` | `#enc-x-status` | 文字数オーバー |
| `overflow` | プレビュー内の `<span>` | 超過した文字の強調 |
| `puff` | 動的生成の `<span>` | ペチッ！の飛び散り演出 |
| `note` / `note ok` | `*-note` | 警告（赤）／成功（緑）メッセージ |
| `dict-status loading` / `ready` / `fail` | `#dict-status` | 辞書ロードの状態 |

---

## 4. スクリプトの読み込み順（変更しないこと）

`</body>` 直前で、必ず **この順**の classic script として読み込みます。

```html
<script type="module" src="app.js"></script>   <!-- これ1本だけ -->
```

`app.js` が ES Module として依存を `import` で解決します（手動の読み込み順管理は不要）。

```
app.js ─┬─ import → morse.js     （変換コア）
        ├─ import → contract.js  （契約定義）
        ├─ import → xpost.js     （𝕏カウント）
        ├─ import → effects.js   （演出）
        └─ import → audio.js ──┬ import → morse.js
                               └ import → effects.js
```

- **グローバルは一切公開しません**（`window.Morse` 等も無し）。各モジュールは module スコープに閉じ、
  必要なものだけを `export` / `import` でやり取りします。
- 漢字の読みに使う形態素解析器は `app.js` が kuromoji ロード後に `setTokenizer(tk)` で
  変換コアへ注入する（`morse.js` は kuromoji に非依存のまま）。
- `kuromoji.js` は外部UMDライブラリのため、従来どおり `app.js` が実行時に動的ロードし
  `window.kuromoji` を参照する（非同期・失敗時フォールバックあり）。
- **HTTP(S) 配信が前提**です（`file://` では CORS によりモジュールが読み込めません）。
  ローカル確認はサーバー経由で行ってください。

## 5. 契約を破ったら気づける仕組み

| 仕組み | 何を検知するか | いつ |
|---|---|---|
| `app.js` の起動時チェック | `REQUIRED_IDS` の要素欠落 | ブラウザのコンソールで即時 |
| `test/dom-contract.test.js` | ID・data-action・補助属性・module読込 | CI（push/PR） |
| `test/css-contract.test.js` | `STATE_CLASSES` が `style.css` に存在するか | CI（push/PR） |

リデザインで `contract.js` の項目を消す/変える場合は、HTML・CSS・テストが
セットでズレないよう、`contract.js` を起点に更新してください。
