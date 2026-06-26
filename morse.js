/* おしりモールス 変換コア（純粋ロジック・ES Module）
   DOM・音声・kuromojiに非依存。ブラウザ(import)とNode(node:test の import)で共用。
   漢字→読みの形態素解析器は外部（app.js）から setTokenizer() で注入する。 */

/* ===== おしりモールス 変換コア ===== */
export const DASH = "ﾊﾟｧｰﾝｯ‼︎";   // 長点 －
export const DOT  = "ﾌﾟﾘｯ";        // 短点 ・
// SNS投稿で異体字セレクタ(U+FE0E/FE0F)が剥がれる/絵文字化することがあるため、
// 解読・再生時は VS を除去した形で照合して堅牢にする（エンコード出力は不変）
export const VS_RE  = /[︎️]/g;   // 異体字セレクタ(FE0E/FE0F)を除去
export const DASH_N = DASH.replace(VS_RE, "");
export const DOT_N  = DOT.replace(VS_RE, "");
export const ROMAJI_IN  = "-..---";   // 欧文（ローマ字）モード開始マーカー
export const ROMAJI_OUT = "-.-.-.-";  // 欧文モード終了マーカー

// 和文モールス符号（・=. －=- で保持）
export const H2M = {
  "あ":"--.--","い":".-","う":"..-","え":"-.---","お":".-...",
  "か":".-..","き":"-.-..","く":"...-","け":"-.--","こ":"----",
  "さ":"-.-.-","し":"--.-.","す":"---.-","せ":".---.","そ":"---.",
  "た":"-.","ち":"..-.","つ":".--.","て":".-.--","と":"..-..",
  "な":".-.","に":"-.-.","ぬ":"....","ね":"--.-","の":"..--",
  "は":"-...","ひ":"--..-","ふ":"--..","へ":".","ほ":"-..",
  "ま":"-..-","み":"..-.-","む":"-","め":"-...-","も":"-..-.",
  "や":".--","ゆ":"-..--","よ":"--",
  "ら":"...","り":"--.","る":"-.--.","れ":"---","ろ":".-.-",
  "わ":"-.-","ゐ":".-..-","ゑ":".--..","を":".---","ん":".-.-.",
  "ー":".--.-",                       // 長音符
  "゙":"..",                       // 濁点（合成用）
  "゚":"..--.",                    // 半濁点（合成用）
  "、":".-.-.-","。":".-.-..","，":".-.-.-","．":".-.-.."
};

// 欧文モールス符号（アルファベット）
export const E2M = {
  "A":".-", "B":"-...", "C":"-.-.", "D":"-..", "E":".",
  "F":"..-.", "G":"--.", "H":"....", "I":"..", "J":".---",
  "K":"-.-", "L":".-..", "M":"--", "N":"-.", "O":"---",
  "P":".---.", "Q":"--.-", "R":".-.", "S":"...", "T":"-",
  "U":"..-", "V":"...-", "W":".--", "X":"-..-", "Y":"-.--", "Z":"--.."
};

// 数字モールス符号
export const NUM2M = {
  "1":".----", "2":"..---", "3":"...--", "4":"....-", "5":".....",
  "6":"-....", "7":"--...", "8":"---..", "9":"----.", "0":"-----"
};

// 小書きかな → 大書きかな（和文モールスに小書きは無いため）
const SMALL = {"ぁ":"あ","ぃ":"い","ぅ":"う","ぇ":"え","ぉ":"お",
  "っ":"つ","ゃ":"や","ゅ":"ゆ","ょ":"よ","ゎ":"わ","ゕ":"か","ゖ":"け"};

// 逆引き（モールス → 文字）
export const M2H = {};
for(const k in H2M){ M2H[H2M[k]] = k; }
// 句読点は和文の「、」「。」を正規の復元先にする（，．は入力用の別名）
M2H[".-.-.-"] = "、";
M2H[".-.-.."] = "。";

export const M2E = {};
for(const k in E2M){ M2E[E2M[k]] = k.toLowerCase(); } // 小文字で復元する

export const M2NUM = {};
for(const k in NUM2M){ M2NUM[NUM2M[k]] = k; }

function kataToHira(ch){
  const c = ch.charCodeAt(0);
  if(c >= 0x30A1 && c <= 0x30F6) return String.fromCharCode(c - 0x60);
  return ch;
}
function morseToOshiri(m){
  let s = "";
  for(const ch of m) s += (ch === "-") ? DASH : DOT;
  return s;
}

