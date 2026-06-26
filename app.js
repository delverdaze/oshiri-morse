/* おしりモールス UI 統合（ES Module）
   変換コア(morse) / 契約(contract) / Xカウンタ(xpost) / 演出(effects) / 音声(audio)
   を import して画面に結線する。グローバルは一切公開しない。
   index.html からは <script type="module" src="app.js"> 1行で読み込む。 */
import { encode, decode, toHiraReading, KANJI_RE, setTokenizer } from "./morse.js";
import { REQUIRED_IDS } from "./contract.js";
import { measureXPost, X_POST_LIMIT } from "./xpost.js";
import { puffFrom, puffThrottled } from "./effects.js";
import * as audio from "./audio.js";

/* ===== DOM 参照を一括取得（依存する要素を1か所に集約） =====
   contract.js の REQUIRED_IDS が「app.js が依存する全要素」の単一情報源。
   HTML を編集するときはここ（と contract.js）を見れば依存関係が分かる。 */
const dom = {};
for (const id of REQUIRED_IDS) dom[id] = document.getElementById(id);

// 起動時フェイルファスト：契約違反（IDの消失/誤記）を手元で即検知する。
// （CI では test/dom-contract.test.js が同じ contract.js で検証する）
const missing = REQUIRED_IDS.filter(id => !dom[id]);
if (missing.length) {
  console.error("⚠️ DOM契約違反: 必須要素が見つかりません →", missing,
    "（contract.js の REQUIRED_IDS と index.html を確認してください）");
}

/* ===== UI ===== */
let mode = "enc";
function setMode(m){
  mode = m;
  dom["panel-enc"].style.display = m==="enc" ? "" : "none";
  dom["panel-dec"].style.display = m==="dec" ? "" : "none";
  dom["tab-enc"].classList.toggle("active", m==="enc");
  dom["tab-dec"].classList.toggle("active", m==="dec");
}

let dictState = "idle";   // 辞書ロード状態（dict ローダーが更新）

function runEncode(){
  const v = dom["enc-in"].value;
  const note = dom["enc-note"];
  if(!v.trim()){
    dom["enc-out"].value="";
    dom["enc-yomi"].value="";
    updateXPostCounter("");
    note.textContent="";
    return;
  }
  // 漢字を含み、辞書がまだ使えない（ロード前/中）なら、ロードを促して待つ。
  if(KANJI_RE.test(v) && dictState !== "ready" && dictState !== "failed"){
    requestDict();
    dom["enc-out"].value="";
    dom["enc-yomi"].value="";
    updateXPostCounter("");
    note.className = "note";
    note.textContent = "📖 漢字の読みを準備中…（完了すると自動で変換します）";
    return;
  }
  dom["enc-yomi"].value = toHiraReading(v);
  const r = encode(v);
  const outEl = dom["enc-out"];
  const changed = outEl.value !== r.text;
  outEl.value = r.text;
  updateXPostCounter(r.text);
  if(changed && r.text) puffThrottled(outEl);
  if(r.unknown.length){
    note.className = "note";
    note.textContent = "⚠️ 変換できない文字：" + r.unknown.join(" ") + "（ひらがな・カタカナのみ対応）";
  } else { note.className="note ok"; note.textContent="✅ おしり化、完了。"; }
}

function updateXPostCounter(text){
  const status = dom["enc-x-status"];
  const preview = dom["enc-x-preview"];
  const previewText = dom["enc-x-preview-text"];
  const measured = measureXPost(text);
  const overflow = measured.length - X_POST_LIMIT;
  status.classList.toggle("over", overflow > 0);
  if(overflow > 0){
    status.textContent = "⚠️ おしりが𝕏の枠からはみ出しています（" + overflow + " 文字オーバー）";
    preview.hidden = false;
    previewText.replaceChildren();
    const allowed = document.createElement("span");
    allowed.textContent = text.slice(0, measured.validEnd);
    const excess = document.createElement("span");
    excess.className = "overflow";
    excess.textContent = text.slice(measured.validEnd);
    previewText.append(allowed, excess);
  } else {
    status.textContent = "𝕏 投稿：" + measured.length + " / " + X_POST_LIMIT + " 文字（残り " + (X_POST_LIMIT - measured.length) + "）";
    preview.hidden = true;
    previewText.replaceChildren();
  }
}
function runDecode(){
  const v = dom["dec-in"].value;
  const note = dom["dec-note"];
  if(!v.trim()){ dom["dec-out"].value=""; note.textContent=""; return; }
  const r = decode(v);
  dom["dec-out"].value = r.text;
  if(r.text === ""){
    note.className="note";
    note.textContent = "⚠️ おしりモールスではありません。ﾊﾟｧｰﾝｯ‼︎ / ﾌﾟﾘｯ を貼ってね。";
  } else if(r.bad.length){
    note.className="note";
    note.textContent = "⚠️ 解読できない符号がありました（【?】部分）";
  } else { note.className="note ok"; note.textContent="✅ 復元できました"; }
}

