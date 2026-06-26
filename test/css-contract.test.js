import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * CSS契約テスト（依存ゼロ）。
 * app.js / effects.js / audio.js は state クラス（active/open/playing 等）を
 * 動的に付け外しする。これらが style.css から消えても JS はエラーを出さず、
 * 見た目だけ静かに壊れる（最も気づきにくい不具合）。contract.js の STATE_CLASSES
 * を単一情報源として、各クラスが style.css にセレクタとして定義されているか検証する。
 */
import { STATE_CLASSES } from '../contract.js';
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');

test('STATE_CLASSES がすべて style.css にセレクタとして存在する', () => {
  assert.ok(STATE_CLASSES.length > 0, 'STATE_CLASSES が空');
  for (const cls of STATE_CLASSES) {
    // `.cls` の直後が識別子文字でない（= .over が .overflow に誤マッチしない）
    const re = new RegExp(`\\.${cls}(?![\\w-])`);
    assert.ok(re.test(css),
      `クラス「.${cls}」が style.css に無い（JS が付与するが CSS 定義が消えている）`);
  }
});
