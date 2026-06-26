/* 💥 ビジュアル演出（ペチッ！）（ES Module）
   要素から絵文字を飛び散らせる小さな演出。app.js（変換時・コピー時）と
   audio.js（🍑つつき）の双方から使う。CSS の .puff / @keyframes puffRise に依存。 */

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

export function puffFrom(target, n){
  if(!target) return;
  const r = target.getBoundingClientRect();
  puffAt(r.left + r.width*0.5, r.top + r.height*0.4, n);
}

let lastPuff = 0;
export function puffThrottled(target){
  const now = Date.now();
  if(now - lastPuff < 550) return;   // 連打しても出すぎない
  lastPuff = now;
  puffFrom(target, 1);
}
