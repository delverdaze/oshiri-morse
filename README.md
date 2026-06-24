# 🍑 おしりモールス変換器

日本語を「お尻を叩く音」のモールス信号風テキストに変換し、SNS などにこっそり投稿するためのお遊びツールです。
受け取ったフォロワーは、同じツールのデコード欄に貼り付けると元の意味が読めます。

```
長点 －  →  ﾊﾟｧｰﾝｯ‼︎   （バチーン！＝思いっきり叩く破裂音）
短点 ・  →  ﾌﾟﾘｯ        （ちょん♡＝かわいく軽く触れる音）
```

`🔊 おしりで聞く` ボタンを押すと、モールスのリズムに合わせて
**かわいい「ﾌﾟﾘ」と本気の「ﾊﾟｧｰﾝ」のギャップ**を音で楽しめます。
「ﾌﾟﾘ」は Web Audio 合成、「ﾊﾟｧｰﾝ」は実録サンプル（後述）を base64 で HTML に内蔵しています。

例：「おしり」→ `ﾌﾟﾘｯﾊﾟｧｰﾝｯ‼︎ﾌﾟﾘｯﾌﾟﾘｯﾌﾟﾘｯ　ﾊﾟｧｰﾝｯ‼︎ﾊﾟｧｰﾝｯ‼︎ﾌﾟﾘｯﾊﾟｧｰﾝｯ‼︎ﾌﾟﾘｯ　ﾊﾟｧｰﾝｯ‼︎ﾊﾟｧｰﾝｯ‼︎ﾌﾟﾘｯ`

---

## 🙏 原案・クレジット

