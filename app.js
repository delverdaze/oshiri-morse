/* おしりモールス UI（DOM・音声・クリップボード・kuromojiロード）
   変換コアは morse.js（window.Morse）、HTML契約は contract.js（window.Contract）。
   本ファイルは IIFE で閉じてグローバルを汚さない（脱グローバル）。
   classic script として contract.js / morse.js の後に読み込むこと。 */
(function () {
  "use strict";

  const Morse = window.Morse;
  const Contract = window.Contract;

  /* ===== DOM 参照を一括取得（依存する要素を1か所に集約） =====
     Contract.REQUIRED_IDS が「app.js が依存する全要素」の単一情報源。
     HTML を編集するときはここ（と contract.js）を見れば依存関係が分かる。 */
  const dom = {};
  for (const id of Contract.REQUIRED_IDS) dom[id] = document.getElementById(id);

  // 起動時フェイルファスト：契約違反（IDの消失/誤記）を手元で即検知する。
  // （CI では dom-contract.test.js が同じ Contract で検証する）
  const missing = Contract.REQUIRED_IDS.filter(id => !dom[id]);
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
    if(Morse.KANJI_RE.test(v) && dictState !== "ready" && dictState !== "failed"){
      requestDict();
      dom["enc-out"].value="";
      dom["enc-yomi"].value="";
      updateXPostCounter("");
      note.className = "note";
      note.textContent = "📖 漢字の読みを準備中…（完了すると自動で変換します）";
      return;
    }
    dom["enc-yomi"].value = Morse.toHiraReading(v);
    const r = Morse.encode(v);
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

  // X は Unicode の範囲ごとに 1 / 2 文字として数える。変換結果には URL が含まれないため、
  // X の公式 twitter-text 設定（v3）の重みをそのまま使う。
  function xCharacterWeight(ch){
    const cp = ch.codePointAt(0);
    return (cp <= 0x10FF ||
      (cp >= 0x2000 && cp <= 0x200D) ||
      (cp >= 0x2010 && cp <= 0x201F) ||
      (cp >= 0x2032 && cp <= 0x2037)) ? 1 : 2;
  }
  function measureXPost(text){
    const normalized = text.normalize("NFC");
    let length = 0, validEnd = 0, i = 0;
    for(const ch of normalized){
      const weight = xCharacterWeight(ch);
      if(length + weight <= Morse.X_POST_LIMIT) validEnd = i + ch.length;
      length += weight;
      i += ch.length;
    }
    return { length, validEnd };
  }
  function updateXPostCounter(text){
    const status = dom["enc-x-status"];
    const preview = dom["enc-x-preview"];
    const previewText = dom["enc-x-preview-text"];
    const measured = measureXPost(text);
    const overflow = measured.length - Morse.X_POST_LIMIT;
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
      status.textContent = "𝕏 投稿：" + measured.length + " / " + Morse.X_POST_LIMIT + " 文字（残り " + (Morse.X_POST_LIMIT - measured.length) + "）";
      preview.hidden = true;
      previewText.replaceChildren();
    }
  }
  function runDecode(){
    const v = dom["dec-in"].value;
    const note = dom["dec-note"];
    if(!v.trim()){ dom["dec-out"].value=""; note.textContent=""; return; }
    const r = Morse.decode(v);
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

  /* ===== 🔊 お尻ペチペチ音エンジン（Web Audio・実録mp3サンプル） ===== */
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
  function teardownAudio(){
    try{ if(typeof stopPlay === "function") stopPlay(); }catch(e){}
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
  let play = { on:false, bus:null, btn:null, timer:null };

  function stopPlay(){
    if(play.timer) clearTimeout(play.timer);
    if(play.bus){ try{ play.bus.disconnect(); }catch(e){} }   // バス切断で以降の音を即停止
    if(play.btn){
      play.btn.classList.remove("playing");
      if(play.btn.dataset.orig) play.btn.innerHTML = play.btn.dataset.orig;
    }
    const peach = dom["peach"];
    peach && peach.classList.remove("wiggle");
    play = { on:false, bus:null, btn:null, timer:null };
  }

  // おしりモールス文字列をモールスのリズムで再生
  async function playOshiri(text, btn){
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
    text = text.replace(Morse.VS_RE, "");   // 貼り付け文字列の異体字セレクタを除去
    let t = ctx.currentTime + 0.06;
    for(const word of text.split("／")){
      for(const u of word.split(/[\s　]+/).filter(Boolean)){
        let i=0;
        while(i<u.length){
          if(u.startsWith(Morse.DASH_N,i)){ hit(ctx,t,DASH_D,"dash",bus); t+=DASH_D+INTRA; i+=Morse.DASH_N.length; }
          else if(u.startsWith(Morse.DOT_N,i)){ hit(ctx,t,DOT_D,"dot",bus); t+=DOT_D+INTRA; i+=Morse.DOT_N.length; }
          else { i++; }
        }
        t += LETTER;
      }
      t += WORD;
    }
    // 再生中UI
    const total = (t - ctx.currentTime) * 1000;
    const peach = dom["peach"];
    if(btn){
      if(!btn.dataset.orig) btn.dataset.orig = btn.innerHTML;
      btn.innerHTML = "⏹ 停止";
      btn.classList.add("playing");
    }
    peach && peach.classList.add("wiggle");
    play = { on:true, bus, btn, timer:null };
    play.timer = setTimeout(stopPlay, total + 150);
  }

  function listen(srcId, btnId){
    const text = dom[srcId].value;
    const btn = dom[btnId];
    if(!text.trim()){ return; }
    if(play.on){                       // 再生中なら一旦停止
      const same = (play.btn === btn);
      stopPlay();
      if(same) return;                 // 同じボタン → 停止のみ（もう一度押すと最初から）
    }
    playOshiri(text, btn);             // 別ボタン or 停止状態 → 最初から再生
  }

  /* ===== 💥 ビジュアル演出（ペチッ！） ===== */
  function puffAt(x, y, n){
    const emojis = ["💥","✋","👋","🍑"];
    for(let k=0;k<(n||1);k++){
      const el = document.createElement("span");
      el.className = "puff";
      el.textContent = emojis[Math.floor(Math.random()*emojis.length)];
      el.style.left = (x + (Math.random()*30-15)) + "px";
      el.style.top  = (y + (Math.random()*10-5)) + "px";
      el.style.setProperty("--dx", (Math.random()*70-35)+"px");
      el.style.setProperty("--rot", (Math.random()*60-30)+"deg");
      el.style.animation = "puffRise " + (0.9+Math.random()*0.5) + "s ease-out forwards";
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), 1600);
    }
  }
  function puffFrom(target, n){
    if(!target) return;
    const r = target.getBoundingClientRect();
    puffAt(r.left + r.width*0.5, r.top + r.height*0.4, n);
  }
  let lastPuff = 0;
  function puffThrottled(target){
    const now = Date.now();
    if(now - lastPuff < 550) return;   // 連打しても出すぎない
    lastPuff = now;
    puffFrom(target, 1);
  }
  let lastPoke = 0;
  // 🍑 をつつくと震えて、ペチッ＋「ﾌﾟﾘｯ」を1発（たまにバチーン）
  async function poke(target){
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
    "poke":          el => poke(el),
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
  // 復帰後は次の再生操作（ユーザー操作）で getCtx() が新しいコンテキストを作り直す。
  document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState === "hidden") teardownAudio(); });
  window.addEventListener("pagehide", teardownAudio);

  /* ---- 漢字辞書（kuromoji）のロード：ページ表示後に非同期で取得 ----
     辞書の状態（dictState/dictTimer）は UI 側の都合なので app.js が所有する。
     ロード完了時に Morse.setTokenizer() で変換コアへ tokenizer を注入する。 */
  let dictState = "idle";
  let dictTimer = null;

  function failDict(){
    const status = dom["dict-status"];
    if(dictTimer) clearTimeout(dictTimer);
    dictState = "failed";
    status.className = "dict-status fail";
    if (window.location.protocol === "file:") {
      status.textContent = "⚠️ 漢字辞書を読み込めませんでした（file:// スキームのCORS制限のため。ローカルサーバーを起動するか、ひらがな・カタカナ・英数字で入力してください）";
    } else {
      status.textContent = "⚠️ 漢字辞書を読み込めませんでした（ひらがな・カタカナ・英数字は利用できます）";
    }
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
          Morse.setTokenizer(tk);   // 変換コアへ注入
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

  // ユーザーが初めて画面に触れた際、音源のデコードだけ先に始めておく（再生時の待ちを減らす）。
  // decodeAudioData は suspended のままでも動くため、ここでは resume しない。
  // 実際の出力アンロックは、再生操作（委譲ハンドラ）内の unlockKick が担う。
  function preloadAudio() {
    getCtx();   // AudioContext生成 → loadSamples() で音源デコード開始
    window.removeEventListener("touchstart", preloadAudio);
    window.removeEventListener("click", preloadAudio);
  }
  window.addEventListener("touchstart", preloadAudio, { passive: true });
  window.addEventListener("click", preloadAudio, { passive: true });
})();
