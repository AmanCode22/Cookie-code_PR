/**
 * Контроллер slash-команд: слушает ввод в поле, детектит "/" токен,
 * показывает меню и по выбору заменяет только токен "/plan" на промпт
 * (остальной текст сохраняется).
 */

const { detectTrigger } = require('./detect');
const { searchCommands, findCommand, descOf } = require('./registry');
const { t } = require('../../i18n/i18n');
const menu = require('./menu');

/** Текущий активный токен (span в поле). */
let activeHit = null;
/** Флаг: открыто ли меню сейчас. */
let menuOpen = false;
/** Текущий список элементов меню (для навигации). */
let currentItems = [];

/**
 * Обработчик события input/keyup/click на поле.
 * @param {Event} e
 */
function onFieldUpdate(e) {
  const field = e.target;
  if (!isTrackedField(field)) return;
  update(e);
}

/**
 * Пересчитывает токен и управляет меню.
 * @param {Event} e
 */
function update(e) {
  const field = e.target;
  const caret = getCaret(field);
  if (caret === null) return;

  const draft = getValue(field);
  const hit = detectTrigger(draft, caret);

  if (!hit) {
    activeHit = null;
    if (menuOpen) closeMenu();
    return;
  }

  const candidates = searchCommands(hit.query).map((c) => ({
    name: c.name,
    description: descOf(c, t),
  }));
  if (candidates.length === 0) {
    activeHit = null;
    if (menuOpen) closeMenu();
    return;
  }

  activeHit = { hit, field };
  currentItems = candidates;

  menu.show(candidates, field, (idx) => pick(idx));
  menuOpen = true;

  // меню позиционируем после рендера
  requestAnimationFrame(() => menu.position(field));
}

/**
 * Обработчик keydown: навигация и выбор.
 * @param {KeyboardEvent} e
 * @returns {boolean} true, если событие обработано (нужен preventDefault)
 */
function onKeyDown(e) {
  if (!menuOpen || !activeHit) return false;

  switch (e.key) {
    case 'ArrowDown':
      move(1);
      return true;
    case 'ArrowUp':
      move(-1);
      return true;
    case 'Enter':
    case 'Tab':
      pick(menu.getState().highlight);
      return true;
    case 'Escape':
      closeMenu();
      return true;
    default:
      return false;
  }
}

/**
 * Перемещает подсветку по списку.
 * @param {number} dir
 */
function move(dir) {
  const st = menu.getState();
  const count = st.items.length;
  if (count === 0) return;
  const next = (st.highlight + dir + count) % count;
  menu.highlightItem(next);
}

/**
 * Выбирает элемент по индексу и вставляет промпт.
 * @param {number} idx
 */
function pick(idx) {
  if (!activeHit) return;
  const { hit, field } = activeHit;
  const item = currentItems[idx];
  if (!item) return;

  const cmd = findCommand(item.name);
  if (!cmd) return;

  const replacement = cmd.prompt;
  const draft = getValue(field);
  // Заменяем ТОЛЬКО токен "/name" (от span.start до текущего caret)
  const caret = getCaret(field);
  const before = draft.slice(0, hit.span.start);
  const after = draft.slice(caret === null ? hit.span.end : caret);
  const next = before + replacement + after;

  setValue(field, next);

  // Устанавливаем курсор после вставленного промпта
  const pos = before.length + replacement.length;
  setCaret(field, pos);

  closeMenu();
  activeHit = null;
}

/** Закрывает меню. */
function closeMenu() {
  menu.hide();
  menuOpen = false;
  currentItems = [];
}

/**
 * Подключает обработчики к полю ввода.
 * @param {Element} field
 */
function attachField(field) {
  if (!field || field.__cuckooCmdBound) return;
  field.__cuckooCmdBound = true;

  field.addEventListener('input', onFieldUpdate);
  field.addEventListener('keyup', onFieldUpdate);
  field.addEventListener('click', onFieldUpdate);
  field.addEventListener('keydown', (e) => {
    const handled = onKeyDown(e);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  field.addEventListener('blur', () => {
    // небольшая задержка, чтобы mousedown по пункту успел сработать
    setTimeout(() => {
      if (menuOpen) closeMenu();
    }, 120);
  });
}

// ==================== helpers ====================

function isTrackedField(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return true;
  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true;
  return false;
}

function getValue(field) {
  if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') return field.value || '';
  return field.textContent || '';
}

function setValue(field, value) {
  if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
    const proto = field.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    nativeSetter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    // contenteditable
    field.textContent = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function getCaret(field) {
  if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
    return typeof field.selectionStart === 'number' ? field.selectionStart : null;
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!field.contains(range.endContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(field);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setCaret(field, pos) {
  if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
    try { field.setSelectionRange(pos, pos); } catch (_) {}
    return;
  }
  // contenteditable — приблизительно: ставим в конец
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(field);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

module.exports = {
  attachField,
  closeMenu,
  onKeyDown,
  update,
  get activeHit() { return activeHit; },
  get menuOpen() { return menuOpen; },
};
