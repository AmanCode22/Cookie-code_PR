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
const background = require('./background');

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

    ourContent.innerHTML = buildContentHTML();

    wrapper.appendChild(ourContent);

    // Вешаем обработчики на превью фонов
    bindBackgroundGrid();
    // Вешаем обработчики на слайдеры размытия
    bindBlurSliders();
    // Загружаем сохранённые значения блюра в слайдеры
    refreshBlurValues();
    // Подсвечиваем текущий фон
    refreshBackgroundSelection();
    // Кнопка сброса
    bindResetButton();
  }
  ourContent.style.display = '';
}

/**
 * HTML-содержимое вкладки настроек Cuckoo Code.
 */
function buildContentHTML() {
  const items = background.BACKGROUNDS.map(b => {
    const uri = background.getPreviewUri(b.file);
    const styleAttr = uri ? ' style="background-image: url(\'' + uri + '\');"' : '';
    return (
      '<div class="cuckoo-bg-item" data-bg-id="' + b.id + '" title="' + escapeHtml(b.label) + '">' +
      '  <div class="cuckoo-bg-preview"' + styleAttr + '></div>' +
      '  <div class="cuckoo-bg-label">' + escapeHtml(b.label) + '</div>' +
      '</div>'
    );
  }).join('');

  return '' +
    '<style>' +
    '  .cuckoo-settings-title { font-size: 20px; font-weight: 700; margin: 0 0 4px; color: #e8eaff; }' +
    '  .cuckoo-settings-subtitle { color: #8a90b8; font-size: 13px; margin: 0 0 16px; }' +
    '  .cuckoo-section-title { font-size: 14px; font-weight: 600; margin: 0 0 10px; color: #c8ccff; ' +
    '                          text-transform: uppercase; letter-spacing: 0.6px; }' +
    '  .cuckoo-bg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }' +
    '  .cuckoo-bg-item { cursor: pointer; border: 2px solid rgba(139,147,255,0.2); border-radius: 10px; ' +
    '                    overflow: hidden; transition: border-color 0.18s, transform 0.15s; background: rgba(0,0,0,0.25); }' +
    '  .cuckoo-bg-item:hover { border-color: rgba(139,147,255,0.65); transform: translateY(-2px); }' +
    '  .cuckoo-bg-item.cuckoo-bg-selected { border-color: #8b93ff; box-shadow: 0 0 0 2px rgba(139,147,255,0.35); }' +
    '  .cuckoo-bg-preview { width: 100%; aspect-ratio: 16/10; background-size: cover; background-position: center; background-color: #0f1220; }' +
    '  .cuckoo-bg-label { font-size: 11px; padding: 5px 8px; text-align: center; color: #cfd3ff; ' +
    '                     white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +
    // Слайдеры
    '  .cuckoo-blur-row { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; ' +
    '                     background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); ' +
    '                     border-radius: 10px; margin-bottom: 8px; }' +
    '  .cuckoo-blur-label { font-size: 13px; color: #cfd3ff; display: flex; justify-content: space-between; ' +
    '                       align-items: center; margin-bottom: 2px; }' +
    '  .cuckoo-blur-value { font-size: 12px; color: #8b93ff; font-family: "Consolas", monospace; font-weight: 600; }' +
    '  .cuckoo-blur-slider { width: 100%; height: 4px; -webkit-appearance: none; appearance: none; ' +
    '                        background: rgba(139,147,255,0.25); border-radius: 2px; outline: none; ' +
    '                        cursor: pointer; }' +
    '  .cuckoo-blur-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; ' +
    '                        width: 16px; height: 16px; border-radius: 50%; background: #8b93ff; ' +
    '                        cursor: pointer; transition: transform 0.15s; }' +
    '  .cuckoo-blur-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }' +
    '</style>' +
    '<div>' +
    '  <div class="cuckoo-settings-title">Cuckoo Code</div>' +
    '  <div class="cuckoo-settings-subtitle">Настройки интерфейса и фонового изображения</div>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">Размытие</div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>Блюр фонового изображения</span><span class="cuckoo-blur-value" id="cuckoo-blur-bg-val">0 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-bg" class="cuckoo-blur-slider" min="0" max="30" step="1" value="0">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>Блюр шапки (стекло)</span><span class="cuckoo-blur-value" id="cuckoo-blur-header-val">12 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-header" class="cuckoo-blur-slider" min="0" max="30" step="1" value="12">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>Блюр сайдбара (стекло)</span><span class="cuckoo-blur-value" id="cuckoo-blur-sidebar-val">12 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-sidebar" class="cuckoo-blur-slider" min="0" max="30" step="1" value="12">' +
    '  </div>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">Прозрачность панелей</div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>Прозрачность шапки</span><span class="cuckoo-blur-value" id="cuckoo-op-header-val">45 %</span></div>' +
    '    <input type="range" id="cuckoo-op-header" class="cuckoo-blur-slider" min="0" max="100" step="5" value="45">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>Прозрачность сайдбара</span><span class="cuckoo-blur-value" id="cuckoo-op-sidebar-val">45 %</span></div>' +
    '    <input type="range" id="cuckoo-op-sidebar" class="cuckoo-blur-slider" min="0" max="100" step="5" value="45">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>Прозрачность tool-блоков</span><span class="cuckoo-blur-value" id="cuckoo-op-toolblock-val">55 %</span></div>' +
    '    <input type="range" id="cuckoo-op-toolblock" class="cuckoo-blur-slider" min="0" max="100" step="5" value="55">' +
    '  </div>' +
    '  <div class="cuckoo-blur-row">' +
    '    <div class="cuckoo-blur-label"><span>Блюр tool-блоков (стекло)</span><span class="cuckoo-blur-value" id="cuckoo-blur-toolblock-val">0 px</span></div>' +
    '    <input type="range" id="cuckoo-blur-toolblock" class="cuckoo-blur-slider" min="0" max="30" step="1" value="0">' +
    '  </div>' +
    '</div>' +
    '<div>' +
    '  <div class="cuckoo-section-title">Фон страницы</div>' +
    '  <div class="cuckoo-bg-grid">' + items + '</div>' +
    '</div>' +
    '<div style="display:flex;justify-content:flex-end;margin-top:4px;">' +
    '  <button id="cuckoo-btn-reset" style="' +
    '    padding: 9px 18px; border: 1px solid rgba(255,107,122,0.5); border-radius: 10px;' +
    '    background: rgba(255,107,122,0.15); color: #ff9aa5; font-weight: 600; font-size: 13px;' +
    '    cursor: pointer; transition: all 0.18s;' +
    '  ">Сбросить настройки</button>' +
    '</div>';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Обработчики клика по превью: сохраняем фон и применяем.
 */
function bindBackgroundGrid() {
  const grid = document.querySelectorAll('#' + TAB_CONTENT_ID + ' .cuckoo-bg-item');
  grid.forEach(el => {
    el.addEventListener('click', async () => {
      const id = el.getAttribute('data-bg-id');
      if (!id) return;
      // Мгновенно применяем
      background.apply(id);
      // Подсветка
      document.querySelectorAll('#' + TAB_CONTENT_ID + ' .cuckoo-bg-item').forEach(x => x.classList.remove('cuckoo-bg-selected'));
      el.classList.add('cuckoo-bg-selected');
      // Сохраняем в settings.json
      try {
        const res = await window.electronAPI.setCuckooSetting('background', id);
        if (!res || !res.success) {
          console.error('[Cuckoo Code] Не удалось сохранить фон:', res && res.error);
        }
      } catch (err) {
        console.error('[Cuckoo Code] Ошибка сохранения фона:', err.message);
      }
    });
  });
}

/**
 * Обработчики слайдеров размытия.
 * На input — мгновенно применяем и обновляем подпись.
 * На change — сохраняем в settings.json.
 */
function bindBlurSliders() {
  const sliders = [
    { inputId: 'cuckoo-blur-bg',      valId: 'cuckoo-blur-bg-val',      key: 'backgroundBlur', def: 0 },
    { inputId: 'cuckoo-blur-header',  valId: 'cuckoo-blur-header-val',  key: 'headerBlur',     def: 12 },
    { inputId: 'cuckoo-blur-sidebar', valId: 'cuckoo-blur-sidebar-val', key: 'sidebarBlur',    def: 12 },
    { inputId: 'cuckoo-op-header',    valId: 'cuckoo-op-header-val',    key: 'headerOpacity',   def: 45 },
    { inputId: 'cuckoo-op-sidebar',   valId: 'cuckoo-op-sidebar-val',   key: 'sidebarOpacity',  def: 45 },
    { inputId: 'cuckoo-op-toolblock', valId: 'cuckoo-op-toolblock-val', key: 'toolBlockOpacity', def: 55 },
    { inputId: 'cuckoo-blur-toolblock', valId: 'cuckoo-blur-toolblock-val', key: 'toolBlockBlur', def: 0 },
  ];

  sliders.forEach(({ inputId, valId, key, def }) => {
    const input = document.getElementById(inputId);
    const label = document.getElementById(valId);
    if (!input || !label) return;
    const updateLabel = (v) => { label.textContent = v + ' px'; };

    input.addEventListener('input', () => {
      const v = Number(input.value);
      updateLabel(v);
      // Мгновенно применяем — собираем текущие значения и вызываем applyBlur
      const settings = {
        backgroundBlur:   Number((document.getElementById('cuckoo-blur-bg') || {}).value) || 0,
        headerBlur:       Number((document.getElementById('cuckoo-blur-header') || {}).value),
        sidebarBlur:      Number((document.getElementById('cuckoo-blur-sidebar') || {}).value),
        headerOpacity:    Number((document.getElementById('cuckoo-op-header') || {}).value),
        sidebarOpacity:   Number((document.getElementById('cuckoo-op-sidebar') || {}).value),
        toolBlockOpacity: Number((document.getElementById('cuckoo-op-toolblock') || {}).value),
        toolBlockBlur:    Number((document.getElementById('cuckoo-blur-toolblock') || {}).value),
      };
      background.applyBlur(settings);
    });

    input.addEventListener('change', async () => {
      const v = Number(input.value);
      try {
        const res = await window.electronAPI.setCuckooSetting(key, v);
        if (!res || !res.success) {
          console.error('[Cuckoo Code] Не удалось сохранить настройку', key, res && res.error);
        }
      } catch (err) {
        console.error('[Cuckoo Code] Ошибка сохранения настройки', key, err.message);
      }
    });
  });
}

/**
 * Кнопка «Сбросить настройки» — возвращает фон и все блюры к дефолтам.
 */
function bindResetButton() {
  const btn = document.getElementById('cuckoo-btn-reset');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Сброс...';
    try {
      await background.resetAll();
      // Обновляем UI: слайдеры + подсветка фона
      await refreshBlurValues();
      await refreshBackgroundSelection();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Сбросить настройки';
    }
  });
}

