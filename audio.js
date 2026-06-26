/* 🔊 お尻ペチペチ音エンジン（Web Audio・実録mp3サンプル・ES Module）
   morse.js の記号定数と effects.js の演出に依存。DOM要素（btn/peach）は引数で受け取り、
   特定IDへの直接依存を持たない。iOS Safari 対策のロジックは従来どおり（挙動不変）。 */
import { DASH_N, DOT_N, VS_RE } from "./morse.js";
import { puffFrom } from "./effects.js";

let audioCtx = null;
let audioGeneration = 0;
function getCtx(){
  if(!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    loadSamples(audioCtx, audioGeneration);
  }
  return audioCtx;
}
function isCurrentCtx(ctx, generation){
  return audioCtx === ctx && audioGeneration === generation && ctx.state !== "closed";
}
// バックグラウンド復帰後など、AudioContextが止まっていたら再開する。
// iOSでは "suspended" ではなく "interrupted" になることがあるため、running 以外を対象にする。
function resumeAudio(ctx){
  if(!ctx || ctx !== audioCtx || ctx.state === "closed") return Promise.resolve(false);
  if(ctx.state === "running") return Promise.resolve(true);
  return ctx.resume()
    .then(()=>ctx === audioCtx && ctx.state === "running")
    .catch(()=>false);
}
// iOS Safari は resume() だけでは音が出ない（state は running になるのに無音）。
// ユーザー操作中（await より前・同期的）に無音バッファを start() して、
// 出力経路を確実にアンロックする。新規/復帰したコンテキストの初回発音に必須。
function unlockKick(ctx){
  try{
    ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
  }catch(e){}
}
// iOS Safari ではバックグラウンド復帰後、resume() で state は "running" に戻っても
// 実際には音が出なくなる（リロードで直る）。そこでコンテキストごと破棄し、
// 次の再生（ユーザー操作）で作り直す。マスター・サンプルも作り直す必要があるため null に戻す。
export function teardownAudio(){
  try{ stopPlay(); }catch(e){}
  const ctx = audioCtx;
  audioGeneration++;
  audioCtx = null;
  master = null;
  masterCtx = null;
  whipBuffer = null;
  popBuffer = null;
  samplesPromise = null;
  if(ctx){ try{ void ctx.close().catch(()=>{}); }catch(e){} }
}
// マスター：コンプ＋ゲイン（パンチを保ちつつ歪みすぎを防ぐ）
let master = null;
let masterCtx = null;
function getMaster(ctx){
  if(masterCtx !== ctx){
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 6;
    comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.12;
    const mg = ctx.createGain(); mg.gain.value = 1.0;
    comp.connect(mg); mg.connect(ctx.destination);
    master = comp;
    masterCtx = ctx;
  }
  return master;
}
// 実録サンプル（いずれも Pixabay: Universfield）
//   whip = ﾊﾟｧｰﾝ（鞭のしなる破裂音）、pop = ﾌﾟﾘ（バブルポップ）
let whipBuffer = null, popBuffer = null;
const WHIP_OFFSET = 0.20;   // ﾊﾟｧｰﾝ：頭の無音をスキップ
const POP_OFFSET  = 0.10;   // ﾌﾟﾘ：頭の無音をスキップ
let samplesPromise = null;

function loadSamples(ctx, generation){
  if (samplesPromise) return samplesPromise;
  async function load(url, set){
    try{
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      if(!isCurrentCtx(ctx, generation)) return;
      const audioBuf = await ctx.decodeAudioData(buf);
      if(isCurrentCtx(ctx, generation)) set(audioBuf);
    }catch(e){}   // 読み込めなかった音源は再生しない
  }
  samplesPromise = (async () => {
    const promises = [];
    promises.push(load("assets/whip.mp3", b => { whipBuffer = b; }));
    promises.push(load("assets/pop.mp3",  b => { popBuffer  = b; }));
    await Promise.all(promises).catch(()=>{});
  })();
  return samplesPromise;
}
// お尻を叩く音を時刻 t に鳴らす
//   "dot"=ﾌﾟﾘ → かわいく「ちょん♡」と触れる音
//   "dash"=ﾊﾟｧｰﾝ → 思いっきり叩く破裂音「バチーン！」
function hit(ctx, t, dur, type, out){
  const dest = out || getMaster(ctx);

  if(type === "dash"){
    // 実録サンプルがあれば、それを再生（頭の無音を飛ばし、毎回少し揺らす）
    if(whipBuffer){
      const src = ctx.createBufferSource();
      src.buffer = whipBuffer;
      src.playbackRate.value = 0.96 + Math.random()*0.12;
      const g = ctx.createGain();
      g.gain.value = 0.85 + Math.random()*0.25;
      src.connect(g); g.connect(dest);
      src.start(t, WHIP_OFFSET);
      src.stop(t + 0.8);
    }
  } else {
    // 実録サンプルがあれば、それを再生（ﾌﾟﾘ：頭の無音を飛ばし、毎回少し揺らす）
    if(popBuffer){
      const src = ctx.createBufferSource();
      src.buffer = popBuffer;
      src.playbackRate.value = 0.95 + Math.random()*0.14;
      const g = ctx.createGain();
      g.gain.value = 0.8 + Math.random()*0.25;
      src.connect(g); g.connect(dest);
      src.start(t, POP_OFFSET);
      src.stop(t + 0.5);
    }
  }
}

