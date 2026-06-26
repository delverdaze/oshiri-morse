/* おしりモールス HTML↔JS↔CSS 契約の「単一情報源」
   ブラウザ(window.Contract)とNode(CommonJS)の両対応。
   app.js（実行時の参照・起動時チェック）とテスト（CI）が同じ定義を見るため、
   実装・テスト・ドキュメントがズレない。リデザインでマークアップを書き換える際は、
   ここに挙げた ID・data-action・クラスを保てばロジックとCSSはそのまま動く。 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;          // Node（テスト）
  } else {
    root.Contract = api;           // ブラウザ
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* app.js が getElementById で参照する必須の要素ID。
     起動時にこの一覧で存在チェック（fail-fast）も行う。 */
  const REQUIRED_IDS = [
    "peach",
    "tab-enc", "tab-dec",
    "panel-enc", "panel-dec",
    "dict-status",
    "enc-in", "enc-yomi", "enc-out", "enc-note",
    "enc-x-status", "enc-x-preview", "enc-x-preview-text",
    "enc-listen",
    "dec-in", "dec-out", "dec-note",
    "dec-listen",
    "credits-modal",
  ];

  /* クリック操作の data-action と、それぞれが必要とする補助属性。
     "id" は「要素自身に id 属性が必要」を表す（listen は btnId に el.id を使う）。 */
  const ACTION_ATTRS = {
    "poke":          [],
    "mode":          ["data-mode"],
    "sample":        ["data-text"],
    "copy":          ["data-target", "data-note"],
    "listen":        ["data-target", "id"],
    "clear":         ["data-mode"],
    "credits-open":  [],
    "credits-close": [],
  };

  /* app.js が動的に付け外しするクラス。CSS 側に対応するスタイルが必要。
     消えても JS はエラーを出さず見た目だけ静かに壊れるため、テストで存在を担保する。 */
  const STATE_CLASSES = [
    "active",     // .tab.active（選択中タブ）
    "ok",         // .note.ok（成功メッセージ）
    "over",       // .x-post-status.over（文字数オーバー）
    "overflow",   // .x-post-preview .overflow（超過文字の強調）
    "playing",    // .btn-listen.playing（再生中）
    "wiggle",     // .peachicon.wiggle（揺れ）
    "puff",       // .puff（ペチッ！演出）
    "open",       // .modal-overlay.open（モーダル表示）
    "loading",    // .dict-status.loading
    "ready",      // .dict-status.ready
    "fail",       // .dict-status.fail
  ];

  return { REQUIRED_IDS, ACTION_ATTRS, STATE_CLASSES };
});