このツールは **God-eternal バンディクー** さん（note: [@gorira_yurusan](https://note.com/gorira_yurusan)）が提唱された
「おしりモールス信号」というアイデアが原案です。

- 原案記事：[【新提案】おしりモールス信号でTCG論争をマイルドなソフトタッチ♡にしよう【最先端技術】](https://note.com/gorira_yurusan/n/n6b4b79ee8601)

原案では変換を AI（ChatGPT 等）へのプロンプトで行っていますが、本リポジトリはその発想に **インスパイアされて**、
ブラウザだけで動く Web アプリとして独自に実装し直したものです。素敵なアイデアに感謝します🙏

---

## ✨ 特長

- **エンコード / デコード** の両対応（タブ切り替え）
- 入力するたびに**リアルタイム変換**
- **漢字混じりの日本語**もそのまま入力可能（読みに自動変換）
- 送信前に読み方を確認できる **「読み（ひらがな）」プレビュー**
- X投稿用の**280文字カウンター**（超過分を赤く表示）
- すべて**ブラウザ内で完結**（入力テキストは外部に送信しません）
- **単一 HTML ファイル**。`index.html` を開くだけ／GitHub Pages にそのまま置けます

---

## 🛠 仕組み

### 1. かな → おしりモールス（変換コア）

実行時に AI は使いません。**和文モールス符号表をコード内に持ち、決定論的に変換**します（即時・無料・オフライン）。

1. 入力を単語（空白区切り）に分割
2. 各かなを和文モールス符号（`・` / `－`）に変換
3. `－` を `ﾊﾟｧｰﾝｯ‼︎`、`・` を `ﾌﾟﾘｯ` に置換
4. かな1文字ごとを全角スペース `　`、単語の区切りを全角スラッシュ `／` で連結

デコードは逆順で、`ﾊﾟｧｰﾝｯ‼︎` / `ﾌﾟﾘｯ` を `－` / `・` に戻して和文モールスを解読します。
和文モールスの全符号が**衝突しない（＝完全可逆）**ことを確認済みです。

- **カタカナ**は内部でひらがなに正規化
- **濁点・半濁点**は Unicode の NFD/NFC で分解・合成（例：`か`＋`゛`＝`が`）
- **長音「ー」「、」「。」**にも対応

### 2. 漢字 → 読み（前処理）

漢字混じりの文章は、エンコード時に [kuromoji.js](https://github.com/takuyaa/kuromoji.js) で形態素解析し、
各語の**読み（かな）**を取り出してから上記の変換コアに渡します。

```
好きです →（kuromoji）→ すきです →（変換コア）→ ﾌﾟﾘｯ… 
```

辞書（約 4MB）は初回のみ CDN から取得し、以降の変換はすべてブラウザ内で完結します。

### 3. 読みプレビュー

形態素解析は読みを誤ることがあります（例：「辛い」＝つらい／からい）。
デコード結果はひらがなのみで返るため、**送り手が投稿前に読みを目視確認**できるよう、
おしり化の前段の「読み（ひらがな）」を画面に表示します。読みが違う場合はひらがなで打ち直せば確実です。

---

## 📦 使用ライブラリ

| ライブラリ | 用途 | バージョン | ライセンス |
|---|---|---|---|
| [kuromoji.js](https://github.com/takuyaa/kuromoji.js) | 日本語形態素解析（漢字→読み） | 0.1.2（CDN: jsdelivr） | Apache-2.0 |

本体（変換コア・UI）は素の HTML / CSS / JavaScript のみで、ビルド工程はありません。

### 音素材

| 素材 | 用途 | 出典 | ライセンス |
|---|---|---|---|
| Whip / 鞭のしなる音 | 「ﾊﾟｧｰﾝ」の破裂音 | [Universfield](https://pixabay.com/ja/users/universfield-28281460/) (Pixabay) | Pixabay Content License |
| Bubble pop | 「ﾌﾟﾘ」のかわいい音 | [Universfield](https://pixabay.com/ja/users/universfield-28281460/) (Pixabay) | Pixabay Content License |

クレジット：

> Sound Effect by [Universfield](https://pixabay.com/ja/users/universfield-28281460/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=123738) from [Pixabay](https://pixabay.com/sound-effects//?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=123738)
>
> Sound Effect by [Universfield](https://pixabay.com/ja/users/universfield-28281460/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=293342) from [Pixabay](https://pixabay.com//?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=293342)

※ base64 で `index.html` に内蔵しているため、オフラインでも鳴ります（「ﾌﾟﾘ」は実録サンプル未ロード時のみ Web Audio 合成にフォールバック）。

---

## 📄 ライセンス

このリポジトリのソースコードは [MIT License](LICENSE) です。商用利用・改変・再配布を含めて自由に利用できます。再配布時は、LICENSE の著作権表示と許諾文を残してください。

`index.html` に埋め込まれている Pixabay 提供の効果音は MIT License の対象外です。効果音の利用・再配布には、それぞれの [Pixabay Content License](https://pixabay.com/service/license-summary/) が適用されます。

---

## 🚀 使い方

### ローカル

`index.html` をブラウザで開くだけです。

### GitHub Pages で公開

1. リポジトリの **Settings → Pages**
2. **Source** を `Deploy from a branch`、ブランチを `main` / `(root)` に設定
3. 数十秒後に `https://<ユーザー名>.github.io/oshiri-morse/` で公開されます

---

## 📁 ファイル構成

```
oshiri-morse/
├── index.html              # アプリ本体（HTML/CSS/JS 全部入り）
├── oshiri-morse-encode.md  # 原案ベースのエンコード仕様（プロンプト）
├── oshiri-morse-decode.md  # 原案ベースのデコード仕様（プロンプト）
├── LICENSE                 # ソースコードの MIT License
├── README.md
└── .gitignore
```

---

## ⚠️ 仕様上の制約

和文モールスは「音（かな読み）」単位の符号体系のため、以下は仕様です。

- カタカナは復元時に**ひらがな**になります（例：`モールス` → `もーるす`）。意味は通じます。
- **小書きかな**は大書きに統合されます（例：`きょう` → `きよう`）。和文モールスに小書き符号がないためです。
- **数字・英字・記号**（一部を除く）は未対応で、変換時に警告表示します。
- 漢字の読みは形態素解析の精度に依存します（読みプレビューで確認してください）。

---

## 🔒 プライバシー

入力テキストの変換はすべて利用者のブラウザ内で行われ、サーバーには送信されません。
ネットワーク通信は、初回の漢字辞書（kuromoji）の取得のみです。

---

*Inspired by God-eternal バンディクー（@gorira_yurusan）. Made with 🍑.*