// 再生セッション状態（重複再生を防ぎ、停止できるようにする）
// peach は停止時に wiggle を外すため保持する（特定IDに依存しない）。
let play = { on:false, bus:null, btn:null, peach:null, timer:null };

export function isPlaying(){ return play.on; }
export function currentBtn(){ return play.btn; }

export function stopPlay(){
  if(play.timer) clearTimeout(play.timer);
  if(play.bus){ try{ play.bus.disconnect(); }catch(e){} }   // バス切断で以降の音を即停止
  if(play.btn){
    play.btn.classList.remove("playing");
    if(play.btn.dataset.orig) play.btn.innerHTML = play.btn.dataset.orig;
  }
  if(play.peach) play.peach.classList.remove("wiggle");
  play = { on:false, bus:null, btn:null, peach:null, timer:null };
}

// おしりモールス文字列をモールスのリズムで再生
export async function playOshiri(text, btn, peach){
  if(!text.trim()) return;
  const ctx = getCtx();
  const generation = audioGeneration;
  unlockKick(ctx);   // ジェスチャー内で出力をアンロック（await より前に同期実行）
  if(!await resumeAudio(ctx) || !isCurrentCtx(ctx, generation)) return;
  const loading = samplesPromise;
  if(loading) await loading; // 音源ロード完了を待つ
  if(!isCurrentCtx(ctx, generation) || ctx.state !== "running") return;
  const bus = ctx.createGain(); bus.connect(getMaster(ctx));   // このセッション専用の出力バス
  const DOT_D=0.12, DASH_D=0.34, INTRA=0.06, LETTER=0.26, WORD=0.6;
  text = text.replace(VS_RE, "");   // 貼り付け文字列の異体字セレクタを除去
  let t = ctx.currentTime + 0.06;
  for(const word of text.split("／")){
    for(const u of word.split(/[\s　]+/).filter(Boolean)){
      let i=0;
      while(i<u.length){
        if(u.startsWith(DASH_N,i)){ hit(ctx,t,DASH_D,"dash",bus); t+=DASH_D+INTRA; i+=DASH_N.length; }
        else if(u.startsWith(DOT_N,i)){ hit(ctx,t,DOT_D,"dot",bus); t+=DOT_D+INTRA; i+=DOT_N.length; }
        else { i++; }
      }
      t += LETTER;
    }
    t += WORD;
  }
  // 再生中UI
  const total = (t - ctx.currentTime) * 1000;
  if(btn){
    if(!btn.dataset.orig) btn.dataset.orig = btn.innerHTML;
    btn.innerHTML = "⏹ 停止";
    btn.classList.add("playing");
  }
  if(peach) peach.classList.add("wiggle");
  play = { on:true, bus, btn, peach, timer:null };
  play.timer = setTimeout(stopPlay, total + 150);
}

let lastPoke = 0;
// 🍑 をつつくと震えて、ペチッ＋「ﾌﾟﾘｯ」を1発（たまにバチーン）
export async function poke(target){
  const now = Date.now();
  if(now - lastPoke < 100) return;   // 100ms以内の連打は無視
  lastPoke = now;
  const ctx = getCtx();
  const generation = audioGeneration;
  unlockKick(ctx);   // ジェスチャー内で出力をアンロック（await より前に同期実行）
  if(!await resumeAudio(ctx) || !isCurrentCtx(ctx, generation)) return;
  const loading = samplesPromise;
  if(loading) await loading;
  if(!isCurrentCtx(ctx, generation) || ctx.state !== "running") return;
  target.classList.remove("wiggle"); void target.offsetWidth; target.classList.add("wiggle");
  puffFrom(target, 2);
  hit(ctx, ctx.currentTime+0.02, Math.random()<0.2?0.34:0.12, Math.random()<0.2?"dash":"dot");
}

// ユーザーが初めて画面に触れた際、音源のデコードだけ先に始めておく（再生時の待ちを減らす）。
// decodeAudioData は suspended のままでも動くため、ここでは resume しない。
// 実際の出力アンロックは、再生操作（委譲ハンドラ）内の unlockKick が担う。
export function preloadAudio() {
  getCtx();   // AudioContext生成 → loadSamples() で音源デコード開始
  window.removeEventListener("touchstart", preloadAudio);
  window.removeEventListener("click", preloadAudio);
}
