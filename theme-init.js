/* 表示（自動／ライト／ダーク）を、描画の前に <html data-theme> へ当てる。
   CSP で inline script が使えないため別ファイルにし、<head> で同期読み込みする
   （app.js は module で後から動くので、そこで当てると一瞬ちらつく）。
   選択の保存と切り替えは app.js の setTheme が受け持つ。グローバルは作らない。 */
try{
  var t = localStorage.getItem("oshiri-theme");
  if(t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
}catch(e){}
