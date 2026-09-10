/**
 * Индикатор мета-информации под ответом AI:
 *   ⏱ 9.2s · ~308 tok
 *
 * Время измеряется локально (от появления нового AI-сообщения до его завершения).
 * Токены — грубая оценка: длина текста / 4.
 * Данные сохраняются в localStorage (переживают Ctrl+R).
 */

const META_CLASS = 'cuckoo-response-meta';
const ATTR_MARKED = 'data-cuckoo-meta-marked';
const STORAGE_KEY = 'cuckoo-response-meta';

// Активные замеры: messageEl -> { start }
const activeTimers = new WeakMap();

/**
 * Стабильный ключ сообщения между перезагрузками (текст + длина).
 */
function getMessageKey(messageEl) {
  try {
    const md = messageEl.querySelector('.ds-markdown');
    if (!md) return null;
    const norm = String(md.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    return norm + '|' + norm.length;
  } catch (_) {
    return null;
  }
}

function readMetaStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function writeMetaStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_) {}
}

/**
 * Запустить замер для нового AI-сообщения (если ещё не замерялось).
 */
function startTimer(messageEl) {
  if (!messageEl) return;
  if (activeTimers.has(messageEl)) return;
  activeTimers.set(messageEl, { start: performance.now() });
}

/**
 * Отрисовать мета-панель.
 */
function renderMetaPanel(messageEl, seconds, tokensEstimate) {
  if (!messageEl) return;
  if (messageEl.getAttribute(ATTR_MARKED) === '1') return;
  const markdown = messageEl.querySelector('.ds-markdown');
  const anchor = markdown || messageEl;
  if (!anchor.parentElement) return;
  if (messageEl.querySelector('.' + META_CLASS)) {
    messageEl.setAttribute(ATTR_MARKED, '1');
    return;
  }

  const meta = document.createElement('div');
  meta.className = META_CLASS;
  meta.innerHTML =
    '<span class="cuckoo-response-meta-item" title="Время ответа">' +
    '  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '    <circle cx="8" cy="8" r="6.375" stroke="currentColor" stroke-width="1.25"/>' +
    '    <path d="M8 4.4V8.3L10.7 9.85" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>' +
    '  </svg>' +
    '  <span>' + seconds + 's</span>' +
    '</span>' +
    '<span class="cuckoo-response-meta-sep">·</span>' +
    '<span class="cuckoo-response-meta-item" title="Оценка количества токенов (chars / 4)">' +
    '  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '    <path d="M2.25 7.95A5.75 2.4 0 0 0 13.75 7.95" stroke="currentColor" stroke-width="1.25"/>' +
    '    <path d="M8 13.5V14.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>' +
    '  </svg>' +
    '  <span>~' + tokensEstimate + ' tok</span>' +
    '</span>';

  anchor.parentElement.insertBefore(meta, anchor.nextSibling);
  messageEl.setAttribute(ATTR_MARKED, '1');
}

/**
 * Завершить замер и отрисовать мету.
 */
function finishTimer(messageEl) {
  if (!messageEl) return;
  if (messageEl.getAttribute(ATTR_MARKED) === '1') return;

  const rec = activeTimers.get(messageEl);
  const elapsedMs = rec ? (performance.now() - rec.start) : 0;
  activeTimers.delete(messageEl);

  const markdown = messageEl.querySelector('.ds-markdown');
  const text = markdown ? (markdown.textContent || '') : '';
  const tokensEstimate = Math.max(0, Math.round(text.length / 4));
  const seconds = (elapsedMs / 1000).toFixed(1);

  renderMetaPanel(messageEl, seconds, tokensEstimate);

  // Сохраняем — переживёт Ctrl+R
  try {
    const key = getMessageKey(messageEl);
    if (key) {
      const store = readMetaStore();
      store[key] = { seconds: parseFloat(seconds), tokens: tokensEstimate };
      writeMetaStore(store);
    }
  } catch (_) {}
}

/**
 * Проверить, что элемент — это AI-сообщение (не user).
 */
function isAIMessage(el) {
  if (!el || !el.classList) return false;
  if (!el.classList.contains('ds-message')) return false;
  if (el.classList.contains('d29f3d7d')) return false;
  return true;
}

/**
 * Найти последнее AI-сообщение.
 */
function findLatestAIMessage() {
  const all = document.querySelectorAll('.ds-message');
  for (let i = all.length - 1; i >= 0; i--) {
    if (isAIMessage(all[i])) return all[i];
  }
  return null;
}

/**
 * Восстановить мета-панели из localStorage (после reload).
 */
function restoreFromStorage() {
  const store = readMetaStore();
  if (!store || Object.keys(store).length === 0) return;
  const all = document.querySelectorAll('.ds-message');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (!isAIMessage(el)) continue;
    if (el.getAttribute(ATTR_MARKED) === '1') continue;
    const key = getMessageKey(el);
    if (!key) continue;
    const rec = store[key];
    if (!rec) continue;
    try {
      renderMetaPanel(el, rec.seconds, rec.tokens);
    } catch (_) {}
  }
}

/**
 * Watcher: стартуем таймеры для новых сообщений + восстанавливаем старые из storage.
 */
let watchStarted = false;
function startWatch() {
  if (watchStarted) return;
  watchStarted = true;
  window.__cuckooMetaWatchStarted = true;

  const run = () => {
    try {
      restoreFromStorage();
      const all = document.querySelectorAll('.ds-message');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (!isAIMessage(el)) continue;
        if (el.getAttribute(ATTR_MARKED) === '1') continue;
        if (activeTimers.has(el)) continue;
        if (!el.querySelector('.ds-markdown')) continue;
        startTimer(el);
      }
    } catch (_) {}
  };

  if (document.body) {
    const mo = new MutationObserver(run);
    mo.observe(document.body, { childList: true, subtree: true });
    run();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      const mo = new MutationObserver(run);
      mo.observe(document.body, { childList: true, subtree: true });
      run();
    }, { once: true });
  }
  setInterval(run, 500);
  console.log('[meta] watch started (mutation + poll)');
}

/**
 * Очистить сохранённые мета-данные.
 */
function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[Cookie Code] Мета-данные очищены');
  } catch (err) {
    console.error('[Cookie Code] Не удалось очистить мета-данные:', err.message);
  }
}

module.exports = { startTimer, finishTimer, findLatestAIMessage, isAIMessage, startWatch, clearStorage };
