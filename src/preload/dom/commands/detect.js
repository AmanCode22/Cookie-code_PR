/**
 * 纯函数核心：在光标处检测 slash 令牌（"/" 开头）。
 * 不依赖 React / DOM，仅操作字符串，便于单测。
 *
 * 规则：
 *  - "/" 只在「行首 / 空白之后 / 标点之后」才算触发符（词边界）。
 *  - 从光标向左扫描，遇到空白即停止；扫描到的 "/" 若不满足词边界则视为普通字符继续。
 *  - URL 例外：":/"（协议分隔符，如 https:/）与 "//" 都不触发。
 */

const WORD_CHAR = /[\p{L}\p{N}_]/u;
const WHITESPACE = /\s/u;

/**
 * 判断 index 处的触发符是否满足词边界。
 * @param {string} draft - 完整文本
 * @param {number} index - 触发符位置
 * @param {string} char - 触发符本身（此处恒为 "/"）
 * @returns {boolean}
 */
function boundaryOk(draft, index, char) {
  if (index === 0) return true;
  const prev = draft.charAt(index - 1);
  if (WHITESPACE.test(prev)) return true;
  if (WORD_CHAR.test(prev)) return false;
  if (char === '/') {
    if (prev === '/') return false;
    if (prev === ':' && index >= 2 && !WHITESPACE.test(draft.charAt(index - 2))) return false;
  }
  return true;
}

/**
 * 判断 index 处的 "/" 是否与下一个字符组成 "//"。
 * @param {string} draft
 * @param {number} index - 位置
 * @returns {boolean}
 */
function isDoubleSlash(draft, index) {
  return draft.charAt(index + 1) === '/';
}

/**
 * 在 draft 的 caret 处检测 slash 令牌。
 * @param {string} draft - 完整文本
 * @param {number} caret - 光标偏移
 * @returns {{trigger: string, query: string, span: {start: number, end: number}} | null}
 *   null 表示光标处没有活跃的 slash 令牌。
 */
function detectTrigger(draft, caret) {
  if (typeof draft !== 'string' || typeof caret !== 'number') return null;
  if (caret <= 0 || caret > draft.length) return null;

  for (let i = caret - 1; i >= 0; i--) {
    const ch = draft.charAt(i);
    if (WHITESPACE.test(ch)) return null;
    if (ch !== '/') continue;
    if (!boundaryOk(draft, i, ch)) continue;
    if (isDoubleSlash(draft, i)) continue;
    return {
      trigger: ch,
      query: draft.slice(i + 1, caret),
      span: { start: i, end: caret },
    };
  }
  return null;
}

module.exports = {
  boundaryOk,
  isDoubleSlash,
  detectTrigger,
};
