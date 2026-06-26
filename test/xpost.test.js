import test from 'node:test';
import assert from 'node:assert/strict';
import { xCharacterWeight, measureXPost, X_POST_LIMIT } from '../xpost.js';

/*
 * 𝕏 文字数カウントの単体テスト。
 * 以前は app.js（DOM依存）に閉じていてテスト不能だったが、xpost.js（純粋）として
 * 分離したことで境界条件を直接検証できる。
 */

test('上限は 280', () => {
  assert.equal(X_POST_LIMIT, 280);
});

test('重み: ラテン・数字・基本記号は 1', () => {
  for (const ch of 'aZ0 .-!') assert.equal(xCharacterWeight(ch), 1, `「${ch}」`);
});

test('重み: かな・漢字・全角・絵文字は 2', () => {
  for (const ch of 'あ漢Ａ　') assert.equal(xCharacterWeight(ch), 2, `「${ch}」`);
  assert.equal(xCharacterWeight('😀'), 2, '絵文字（サロゲートペア）は 2');
});

test('length: 重み付き合計を返す', () => {
  assert.equal(measureXPost('').length, 0);
  assert.equal(measureXPost('abc').length, 3);          // 1×3
  assert.equal(measureXPost('あいう').length, 6);        // 2×3
  assert.equal(measureXPost('a😀').length, 3);          // 1 + 2
});

test('境界: 上限ちょうどは全部収まる（validEnd = 全長）', () => {
  const s = 'a'.repeat(280);                            // 重み1×280 = 280
  const m = measureXPost(s);
  assert.equal(m.length, 280);
  assert.equal(m.validEnd, 280);
});

test('境界: 1文字オーバーは最後の1文字が切れる', () => {
  const s = 'a'.repeat(281);                            // 281
  const m = measureXPost(s);
  assert.equal(m.length, 281);
  assert.equal(m.validEnd, 280);                        // 280文字目までが投稿可能
});

test('境界: 重み2文字で上限を1またぐと、その文字は入らない', () => {
  const s = 'あ'.repeat(139) + 'あ';                    // 2×140 = 280 ちょうど
  assert.equal(measureXPost(s).length, 280);
  assert.equal(measureXPost(s).validEnd, 140);          // コード単位140 = 140文字
  const over = 'あ'.repeat(140) + 'a';                  // 280 + 1 = 281
  const m = measureXPost(over);
  assert.equal(m.length, 281);
  assert.equal(m.validEnd, 140);                        // 末尾の 'a' は入らない
});
