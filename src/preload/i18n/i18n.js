/**
 * Простой i18n для UI Cookie Code.
 *
 * Использование:
 *   const { t, getLanguage, setLanguage } = require('../i18n/i18n');
 *   t('overlay.btn.init')  // → «Инициализировать проект» или «Initialize project»
 *
 * Язык хранится в settings.json (ключ language, 'ru' | 'en').
 * При смене языка рекомендуется location.reload() — просто и надёжно.
 */

const DEFAULTS = { ru: '', en: '' };

// ========== Словарь ==========
const KEYS = {
  // ---- Оверлей: заголовки и общие ----
  'overlay.title':              { ru: 'Cookie Code',               en: 'Cookie Code' },
  'overlay.btn.minimize':       { ru: 'Свернуть панель',           en: 'Collapse panel' },
  'overlay.label.currentDir':   { ru: 'Текущий каталог проекта',   en: 'Current project directory' },
  'overlay.btn.changeDir':      { ru: '🔄 Изменить',               en: '🔄 Change' },
  'overlay.btn.changeDir.title':{ ru: 'Изменить каталог проекта',  en: 'Change project directory' },
  'overlay.dir.notSelected':    { ru: 'Не выбрано',                en: 'Not selected' },

  // ---- Оверлей: кнопки ----
  'overlay.btn.init':           { ru: 'Инициализировать проект',   en: 'Initialize project' },
  'overlay.btn.windowManager':  { ru: 'Окна',                      en: 'Windows' },
  'overlay.btn.windowManager.title': { ru: 'Управление окнами',    en: 'Manage windows' },
  'overlay.btn.mcp':            { ru: 'MCP',                       en: 'MCP' },
  'overlay.btn.mcp.title':      { ru: 'Управление MCP-инструментами', en: 'Manage MCP tools' },
  'overlay.btn.genDoc':         { ru: 'Создать описание',          en: 'Generate docs' },
  'overlay.btn.genDoc.title':   { ru: 'Попросить AI сгенерировать описание проекта (CUCKOO.md)', en: 'Ask AI to generate a project description (CUCKOO.md)' },
  'overlay.btn.immersive':      { ru: 'Погружение',                en: 'Immersive' },
  'overlay.btn.immersive.title':{ ru: 'Переключить в режим погружения', en: 'Switch to immersive mode' },
  'overlay.btn.manualParse':    { ru: 'Разобрать вручную',         en: 'Manual parse' },
  'overlay.btn.manualParse.title': { ru: 'Вручную разобрать вызовы инструментов в текущем ответе', en: 'Manually parse tool calls in the latest reply' },

  // ---- Оверлей: сессии ----
  'overlay.label.sessions':     { ru: 'Сессии',                    en: 'Sessions' },
  'overlay.btn.refreshSessions':{ ru: '🔄 Обновить',               en: '🔄 Refresh' },
  'overlay.sessions.empty':     { ru: 'Нет сессий',                en: 'No sessions' },

  // ---- Оверлей: задержка отправки ----
  'overlay.label.sendDelay':    { ru: 'Задержка отправки',         en: 'Send delay' },
  'overlay.label.delayRange':   { ru: 'до',                        en: 'to' },
  'overlay.btn.saveDelay':      { ru: 'Сохранить задержку',        en: 'Save delay' },

  // ---- Оверлей: задача/результат/история ----
  'overlay.label.task':         { ru: 'Обнаружена задача:',        en: 'Task detected:' },
  'overlay.task.running':       { ru: 'Выполняется',               en: 'Running' },
  'overlay.cmd.none':           { ru: 'Нет',                       en: 'None' },
  'overlay.label.result':       { ru: 'Результат:',                en: 'Result:' },
  'overlay.label.history':      { ru: 'История',                   en: 'History' },
  'overlay.btn.clearHistory':   { ru: 'Очистить историю',          en: 'Clear history' },
  'overlay.history.empty':      { ru: 'Пока пусто',                en: 'No history yet' },

  // ---- Оверлей: window manager ----
  'wm.title':                   { ru: 'Управление окнами',         en: 'Window manager' },
  'wm.btn.close':               { ru: 'Закрыть',                   en: 'Close' },
  'wm.btn.newWindow':           { ru: 'Новое окно',                en: 'New window' },
  'wm.label.list':              { ru: 'Окна',                      en: 'Windows' },
  'wm.btn.refresh':             { ru: '🔄 Обновить',               en: '🔄 Refresh' },
  'wm.empty':                   { ru: 'Нет окон',                  en: 'No windows' },
  'wm.toast.created':           { ru: 'Создано новое окно DeepSeek', en: 'New DeepSeek window created' },

  // ---- Оверлей: MCP ----
  'mcp.title':                  { ru: 'MCP-инструменты',           en: 'MCP tools' },
  'mcp.label.configured':       { ru: 'Настроены',                 en: 'Configured' },
  'mcp.empty':                  { ru: 'Нет',                       en: 'None' },
  'mcp.btn.save':               { ru: 'Сохранить настройки',       en: 'Save config' },

  // ---- Оверлей: бейдж и первый диалог ----
  'badge.title':                { ru: 'Cookie Code работает',      en: 'Cookie Code is running' },
  'firstTime.text':             { ru: 'При первом создании диалога нужно инициализировать проект и выбрать каталог, иначе работа невозможна', en: 'When starting the first conversation, initialize a project and pick a directory — otherwise the app cannot work' },

  // ---- Настройки: общее ----
  'settings.title':             { ru: 'Cookie Code',               en: 'Cookie Code' },
  'settings.subtitle':          { ru: 'Настройки интерфейса и фонового изображения', en: 'Interface and background settings' },
  'settings.section.blur':      { ru: 'Размытие',                  en: 'Blur' },
  'settings.section.opacity':   { ru: 'Прозрачность панелей',      en: 'Panel opacity' },
  'settings.section.effects':   { ru: 'Эффекты',                   en: 'Effects' },
  'settings.section.dangerous': { ru: 'Опасные команды (regex, по одной на строку)', en: 'Dangerous commands (regex, one per line)' },
  'settings.section.background':{ ru: 'Фон страницы',              en: 'Page background' },
  'settings.section.language':  { ru: 'Язык',                      en: 'Language' },

  // ---- Настройки: слайдеры ----
  'settings.blur.bg':           { ru: 'Размытие фонового изображения', en: 'Background image blur' },
  'settings.blur.header':       { ru: 'Размытие шапки (стекло)',   en: 'Header blur (glass)' },
  'settings.blur.sidebar':      { ru: 'Размытие сайдбара (стекло)', en: 'Sidebar blur (glass)' },
  'settings.blur.toolblock':    { ru: 'Размытие tool-блоков (стекло)', en: 'Tool block blur (glass)' },
  'settings.opacity.header':    { ru: 'Прозрачность шапки',        en: 'Header opacity' },
  'settings.opacity.sidebar':   { ru: 'Прозрачность сайдбара',     en: 'Sidebar opacity' },
  'settings.opacity.toolblock': { ru: 'Прозрачность tool-блоков',  en: 'Tool block opacity' },

  // ---- Настройки: эффекты ----
  'settings.effect.rgb':        { ru: 'RGB-переливание ника',      en: 'RGB animated username' },

  // ---- Настройки: опасные команды ----
  'settings.dangerous.hint':    { ru: 'Пустой список = все команды разрешены', en: 'Empty list = all commands allowed' },
  'settings.dangerous.save':    { ru: 'Сохранить',                 en: 'Save' },
  'settings.dangerous.saving':  { ru: 'Сохранение...',             en: 'Saving...' },
  'settings.dangerous.saved':   { ru: '✅ Сохранено',              en: '✅ Saved' },
  'settings.dangerous.error':   { ru: '❌ Ошибка',                 en: '❌ Error' },

  // ---- Настройки: кнопки внизу ----
  'settings.btn.openConfig':    { ru: 'Открыть файл настроек',     en: 'Open configuration file' },
  'settings.btn.openConfig.title': { ru: 'Открыть cuckoo-settings.json в системном редакторе', en: 'Open cuckoo-settings.json in the system editor' },
  'settings.btn.openConfig.opened': { ru: '✅ Файл открыт',         en: '✅ File opened' },
  'settings.btn.openConfig.error':  { ru: '❌ Не удалось открыть',  en: '❌ Failed to open' },
  'settings.btn.clearStorage':  { ru: 'Очистить мета-данные',      en: 'Clear meta data' },
  'settings.btn.clearStorage.title': { ru: 'Очистить сохранённые мета-данные и историю ошибок', en: 'Clear saved meta data and error history' },
  'settings.btn.reset':         { ru: 'Сбросить настройки',        en: 'Reset settings' },
  'settings.btn.resetting':     { ru: 'Сброс...',                  en: 'Resetting...' },
  'settings.btn.clearing':      { ru: 'Очистка...',                en: 'Clearing...' },

  // ---- Настройки: язык ----
  'settings.lang.ru':           { ru: 'Русский',                   en: 'Russian' },
  'settings.lang.en':           { ru: 'Английский',                en: 'English' },
};