function sample(t){ dom["enc-in"].value = t; runEncode(); }
function clearAll(m){
  dom[m+"-in"].value="";
  dom[m+"-out"].value="";
  if(m==="enc") dom["enc-yomi"].value="";
  if(m==="enc") updateXPostCounter("");
  dom[m+"-note"].textContent="";
  dom[m+"-in"].focus();
}
// クリップボードAPIが使えない/拒否される環境（iOSのBrave等）向けの同期コピー。
// 入力欄をフォーカスしない（＝キーボードが出ない）。ユーザー操作中に同期実行すること。
function legacyCopy(txt){
  const span = document.createElement("span");
  span.textContent = txt;
  span.style.cssText = "position:fixed;left:-9999px;top:0;white-space:pre;user-select:text;-webkit-user-select:text;";
  document.body.appendChild(span);
  let ok = false;
  try{
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(span);
    sel.removeAllRanges();
    sel.addRange(range);
    ok = document.execCommand("copy");
    sel.removeAllRanges();
  }catch(e){ ok = false; }
  document.body.removeChild(span);
  return ok;
}
function copyOut(id, noteId){
  const target = dom[id];
  const note = dom[noteId];
  const txt = target.value;
  if(!txt){ return; }
  const done = (ok)=>{
    if(ok){ note.className="note ok"; note.textContent="📋 コピーしました！"; puffFrom(target, 3); }
    else  { note.className="note"; note.textContent="⚠️ コピーできませんでした。出力を長押しして選択 → コピーしてください。"; }
  };
  // まずユーザー操作中（同期）に execCommand コピー。iOS Safari/Brave 等で確実に動く。
  if(legacyCopy(txt)){ done(true); return; }
  // 同期コピーが不可なら非同期クリップボードAPIを試す（デスクトップ等のフォールバック）。
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(()=>done(true)).catch(()=>done(false));
  }else{
    done(false);
  }
}

// 🔊 再生ボタン：再生中なら停止、別ボタン/停止状態なら最初から再生。
// 音声本体は audio.js が担当。DOM値の読み出しと peach 要素の受け渡しはここで行う。
function listen(srcId, btnId){
  const text = dom[srcId].value;
  const btn = dom[btnId];
  if(!text.trim()){ return; }
  if(audio.isPlaying()){
    const same = (audio.currentBtn() === btn);
    audio.stopPlay();
    if(same) return;                 // 同じボタン → 停止のみ（もう一度押すと最初から）
  }
  audio.playOshiri(text, btn, dom["peach"]);
}

/* ===== クレジットモーダル ===== */
function openCredits(){ dom["credits-modal"].classList.add("open"); }
function closeCredits(){ dom["credits-modal"].classList.remove("open"); }
document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeCredits(); });

/* ===== イベント委譲：data-action でクリック操作を一元管理 =====
   インライン onclick の代替。マークアップ側は data-action（＋必要な data-*）を
   保持するだけでよく、リデザインで構造が変わっても振る舞いを維持できる。
   委譲ハンドラはクリックイベント中に同期実行されるため、poke/listen の
   unlockKick はユーザージェスチャー内で発火する（iOS音声アンロックを維持）。 */
const ACTIONS = {
  "poke":          el => audio.poke(el),
  "mode":          el => setMode(el.dataset.mode),
  "sample":        el => sample(el.dataset.text),
  "copy":          el => copyOut(el.dataset.target, el.dataset.note),
  "listen":        el => listen(el.dataset.target, el.id),
  "clear":         el => clearAll(el.dataset.mode),
  "credits-open":  () => openCredits(),
  "credits-close": () => closeCredits(),
};
document.addEventListener("click", e=>{
  const el = e.target.closest("[data-action]");
  if(el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el);
});
// モーダル背景（オーバーレイ自身）のクリックで閉じる
dom["credits-modal"].addEventListener("click", e=>{
  if(e.target === dom["credits-modal"]) closeCredits();
});

dom["enc-in"].addEventListener("input", runEncode);
dom["dec-in"].addEventListener("input", runDecode);

// バックグラウンドに入ったらAudioContextを破棄（iOSで復帰後に音が死ぬ問題対策）。
// 復帰後は次の再生操作（ユーザー操作）で audio 側が新しいコンテキストを作り直す。
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState === "hidden") audio.teardownAudio(); });
window.addEventListener("pagehide", audio.teardownAudio);
// 初回タッチ/クリックで音源デコードを先行開始（再生時の待ちを減らす。passive）。
window.addEventListener("touchstart", audio.preloadAudio, { passive: true });
window.addEventListener("click", audio.preloadAudio, { passive: true });

/* ---- 漢字辞書（kuromoji）のロード：ページ表示後に非同期で取得 ----
   辞書の状態（dictState/dictTimer）は UI 側の都合なので app.js が所有する。
   ロード完了時に setTokenizer() で変換コアへ tokenizer を注入する。 */
let dictTimer = null;

function failDict(){
  const status = dom["dict-status"];
  if(dictTimer) clearTimeout(dictTimer);
  dictState = "failed";
  status.className = "dict-status fail";
  status.textContent = "⚠️ 漢字辞書を読み込めませんでした（ひらがな・カタカナ・英数字は利用できます）";
  runEncode();
}

function buildTokenizer(){
  if(dictState !== "loading") return;
  if(typeof kuromoji === "undefined"){ failDict(); return; }
  try{
    kuromoji.builder({ dicPath: "dict/" })
      .build(function(err, tk){
        if(dictState !== "loading") return;
        if(err){ failDict(); return; }
        if(dictTimer) clearTimeout(dictTimer);
        setTokenizer(tk);   // 変換コアへ注入
        dictState = "ready";
        const status = dom["dict-status"];
        status.className = "dict-status ready";
        status.textContent = "✅ 漢字のままでOK（読みをひらがなにしてから変換します）";
        runEncode();
      });
  }catch(e){ failDict(); }
}

function requestDict(){
  if(dictState !== "idle") return;
  dictState = "loading";
  const status = dom["dict-status"];
  status.className = "dict-status loading";
  status.textContent = "📖 漢字辞書を読み込み中…（ひらがな・カタカナ・英数字は今すぐ使えます）";
  const script = document.createElement("script");
  script.src = "kuromoji.js";
  script.async = true;
  script.onload = buildTokenizer;
  script.onerror = failDict;
  document.head.appendChild(script);
  dictTimer = setTimeout(function(){
    if(dictState === "loading") failDict();
  }, 15000);
}

requestDict();
