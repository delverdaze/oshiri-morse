'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
 * DOM契約テスト（依存ゼロ）。
 * app.js は index.html の要素ID・data-action を「文字列」で参照しているため、
 * マークアップ側でIDや data-action を消す/打ち間違えると、変換コアのテストは
 * 緑のまま実機だけが静かに壊れる。ここではHTMLを文字列として読み、
 * dom-contract.md の契約が守られているかを機械的に検証する。
 * （リデザインで index.html を書き換えても、この契約が安全ネットになる）
 */
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* ===== 必須の要素ID（app.js が getElementById する全て） ===== */
const REQUIRED_IDS = [
  'peach',
  'tab-enc', 'tab-dec',
  'panel-enc', 'panel-dec',
  'dict-status',
  'enc-in', 'enc-yomi', 'enc-out', 'enc-note',
  'enc-x-status', 'enc-x-preview', 'enc-x-preview-text',
  'enc-listen',
  'dec-in', 'dec-out', 'dec-note',
  'dec-listen',
  'credits-modal',
];

test('必須の要素IDがすべて存在する', () => {
  for (const id of REQUIRED_IDS) {
    const re = new RegExp(`id=["']${id}["']`);
    assert.ok(re.test(html), `要素ID「${id}」が index.html から消えている（app.js が参照）`);
  }
});

/* ===== 必須の data-action（イベント委譲のディスパッチ先） ===== */
const REQUIRED_ACTIONS = [
  'poke', 'mode', 'sample', 'copy', 'listen', 'clear',
  'credits-open', 'credits-close',
];

test('必須の data-action がすべて存在する', () => {
  for (const a of REQUIRED_ACTIONS) {
    const re = new RegExp(`data-action=["']${a}["']`);
    assert.ok(re.test(html), `data-action「${a}」が index.html から消えている（app.js が委譲で処理）`);
  }
});

/* ===== data-action に必要な補助属性が揃っている ===== */

test('data-action="mode" には data-mode が付いている', () => {
  // タブは enc / dec の2つ
  assert.ok(/data-action=["']mode["'][^>]*data-mode=["']enc["']|data-mode=["']enc["'][^>]*data-action=["']mode["']/.test(html),
    'data-mode="enc" のタブが無い');
  assert.ok(/data-mode=["']dec["']/.test(html), 'data-mode="dec" のタブが無い');
});

test('data-action="copy" には data-target と data-note が付いている', () => {
  // 各 copy ボタンのタグを取り出して属性を確認
  const copyTags = html.match(/<[^>]*data-action=["']copy["'][^>]*>/g) || [];
  assert.ok(copyTags.length >= 2, 'copy ボタンが2つ（enc/dec）見つからない');
  for (const tag of copyTags) {
    assert.ok(/data-target=/.test(tag), `copy ボタンに data-target が無い: ${tag}`);
    assert.ok(/data-note=/.test(tag), `copy ボタンに data-note が無い: ${tag}`);
  }
});

test('data-action="listen" の要素は data-target と id を持つ（listen は btnId に el.id を使う）', () => {
  const listenTags = html.match(/<[^>]*data-action=["']listen["'][^>]*>/g) || [];
  assert.ok(listenTags.length >= 2, 'listen ボタンが2つ（enc/dec）見つからない');
  for (const tag of listenTags) {
    assert.ok(/data-target=/.test(tag), `listen ボタンに data-target が無い: ${tag}`);
    assert.ok(/\bid=/.test(tag), `listen ボタンに id が無い（再生状態の追跡に必須）: ${tag}`);
  }
});

test('data-action="sample" には data-text が付いている', () => {
  const sampleTags = html.match(/<[^>]*data-action=["']sample["'][^>]*>/g) || [];
  assert.ok(sampleTags.length >= 1, 'sample ボタンが見つからない');
  for (const tag of sampleTags) {
    assert.ok(/data-text=/.test(tag), `sample ボタンに data-text が無い: ${tag}`);
  }
});

test('data-action="clear" には data-mode が付いている', () => {
  const clearTags = html.match(/<[^>]*data-action=["']clear["'][^>]*>/g) || [];
  assert.ok(clearTags.length >= 2, 'clear ボタンが2つ（enc/dec）見つからない');
  for (const tag of clearTags) {
    assert.ok(/data-mode=/.test(tag), `clear ボタンに data-mode が無い: ${tag}`);
  }
});

/* ===== 外部ファイルの読み込みと順序 ===== */

test('style.css を読み込んでいる', () => {
  assert.ok(/<link[^>]*href=["']style\.css["']/.test(html), 'style.css の <link> が無い');
});

test('morse.js → app.js の順で読み込んでいる（app.js は morse.js のグローバルに依存）', () => {
  const iMorse = html.indexOf('morse.js');
  const iApp = html.indexOf('app.js');
  assert.ok(iMorse !== -1, 'morse.js の <script> が無い');
  assert.ok(iApp !== -1, 'app.js の <script> が無い');
  assert.ok(iMorse < iApp, 'morse.js は app.js より先に読み込むこと（読み込み順の逆転）');
});

test('スクリプトは module ではなく classic script で読み込む（委譲がグローバル関数前提）', () => {
  assert.ok(!/<script[^>]*type=["']module["'][^>]*src=["'](?:morse|app)\.js["']/.test(html),
    'morse.js / app.js を type="module" で読み込んでいる（グローバル参照が壊れる）');
});
