/**
 * Внедрение вкладки «Cuckoo Code» в настройки DeepSeek.
 * Кнопка в левой панели вкладок + свой контент в правой области.
 *
 * Структура модалки настроек DeepSeek:
 *   .ds-modal-focus-lock
 *     .ds-modal-content
 *       .ds-modal-content__main
 *         .f2ff50b5                       ← контейнер правой панели
 *           .ds-scroll-area               ← скроллируемая область с контентом вкладки
 *             .ds-scroll-area__content    ← сам контент
 *
 * Левая панель вкладок:
 *   .d316d158                             ← контейнер кнопок вкладок
 */

const TAB_BUTTON_ID = 'cuckoo-settings-tab-btn';
const TAB_CONTENT_ID = 'cuckoo-settings-content';

const CUCKOO_TAB_BUTTON_SELECTOR = '.d316d158';
const MODAL_CONTENT_MAIN_SELECTOR = '.ds-modal-content__main';
const RIGHT_PANEL_WRAPPER_SELECTOR = '.f2ff50b5';
const NATIVE_SCROLL_AREA_SELECTOR = '.ds-scroll-area';

/**
 * Открыть вкладку Cuckoo Code — скрыть родной контент и показать наш.
 */
function activateCuckooTab() {
  const nativeScroll = document.querySelector(
    MODAL_CONTENT_MAIN_SELECTOR + ' ' + RIGHT_PANEL_WRAPPER_SELECTOR + ' ' + NATIVE_SCROLL_AREA_SELECTOR
  );
  const wrapper = document.querySelector(
    MODAL_CONTENT_MAIN_SELECTOR + ' ' + RIGHT_PANEL_WRAPPER_SELECTOR
  );
  if (!wrapper) return;

  // Скрываем родной контент
  if (nativeScroll) nativeScroll.style.display = 'none';

  // Вставляем свой блок, если его ещё нет
  let ourContent = document.getElementById(TAB_CONTENT_ID);
  if (!ourContent) {
    ourContent = document.createElement('div');
    ourContent.id = TAB_CONTENT_ID;
    ourContent.style.cssText =
      'display: flex; flex-direction: column; gap: 16px; ' +
      'width: 100%; height: 100%; overflow-y: auto; ' +
      'padding: 20px 24px; box-sizing: border-box; ' +
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; ' +
      'color: #dde1ff;';

    ourContent.innerHTML =
      '<div style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">Cuckoo Code</div>' +
      '<div style="color: #8a90b8; font-size: 13px; line-height: 1.6;">' +
      '  Здесь будут настройки Cuckoo Code (проект, MCP, задержка отправки и т.д.).' +
      '</div>';

    wrapper.appendChild(ourContent);
  }
  ourContent.style.display = '';
}

/**
 * Деактивировать вкладку Cuckoo Code — показать родной контент.
 */
function deactivateCuckooTab() {
  const nativeScroll = document.querySelector(
    MODAL_CONTENT_MAIN_SELECTOR + ' ' + RIGHT_PANEL_WRAPPER_SELECTOR + ' ' + NATIVE_SCROLL_AREA_SELECTOR
  );
  if (nativeScroll) nativeScroll.style.display = '';

  const ourContent = document.getElementById(TAB_CONTENT_ID);
  if (ourContent) ourContent.remove();
}

// Делегирование клика: ловим клики по вкладкам (наши и родные).
document.addEventListener(
  'click',
  (e) => {
    const target = e.target;
    if (!target || !target.closest) return;

    // Наш таб
    const ourBtn = target.closest('#' + TAB_BUTTON_ID);
    if (ourBtn) {
      e.preventDefault();
      e.stopPropagation();
      activateCuckooTab();
      return;
    }

    // Клик по родному табу — деактивируем наш контент
    const nativeTabContainer = target.closest(CUCKOO_TAB_BUTTON_SELECTOR);
    if (nativeTabContainer) {
      deactivateCuckooTab();
    }
  },
  true // capture
);

/**
 * Вставить кнопку-таб в левую панель, если её ещё нет.
 */
function injectSettingsTab() {
  const container = document.querySelector(CUCKOO_TAB_BUTTON_SELECTOR);
  if (!container) return;
  if (container.querySelector('#' + TAB_BUTTON_ID)) return; // уже вставлено

  const btn = document.createElement('div');
  btn.id = TAB_BUTTON_ID;
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.className = 'ds-button ds-button--outlinedNeutral ds-button--borderless ds-button--capsule ds-button--m ds-button--icon-relative-m ds-button--min-width';
  btn.style.cssText = '--dsl-button-text-color: var(--dsw-alias-label-primary);' +
    '--dsl-button-padding: 0 10px 0 8px;' +
    '--dsl-button-border-radius: 12px;' +
    '--dsl-button-icon-gap: 8px;' +
    '--dsl-button-color-hover: var(--dsw-alias-interactive-bg-hover);' +
    '--dsl-button-text-color-hover: var(--dsw-alias-label-primary);';

  btn.innerHTML =
    '<div class="ds-button__background"></div>' +
    '<div class="ds-button__icon">' +
    '  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '    <path d="M8 1.5C4.41 1.5 1.5 4.41 1.5 8C1.5 11.59 4.41 14.5 8 14.5C11.59 14.5 14.5 11.59 14.5 8C14.5 4.41 11.59 1.5 8 1.5ZM8 13C5.24 13 3 10.76 3 8C3 5.24 5.24 3 8 3C10.76 3 13 5.24 13 8C13 10.76 10.76 13 8 13Z" fill="currentColor"/>' +
    '    <circle cx="8" cy="8" r="2.4" fill="currentColor"/>' +
    '  </svg>' +
    '</div>' +
    '<span class="ds-button__content">Cuckoo Code</span>';

  container.appendChild(btn);
}

/**
 * Если модалка настроек закрылась — удалить наш контент из DOM.
 * (Регулярная проверка: если нет .d316d158, значит настройки закрыты.)
 */
function cleanupIfModalClosed() {
  const tabContainer = document.querySelector(CUCKOO_TAB_BUTTON_SELECTOR);
  if (!tabContainer) {
    const ourContent = document.getElementById(TAB_CONTENT_ID);
    if (ourContent) ourContent.remove();
  }
}

function start() {
  injectSettingsTab();
  cleanupIfModalClosed();
  setInterval(() => {
    injectSettingsTab();
    cleanupIfModalClosed();
  }, 800);
}

module.exports = { start, injectSettingsTab, activateCuckooTab, deactivateCuckooTab };
