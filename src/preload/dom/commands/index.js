/**
 * Точка входа модуля slash-команд Cookie Code.
 * Ищет поле ввода сообщения и подключает контроллер автодополнения.
 *
 * Поле ввода может появляться/исчезать при SPA-навигации и смене сессии,
 * поэтому работает лёгкий периодический поиск + MutationObserver.
 */

const controller = require('./controller');
const chatInput = require('../chat-input');

let observer = null;
let scanTimer = null;
let lastField = null;

/**
 * Пытается найти поле ввода и подключить к нему контроллер.
 */
function bindCurrentField() {
  let field = null;
  try {
    field = chatInput.findInputArea();
  } catch (_) {
    field = null;
  }
  if (!field) return;
  if (field === lastField && field.__cuckooCmdBound) return;
  lastField = field;
  controller.attachField(field);
}

/**
 * Запускает наблюдение за DOM: при любых изменениях пробуем найти поле.
 */
function startWatching() {
  // MutationObserver — реагируем на появление поля
  try {
    observer = new MutationObserver(() => {
      bindCurrentField();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // Периодическая подстраховка (SPA-переходы, смена сессии)
  scanTimer = setInterval(bindCurrentField, 2000);

  // Первичная попытка
  bindCurrentField();
}

/** Останавливает наблюдение (для корректного teardown). */
function stop() {
  if (observer) {
    try { observer.disconnect(); } catch (_) {}
    observer = null;
  }
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}

/** Совместимо с init(): запуск модуля команд. */
function start() {
  startWatching();
}

module.exports = {
  start,
  stop,
  bindCurrentField,
};
