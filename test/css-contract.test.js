'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
 * CSS契約テスト（依存ゼロ）。
 * app.js は state クラス（active/open/playing 等）を動的に付け外しする。
 * これらが style.css から消えても JS はエラーを出さず、見た目だけ静かに壊れる
 * （最も気づきにくい不具合）。contract.js の STATE_CLASSES を単一情報源として、
 * 各クラスが style.css にセレクタとして定義されているかを検証する。
 */
const Contract = require('../contract.js');
const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

test('STATE_CLASSES がすべて style.css にセレクタとして存在する', () => {
  assert.ok(Contract.STATE_CLASSES.length > 0, 'STATE_CLASSES が空');
  for (const cls of Contract.STATE_CLASSES) {
    // `.cls` の直後が識別子文字でない（= .over が .overflow に誤マッチしない）
    const re = new RegExp(`\\.${cls}(?![\\w-])`);
    assert.ok(re.test(css),
      `クラス「.${cls}」が style.css に無い（app.js が付与するが CSS 定義が消えている）`);
  }
});
