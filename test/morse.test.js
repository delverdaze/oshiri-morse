import test from 'node:test';
import assert from 'node:assert/strict';
/*
 * 変換コアは morse.js（ES Module）。named export を取り込んで検証する。
 * DOM・音声・kuromoji には非依存。tokenizer 未注入のため漢字→読みはパススルー。
 * （ESM の名前空間は読み取り専用なので、スプレッドで可変オブジェクトにしてから
 *   テスト用の enterMarker/exitMarker を足す。以降の M.* 参照は変更不要。）
 */
import * as Morse from '../morse.js';
const M = { ...Morse, enterMarker: Morse.ROMAJI_IN, exitMarker: Morse.ROMAJI_OUT };
const norm = (x) => x.replace(/[\s　]/g, '');
const rt = (input) => M.decode(M.encode(input).text).text;   // 往復
const rtNorm = (input) => norm(rt(input));

/* ===== 往復（ラウンドトリップ） ===== */

test('全かなが往復で保たれる（マーカー/符号衝突の総点検）', () => {
  const kana =
    'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほ' +
    'まみむめもやゆよらりるれろわをん' +
    'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ';
  for (const ch of kana) {
    assert.equal(rtNorm(ch), ch, `「${ch}」が往復で消える/化ける（符号衝突の疑い）`);
  }
});

test('回帰: す・さが消えない（欧文マーカー衝突の修正確認）', () => {
  assert.equal(rtNorm('すきです'), 'すきです');
  assert.equal(rtNorm('さくら'), 'さくら');
  assert.equal(rtNorm('あいうえおさしすせそ'), 'あいうえおさしすせそ');
});

test('回帰: 句読点が 、。 のまま戻る', () => {
  assert.equal(rt('あ、い。'), 'あ、い。');
});

test('濁点・半濁点（NFC合成）', () => {
  assert.equal(rtNorm('がぎぐげご'), 'がぎぐげご');
  assert.equal(rtNorm('ぱぴぷぺぽ'), 'ぱぴぷぺぽ');
  assert.equal(rtNorm('ゔ'), 'ゔ');
});

test('長音「ー」', () => {
  assert.equal(rtNorm('らーめん'), 'らーめん');
});

test('カタカナは復元時にひらがなになる（仕様）', () => {
  assert.equal(rtNorm('モールス'), 'もーるす');
});

test('小書きかなは大書きに統合される（仕様）', () => {
  assert.equal(rtNorm('きょう'), 'きよう');
});

test('単語区切り（空白 → ／ → 空白）', () => {
  assert.equal(rt('おしり だいすき'), 'おしり だいすき');
});

/* ===== 英字・数字・混在 ===== */

test('英字: a〜z が往復し、大文字は小文字で復元', () => {
  for (let c = 97; c <= 122; c++) {
    const ch = String.fromCharCode(c);
    assert.equal(rtNorm(ch), ch, `「${ch}」が往復しない`);
  }
  assert.equal(rtNorm('SOS'), 'sos');
  assert.equal(rtNorm('hello'), 'hello');
});

test('数字: 0〜9 が往復', () => {
  for (let d = 0; d <= 9; d++) {
    assert.equal(rtNorm(String(d)), String(d), `「${d}」が往復しない`);
  }
  assert.equal(rtNorm('2024'), '2024');
});

test('かな・英・数の混在とモード切替', () => {
  assert.equal(rtNorm('helloすし'), 'helloすし');
  assert.equal(rtNorm('2024ねん'), '2024ねん');
  assert.equal(rtNorm('Aです'), 'aです');
  assert.equal(rtNorm('テストtest123'), 'てすとtest123'); // カタカナ→ひらがな
});

/* ===== エンコード構造・堅牢性 ===== */

test('エンコード: 長点=DASH_N / 短点=DOT_N が使われる', () => {
  const enc = M.encode('SOS').text; // S O S = ・・・ －－－ ・・・
  assert.ok(enc.includes(M.DOT_N), '短点(ﾌﾟﾘ)が含まれない');
  assert.ok(enc.includes(M.DASH_N), '長点(ﾊﾟｧｰﾝ)が含まれない');
});

test('空・空白入力で落ちない', () => {
  assert.equal(M.encode('').text, '');
  assert.equal(M.decode('').text, '');
  assert.equal(M.encode('   ').text, '');
});

test('未対応文字は unknown に入る', () => {
  const r = M.encode('あ😀');
  assert.ok(Array.isArray(r.unknown) && r.unknown.includes('😀'), '絵文字が unknown に入らない');
});

test('異体字セレクタ(FE0F)付きでもデコードできる', () => {
  const enc = M.encode('おしり').text;
  const withVS = enc.replace(/‼/g, '‼️'); // SNS等で付くことがある
  assert.equal(M.decode(withVS).text, 'おしり');
});

/* ===== 符号の一意性／マーカー衝突（構造チェック） ===== */

test('かな符号は互いに一意（別名 ，． を除く）', () => {
  const seen = new Map();
  for (const k of Object.keys(M.H2M)) {
    if (k === '，' || k === '．') continue; // 、。 と同符号の別名
    const code = M.H2M[k];
    assert.ok(!seen.has(code), `かな符号が重複: 「${k}」と「${seen.get(code)}」が ${code}`);
    seen.set(code, k);
  }
});

test('英字符号・数字符号はそれぞれ一意', () => {
  const uniq = (obj, label) => {
    const seen = new Map();
    for (const k of Object.keys(obj)) {
      assert.ok(!seen.has(obj[k]), `${label}符号が重複: 「${k}」と「${seen.get(obj[k])}」`);
      seen.set(obj[k], k);
    }
  };
  uniq(M.E2M, '英字');
  uniq(M.NUM2M, '数字');
});

test('★欧文切替マーカーが、かな・英字・数字のどの符号とも衝突しない', () => {
  assert.ok(M.enterMarker, 'enterマーカーをコードから抽出できない');
  assert.ok(M.exitMarker, 'exitマーカーをコードから抽出できない');
  assert.notEqual(M.enterMarker, M.exitMarker, 'enter/exit マーカーが同一');
  const all = new Set();
  for (const k of Object.keys(M.H2M)) all.add(M.H2M[k]);
  for (const k of Object.keys(M.E2M)) all.add(M.E2M[k]);
  for (const k of Object.keys(M.NUM2M)) all.add(M.NUM2M[k]);
  assert.ok(!all.has(M.enterMarker), `enterマーカー(${M.enterMarker})が文字符号と衝突`);
  assert.ok(!all.has(M.exitMarker), `exitマーカー(${M.exitMarker})が文字符号と衝突（す/さバグの再来）`);
});
