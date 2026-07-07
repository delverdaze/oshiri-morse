import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * DOM契約テスト（依存ゼロ）。
 * app.js は index.html の要素ID・data-action を contract.js 経由で参照する。
 * マークアップ側でIDや data-action を消す/打ち間違えると、変換コアのテストは
 * 緑のまま実機だけが静かに壊れる。ここではHTMLを文字列として読み、
 * contract.js（＝app.js と同じ単一情報源）に挙げた契約が守られているかを検証する。
 * リデザインで index.html を書き換えても、この契約が安全ネットになる。
 */
import { REQUIRED_IDS, ACTION_ATTRS } from '../contract.js';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const tagsWithAction = (action) =>
  html.match(new RegExp(`<[^>]*data-action=["']${action}["'][^>]*>`, 'g')) || [];

/* ===== 必須の要素ID（contract.js の REQUIRED_IDS） ===== */
test('REQUIRED_IDS がすべて index.html に存在する', () => {
  assert.ok(REQUIRED_IDS.length > 0, 'REQUIRED_IDS が空');
  for (const id of REQUIRED_IDS) {
    const re = new RegExp(`id=["']${id}["']`);
    assert.ok(re.test(html), `要素ID「${id}」が index.html から消えている（app.js が参照）`);
  }
});

/* ===== 必須の data-action（contract.js の ACTION_ATTRS のキー） ===== */
test('ACTION_ATTRS のすべての data-action が index.html に存在する', () => {
  const actions = Object.keys(ACTION_ATTRS);
  assert.ok(actions.length > 0, 'ACTION_ATTRS が空');
  for (const action of actions) {
    assert.ok(tagsWithAction(action).length > 0,
      `data-action「${action}」が index.html から消えている（app.js が委譲で処理）`);
  }
});

/* ===== 各 data-action に必要な補助属性が揃っている ===== */
test('各 data-action 要素が ACTION_ATTRS の必須属性を備えている', () => {
  for (const [action, attrs] of Object.entries(ACTION_ATTRS)) {
    for (const tag of tagsWithAction(action)) {
      for (const attr of attrs) {
        // "id" は「要素自身に id 属性が必要」（listen は btnId に el.id を使う）
        const re = attr === 'id' ? /\bid=/ : new RegExp(`${attr}=`);
        assert.ok(re.test(tag), `data-action="${action}" に ${attr} が無い: ${tag}`);
      }
    }
  }
});

/* ===== 外部ファイルの読み込み ===== */

test('style.css を読み込んでいる', () => {
  // ?v=… のキャッシュバスト用クエリは許容する
  assert.ok(/<link[^>]*href=["']style\.css(?:\?[^"']*)?["']/.test(html), 'style.css の <link> が無い');
});

test('app.js を ES Module として読み込んでいる', () => {
  assert.ok(/<script[^>]*type=["']module["'][^>]*src=["']app\.js(?:\?[^"']*)?["']/.test(html),
    'app.js が <script type="module"> で読み込まれていない（ESM前提）');
});

test('classic script で morse.js / contract.js / app.js を読み込んでいない（import で解決）', () => {
  // ESM では依存は import が解決する。classic な <script src="..."> での重複読込が無いこと。
  assert.ok(!/<script\s+src=["'](?:morse|contract|app)\.js(?:\?[^"']*)?["']/.test(html),
    'classic script で morse/contract/app を読み込んでいる（ESM では不要・二重実行の恐れ）');
});
