'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
 * 本番コード無変更ハーネス：
 * index.html から「変換コア」だけを抜き出して Node で評価する。
 * （DOM・音声・kuromoji に依存しない純粋部分のみ。tokenizer は null のため
 *   漢字→読みはパススルーされ、かな・英数字の変換/復元はそのまま検証できる）
 *
 * morse.js へ切り出した後は、この読み込み部だけ require に差し替えれば
 * 同じテストがそのまま使える。
 */
function loadCore() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const startMark = '/* ===== おしりモールス 変換コア ===== */';
  const endMark = '/* ===== UI ===== */';
  const s = html.indexOf(startMark);
  const e = html.indexOf(endMark);
  assert.ok(s !== -1 && e !== -1 && e > s,
    '変換コアの範囲を index.html から取得できません（マーカーを確認）');
  const core = html.slice(s, e);
  const api = new Function(
    core + '\nreturn { encode, decode, toHiraReading, H2M, E2M, NUM2M, M2H, M2E, M2NUM, DASH_N, DOT_N };'
  )();
  // 欧文モード切替マーカーを「コードから」抽出（テストとコードの値ズレを防ぐ）
  api.enterMarker = (core.match(/m === "([.\-]+)"[\s\S]{0,40}?isRomajiMode = true/) || [])[1];
  api.exitMarker = (core.match(/m === "([.\-]+)"[\s\S]{0,40}?isRomajiMode = false/) || [])[1];
  return api;
}

const M = loadCore();
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