/**
 * Загрузить сохранённые значения блюра в слайдеры.
 */
async function refreshBlurValues() {
  try {
    const s = await window.electronAPI.getCuckooSettings();
    const setSlider = (id, valId, v) => {
      const input = document.getElementById(id);
      const label = document.getElementById(valId);
      if (!input || !label) return;
      input.value = String(v);
      label.textContent = v + ' px';
    };
    setSlider('cuckoo-blur-bg',      'cuckoo-blur-bg-val',      Number(s && s.backgroundBlur) || 0);
    setSlider('cuckoo-blur-header',  'cuckoo-blur-header-val',  Number(s && s.headerBlur != null ? s.headerBlur : 12));
    setSlider('cuckoo-blur-sidebar', 'cuckoo-blur-sidebar-val', Number(s && s.sidebarBlur != null ? s.sidebarBlur : 12));
    setSlider('cuckoo-op-header',    'cuckoo-op-header-val',    Number(s && s.headerOpacity != null ? s.headerOpacity : 45));
    setSlider('cuckoo-op-sidebar',   'cuckoo-op-sidebar-val',   Number(s && s.sidebarOpacity != null ? s.sidebarOpacity : 45));
    setSlider('cuckoo-op-toolblock', 'cuckoo-op-toolblock-val', Number(s && s.toolBlockOpacity != null ? s.toolBlockOpacity : 55));
    setSlider('cuckoo-blur-toolblock','cuckoo-blur-toolblock-val', Number(s && s.toolBlockBlur != null ? s.toolBlockBlur : 0));
  } catch (err) {
    console.error('[Cuckoo Code] Не удалось загрузить значения блюра:', err.message);
  }
}

/**
 * Обновить подсветку выбранного фона из settings.json.
 */
async function refreshBackgroundSelection() {
  try {
    const settings = await window.electronAPI.getCuckooSettings();
    const current = (settings && settings.background) || background.DEFAULT_ID;
    document.querySelectorAll('#' + TAB_CONTENT_ID + ' .cuckoo-bg-item').forEach(el => {
      if (el.getAttribute('data-bg-id') === current) {
        el.classList.add('cuckoo-bg-selected');
      } else {
        el.classList.remove('cuckoo-bg-selected');
      }
    });
  } catch (err) {
    console.error('[Cuckoo Code] Не удалось прочитать текущий фон:', err.message);
  }
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