/* ---- 漢字 → 読み（かな）：形態素解析器は外部から注入 ---- */
// tokenizer は app.js が kuromoji ロード完了後に setTokenizer() で渡す。
// 未注入のうち（および Node テスト時）は素通り＝かなはそのまま使える。
let tokenizer = null;
export function setTokenizer(tk){ tokenizer = tk; }
export const KANJI_RE = /[㐀-鿿豈-﫿]/;
export function wordToKana(word){
  if(!tokenizer) return word;            // 辞書未注入時は素通り
  try{
    return tokenizer.tokenize(word).map(t=>{
      const r = t.reading;               // 読み（カタカナ）。後段でひらがなに正規化される
      return (r && r !== "*") ? r : t.surface_form;
    }).join("");
  }catch(e){ return word; }
}

/* ---- 読みプレビュー：日本語 → ひらがな読み（おしり化の前段） ---- */
export function toHiraReading(input){
  const words = input.trim().split(/[\s　]+/).filter(Boolean);
  return words.map(w=>{
    const kana = wordToKana(w);          // 漢字→読み（カタカナ）。かなはそのまま
    let out = "";
    for(const ch of kana) out += kataToHira(ch);   // 表示用にひらがな化（漢字が残れば素通り）
    return out;
  }).join(" ");
}

/* ---- エンコード：日本語 → おしりモールス ---- */
export function encode(input){
  const unknown = new Set();
  const words = input.trim().split(/[\s　]+/).filter(Boolean);
  let isRomajiMode = false;
  const outWords = words.map(word=>{
    word = wordToKana(word);             // 漢字を読みに変換してから処理
    const nfd = word.normalize("NFD");
    const units = [];
    for(const ch of nfd){
      const norm = ch.normalize("NFKC");
      if(ch === "゙" || ch === "゚"){
        if(isRomajiMode){
          units.push(morseToOshiri(ROMAJI_OUT));
          isRomajiMode = false;
        }
        const key = ch === "゙" ? "゙" : "゚";
        units.push(morseToOshiri(H2M[key]));
        continue;
      }
      if(/[A-Za-z]/.test(norm)){
        const uChar = norm.toUpperCase();
        if(!isRomajiMode){
          units.push(morseToOshiri(ROMAJI_IN));
          isRomajiMode = true;
        }
        units.push(morseToOshiri(E2M[uChar]));
        continue;
      }
      if(/[0-9]/.test(norm)){
        units.push(morseToOshiri(NUM2M[norm]));
        continue;
      }
      let c = kataToHira(ch);
      if(SMALL[c]) c = SMALL[c];
      if(H2M[c]){
        if(isRomajiMode){
          units.push(morseToOshiri(ROMAJI_OUT));
          isRomajiMode = false;
        }
        units.push(morseToOshiri(H2M[c]));
        continue;
      }
      if(ch === "／" || ch === "/"){ continue; }   // 入力中のスラッシュは無視
      unknown.add(ch);
      units.push("【未対応:" + ch + "】");
    }
    return units.join("　");
  });
  let text = outWords.join(" ／ ");
  if(isRomajiMode){
    text += "　" + morseToOshiri(ROMAJI_OUT);
  }
  return { text: text, unknown:[...unknown] };
}

/* ---- デコード：おしりモールス → 日本語 ---- */
export function decode(input){
  const bad = [];
  input = input.replace(VS_RE, "");   // 異体字セレクタを除去して照合を堅牢に
  const words = input.split("／");
  let isRomajiMode = false;
  const outWords = words.map(word=>{
    const units = word.split(/[\s　]+/).filter(Boolean);
    let line = "";
    for(const u of units){
      let m = "", i = 0;
      while(i < u.length){
        if(u.startsWith(DASH_N, i)){ m += "-"; i += DASH_N.length; }
        else if(u.startsWith(DOT_N, i)){ m += "."; i += DOT_N.length; }
        else { i++; }   // 余計な文字はスキップ
      }
      if(m === "") continue;
      if(m === ROMAJI_IN){
        isRomajiMode = true;
        continue;
      }
      if(m === ROMAJI_OUT){
        isRomajiMode = false;
        continue;
      }
      if(M2NUM[m] !== undefined){
        line += M2NUM[m];
      } else if(isRomajiMode){
        if(M2E[m] !== undefined){
          line += M2E[m];
        } else {
          line += "【?】";
          bad.push(u);
        }
      } else {
        if(M2H[m] !== undefined){
          line += M2H[m];
        } else {
          line += "【?】";
          bad.push(u);
        }
      }
    }
    return line;
  });
  // 合成用の濁点・半濁点を結合（か+゙→が など）
  const joined = outWords.filter(w=>w!=="").join(" ").normalize("NFC");
  return { text: joined, bad };
}
