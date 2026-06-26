'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
 * DOM契約テスト（依存ゼロ）。
 * app.js は index.html の要素ID・data-action を contract.js 経由で参照する。
 * マークアップ側でIDや data-action を消す/打ち間違えると、変換コアのテストは
 * 緑のまま実機だけが静かに壊れる。ここではHTMLを文字列として読み、
 * contract.js（＝app.js と同じ単一情報源）に挙げた契約が守られているかを検証する。
 * リデザインで index.html を書き換えても、この契約が安全ネットになる。
 */
const Contract = require('../contract.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const tagsWithAction = (action) =>
  html.match(new RegExp(`<[^>]*data-action=["']${action}["'][^>]*>`, 'g')) || [];

/* ===== 必須の要素ID（contract.js の REQUIRED_IDS） ===== */
test('REQUIRED_IDS がすべて index.html に存在する', () => {
  assert.ok(Contract.REQUIRED_IDS.length > 0, 'REQUIRED_IDS が空');
  for (const id of Contract.REQUIRED_IDS) {
    const re = new RegExp(`id=["']${id}["']`);
    assert.ok(re.test(html), `要素ID「${id}」が index.html から消えている（app.js が参照）`);
  }
});

/* ===== 必須の data-action（contract.js の ACTION_ATTRS のキー） ===== */
test('ACTION_ATTRS のすべての data-action が index.html に存在する', () => {
  const actions = Object.keys(Contract.ACTION_ATTRS);
  assert.ok(actions.length > 0, 'ACTION_ATTRS が空');
  for (const action of actions) {
    assert.ok(tagsWithAction(action).length > 0,
      `data-action「${action}」が index.html から消えている（app.js が委譲で処理）`);
  }
});

/* ===== 各 data-action に必要な補助属性が揃っている ===== */
test('各 data-action 要素が ACTION_ATTRS の必須属性を備えている', () => {
  for (const [action, attrs] of Object.entries(Contract.ACTION_ATTRS)) {
    for (const tag of tagsWithAction(action)) {
      for (const attr of attrs) {
        // "id" は「要素自身に id 属性が必要」（listen は btnId に el.id を使う）
        const re = attr === 'id' ? /\bid=/ : new RegExp(`${attr}=`);
        assert.ok(re.test(tag), `data-action="${action}" に ${attr} が無い: ${tag}`);
      }
    }
  }
});

/* ===== 外部ファイルの読み込みと順序 ===== */

test('style.css を読み込んでいる', () => {
  assert.ok(/<link[^>]*href=["']style\.css["']/.test(html), 'style.css の <link> が無い');
});

test('contract.js / morse.js を app.js より先に読み込んでいる', () => {
  const iContract = html.indexOf('contract.js');
  const iMorse = html.indexOf('morse.js');
  const iApp = html.indexOf('app.js');
  assert.ok(iContract !== -1, 'contract.js の <script> が無い');
  assert.ok(iMorse !== -1, 'morse.js の <script> が無い');
  assert.ok(iApp !== -1, 'app.js の <script> が無い');
  assert.ok(iContract < iApp, 'contract.js は app.js より先に読み込むこと');
  assert.ok(iMorse < iApp, 'morse.js は app.js より先に読み込むこと');
});

test('スクリプトは module ではなく classic script で読み込む（名前空間がグローバル前提）', () => {
  assert.ok(!/<script[^>]*type=["']module["'][^>]*src=["'](?:contract|morse|app)\.js["']/.test(html),
    'contract/morse/app を type="module" で読み込んでいる（window.Morse/Contract が壊れる）');
});
