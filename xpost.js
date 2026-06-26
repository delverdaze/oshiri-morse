/* 𝕏（旧Twitter）投稿の文字数カウント（純粋ロジック・ES Module）
   DOM非依存。X の公式 twitter-text 設定（v3）の重み付けに準拠する。
   変換結果には URL が含まれないため、URL の特別扱いは不要。 */

export const X_POST_LIMIT = 280;

// 1文字の重み（1 または 2）。CJK や絵文字は 2、ラテン・記号類は 1。
export function xCharacterWeight(ch){
  const cp = ch.codePointAt(0);
  return (cp <= 0x10FF ||
    (cp >= 0x2000 && cp <= 0x200D) ||
    (cp >= 0x2010 && cp <= 0x201F) ||
    (cp >= 0x2032 && cp <= 0x2037)) ? 1 : 2;
}

// 文字列の総重み（length）と、上限内に収まる末尾位置（validEnd）を返す。
// validEnd は「ここまでなら投稿できる」境界（コード単位インデックス）。
export function measureXPost(text){
  const normalized = text.normalize("NFC");
  let length = 0, validEnd = 0, i = 0;
  for(const ch of normalized){
    const weight = xCharacterWeight(ch);
    if(length + weight <= X_POST_LIMIT) validEnd = i + ch.length;
    length += weight;
    i += ch.length;
  }
  return { length, validEnd };
}