// ========== Состояние ==========
let currentLang = 'ru';

function normalizeLang(lang) {
  return lang === 'en' ? 'en' : 'ru';
}

/**
 * Получить перевод по ключу.
 * @param {string} key
 * @param {object} [params] — {name: value} для подстановки {name} в строку
 */
function t(key, params) {
  const entry = KEYS[key];
  if (!entry) {
    console.warn('[Cookie Code] i18n: missing key:', key);
    return key;
  }
  let str = entry[currentLang] || entry.ru || entry.en || key;
  if (params) {
    for (const k of Object.keys(params)) {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), String(params[k]));
    }
  }
  return str;
}

function getLanguage() {
  return currentLang;
}

/**
 * Установить язык в памяти. Сохранение в settings.json — на вызывающей стороне.
 */
function setLanguage(lang) {
  currentLang = normalizeLang(lang);
  try { window.__cuckooI18nLang = currentLang; } catch (_) {}
}

/**
 * Загрузить язык из settings.json (async).
 */
async function loadLanguage() {
  try {
    if (!window.electronAPI || typeof window.electronAPI.getCuckooSettings !== 'function') {
      return currentLang;
    }
    const s = await window.electronAPI.getCuckooSettings();
    currentLang = normalizeLang(s && s.language);
  } catch (_) { /* оставляем ru по умолчанию */ }
  try { window.__cuckooI18nLang = currentLang; } catch (_) {}
  return currentLang;
}

module.exports = { t, getLanguage, setLanguage, loadLanguage, KEYS };
