/**
 * Управление фоновым изображением страницы DeepSeek.
 *
 * Картинки читаются из src/ui/backgrounds/ напрямую в preload через fs и
 * кодируются в base64 data-URI. Это единственный надёжный способ: файловая
 * схема file:// заблокирована Chromium со страницы chat.deepseek.com, а
 * кастомная cuckoo-asset:// не проходит через fetch API даже с bypassCSP.
 */
const fs = require('fs');
const path = require('path');

// Директория с фонами (относительно preload): <projectRoot>/src/ui/backgrounds
const BACKGROUNDS_DIR = path.join(__dirname, '..', '..', 'ui', 'backgrounds');

/**
 * Список встроенных фонов — синхронизирован с src/ui/backgrounds/registry.json.
 * id = имя файла без расширения.
 */
const BUILTIN_BACKGROUNDS = [
  { id: 'miku',             label: 'Мику',                       file: 'miku.webp' },
  { id: 'miku-light',       label: 'Мику (светлая)',             file: 'miku-light.jpg' },
  { id: 'abyssal-dark',     label: 'Бездна (тёмная)',            file: 'abyssal-dark.webp' },
  { id: 'abyssal-light',    label: 'Бездна (светлая)',           file: 'abyssal-light.webp' },
  { id: 'bee-eater',        label: 'Синещёкая щурка',            file: 'bee-eater.jpg' },
  { id: 'blue-fantasy',     label: 'Синяя фантазия',             file: 'blue-fantasy.jpg' },
  { id: 'cyber-night',      label: 'Кибер-ночь',                 file: 'cyber-night.webp' },
  { id: 'dragon-heir-dark', label: 'Наследник дракона (тёмный)', file: 'dragon-heir-dark.webp' },
  { id: 'dragon-heir-light',label: 'Наследник дракона (светлый)',file: 'dragon-heir-light.webp' },
  { id: 'furina',           label: 'Фурина',                     file: 'furina.jpg' },
  { id: 'harbor',           label: 'Гавань',                     file: 'harbor.webp' },
  { id: 'hologram-dark',    label: 'Голограмма (тёмная)',        file: 'hologram-dark.webp' },
  { id: 'hologram-light',   label: 'Голограмма (светлая)',       file: 'hologram-light.webp' },
  { id: 'maid-day',         label: 'Горничная — день',           file: 'maid-day.webp' },
  { id: 'maid-night',       label: 'Горничная — ночь',           file: 'maid-night.webp' },
  { id: 'phoebe-dark',      label: 'Фиби (тёмная)',              file: 'phoebe-dark.webp' },
  { id: 'phoebe-light',     label: 'Фиби (светлая)',             file: 'phoebe-light.webp' },
  { id: 'starry-dark',      label: 'Звёздная ночь (тёмная)',     file: 'starry-dark.webp' },
  { id: 'starry-light',     label: 'Звёздная ночь (светлая)',    file: 'starry-light.webp' },
  { id: 'stellar-dark',     label: 'Звёздная дива (тёмная)',     file: 'stellar-dark.webp' },
  { id: 'stellar-light',    label: 'Звёздная дива (светлая)',    file: 'stellar-light.webp' },
  { id: 'summer',           label: 'Летнее стекло',              file: 'summer.jpg' },
  { id: 'tokyo-night',      label: 'Токио ночью',                file: 'tokyo-night.webp' },
  { id: 'war-thunder-dark', label: 'War Thunder (тёмный)',       file: 'war-thunder-dark.webp' },
  { id: 'war-thunder-light',label: 'War Thunder (светлый)',      file: 'war-thunder-light.webp' },
  { id: 'whale-mom',        label: 'Мама-кит',                   file: 'whale-mom.jpg' },
  { id: 'whale-song',       label: 'Песнь кита',                 file: 'whale-song.webp' },
];

const DEFAULT_ID = 'miku';

// Пользовательские фоны из <userData>/backgrounds (заполняется асинхронно
// через window.electronAPI.listCustomBackgrounds()).
// Каждый элемент: { id: 'custom:<base>', label, file: <абсолютный путь>, custom: true }
let customBackgrounds = [];
// Абсолютный путь к папке с пользовательскими фонами (для UI).
let customBackgroundsDir = '';

// Кэш data-URI: file → data:image/...;base64,...
const dataUriCache = new Map();

/**
 * Полный список фонов: встроенные + пользовательские.
 * id пользовательских — 'custom:<имя-файла-без-расширения>'.
 */
function getAllBackgrounds() {
  return BUILTIN_BACKGROUNDS.concat(customBackgrounds);
}

/**
 * Найти запись фона по id во всём списке (встроенные + пользовательские).
 */
function findBackground(id) {
  return getAllBackgrounds().find(b => b.id === id) || null;
}

/**
 * Загрузить список пользовательских фонов из main-процесса.
 * Вызывается при старте и при открытии вкладки настроек.
 */
async function loadCustomBackgrounds() {
  try {
    const res = await window.electronAPI.listCustomBackgrounds();
    if (res && res.success) {
      customBackgrounds = res.backgrounds || [];
      customBackgroundsDir = res.dir || '';
    } else {
      customBackgrounds = [];
    }
  } catch (err) {
    console.error('[Cookie Code] Не удалось загрузить пользовательские фоны:', err.message);
    customBackgrounds = [];
  }
  return customBackgrounds;
}

/**
 * Прочитать файл фона и вернуть data-URI (с кэшированием).
 * file — либо имя файла во встроенной папке, либо абсолютный путь (кастомный фон).
 */
function getDataUri(file) {
  if (dataUriCache.has(file)) return dataUriCache.get(file);
  try {
    const fullPath = path.isAbsolute(file) ? file : path.join(BACKGROUNDS_DIR, file);
    const buf = fs.readFileSync(fullPath);
    const ext = path.extname(file).toLowerCase();
    const mime = {
      '.webp': 'image/webp',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
    }[ext] || 'application/octet-stream';
    const uri = 'data:' + mime + ';base64,' + buf.toString('base64');
    dataUriCache.set(file, uri);
    return uri;
  } catch (err) {
    console.error('[Cookie Code] Не удалось прочитать фон:', file, err.message);
    return '';
  }
}

/**
 * Применить фон по id (ключ из BACKGROUNDS).
 * Пустая строка / 'none' / null → очистить (только базовый цвет).
 */
function apply(id) {
  const entry = findBackground(id);
  const uri = entry ? getDataUri(entry.file) : '';
  const value = uri ? 'url("' + uri + '")' : 'none';
  try {
    document.documentElement.style.setProperty('background-image', value, 'important');
    document.body.style.setProperty('background-image', value, 'important');
    // Дублируем URL в переменную — её читает reasoning-glass.js и CSS-шаблон.
    document.documentElement.style.setProperty('--cuckoo-bg-image', uri ? value : 'none', 'important');
    console.log('[Cookie Code] Фон применён:', id, '(' + (uri ? Math.round(uri.length / 1024) + ' КБ' : 'нет') + ')');
  } catch (err) {
    console.error('[Cookie Code] Не удалось применить фон:', err.message);
  }
}

/**
 * Применить настройки размытия и прозрачности.
 * Числовые значения — px, прозрачность — % (0–100).
 */
function applyBlur(settings) {
  const root = document.documentElement;
  const bg = Number(settings && settings.backgroundBlur) || 0;
  const hd = Number(settings && settings.headerBlur);
  const sb = Number(settings && settings.sidebarBlur);
  const hdOp = Number(settings && settings.headerOpacity);
  const sbOp = Number(settings && settings.sidebarOpacity);

  const hdVal = isNaN(hd) ? 12 : hd;
  const sbVal = isNaN(sb) ? 12 : sb;
  const hdOpVal = isNaN(hdOp) ? 45 : hdOp;
  const sbOpVal = isNaN(sbOp) ? 45 : sbOp;
  const tbBlur = Number(settings && settings.toolBlockBlur);
  const tbOp = Number(settings && settings.toolBlockOpacity);
  const tbBlurVal = isNaN(tbBlur) ? 0 : tbBlur;
  const tbOpVal = isNaN(tbOp) ? 55 : tbOp;

  root.style.setProperty('--cuckoo-bg-blur', bg + 'px');
  root.style.setProperty('--cuckoo-header-blur', hdVal + 'px');
  root.style.setProperty('--cuckoo-sidebar-blur', sbVal + 'px');
  root.style.setProperty('--cuckoo-header-opacity', hdOpVal + '%');
  root.style.setProperty('--cuckoo-sidebar-opacity', sbOpVal + '%');
  root.style.setProperty('--cuckoo-toolblock-opacity', tbOpVal + '%');
  root.style.setProperty('--cuckoo-toolblock-blur', tbBlurVal + 'px');
  // Плашка «Размышление» использует свой blur (дефолт 12px, если настройка toolBlockBlur = 0).
  root.style.setProperty('--cuckoo-reasoning-blur', (tbBlurVal > 0 ? tbBlurVal : 12) + 'px');
  // И свою (более лёгкую) плотность плёнки — тонкая плашка не должна выглядеть чёрной.
  root.style.setProperty('--cuckoo-reasoning-opacity', Math.max(15, tbOpVal - 20) + '%');
  console.log('[Cookie Code] Стили: фон=' + bg + 'px, шапка=' + hdVal + 'px/' + hdOpVal + '%, сайдбар=' + sbVal + 'px/' + sbOpVal + '%, tool=' + tbBlurVal + 'px/' + tbOpVal + '%');
}

/**
 * Загрузить настройки из settings.json и применить фон + размытие.
 */
async function loadAndApply() {
  try {
    // Сначала подтягиваем пользовательские фоны, чтобы выбранный кастомный фон
    // нашёлся по id при применении.
    await loadCustomBackgrounds();
    const settings = await window.electronAPI.getCuckooSettings();
    const bgId = (settings && settings.background) || DEFAULT_ID;
    apply(bgId);
    applyBlur(settings);
    applyRgbUsername(settings ? settings.rgbUsername : true);
  } catch (err) {
    console.error('[Cookie Code] Не удалось загрузить настройки:', err.message);
    apply(DEFAULT_ID);
    applyBlur(null);
    applyRgbUsername(true);
  }
}

/**
 * Значения по умолчанию (синхронизированы с src/main/settings-store.js).
 */
const RESET_DEFAULTS = {
  background: DEFAULT_ID,
  backgroundBlur: 0,
  headerBlur: 12,
  sidebarBlur: 12,
  headerOpacity: 45,
  sidebarOpacity: 45,
  toolBlockOpacity: 55,
  toolBlockBlur: 0,
  rgbUsername: true,
};

/**
 * Сбросить фон и все блюры к дефолтам (с сохранением в settings.json).
 */
async function resetAll() {
  apply(RESET_DEFAULTS.background);
  applyBlur(RESET_DEFAULTS);
  applyRgbUsername(RESET_DEFAULTS.rgbUsername);
  try {
    for (const key of Object.keys(RESET_DEFAULTS)) {
      await window.electronAPI.setCuckooSetting(key, RESET_DEFAULTS[key]);
    }
    console.log('[Cookie Code] Настройки сброшены к дефолтам');
  } catch (err) {
    console.error('[Cookie Code] Не удалось сохранить дефолты:', err.message);
  }
}

/**
 * Применить состояние кастомизации.
 * Если enabled=false — на <html> вешается класс cuckoo-customization-off,
 * который снимает базовый цвет фона и ::before-слой (см. template.js).
 */
function applyCustomizationEnabled(enabled) {
  try {
    if (enabled === false) {
      document.documentElement.classList.add('cuckoo-customization-off');
    } else {
      document.documentElement.classList.remove('cuckoo-customization-off');
    }
  } catch (err) {
    console.error('[Cookie Code] Не удалось применить состояние кастомизации:', err.message);
  }
}

/**
 * Применить настройку RGB-переливания ника.
 * Если enabled=false — на <body> вешается класс cuckoo-rgb-off.
 */
function applyRgbUsername(enabled) {
  try {
    if (enabled === false || enabled === 'false' || enabled === 0) {
      document.body.classList.add('cuckoo-rgb-off');
    } else {
      document.body.classList.remove('cuckoo-rgb-off');
    }
    console.log('[Cookie Code] RGB-ник:', enabled === false ? 'выкл' : 'вкл');
  } catch (err) {
    console.error('[Cookie Code] Не удалось применить RGB-ник:', err.message);
  }
}

/**
 * Получить data-URI для указанного файла (для рендера превью в настройках).
 */
function getPreviewUri(file) {
  return getDataUri(file);
}

/**
 * Очистить localStorage-хранилища Cookie Code:
 * - cuckoo-response-meta (мета ответов: время + токены)
 * - cuckoo-errors (сохранённые ошибки tool-блоков)
 */
function clearLocalStorage() {
  try {
    localStorage.removeItem('cuckoo-response-meta');
    localStorage.removeItem('cuckoo-errors');
    console.log('[Cookie Code] LocalStorage очищен (мета + ошибки)');
  } catch (err) {
    console.error('[Cookie Code] Ошибка очистки localStorage:', err.message);
  }
}

module.exports = {
  apply,
  applyBlur,
  applyRgbUsername,
  applyCustomizationEnabled,
  loadAndApply,
  getPreviewUri,
  resetAll,
  clearLocalStorage,
  RESET_DEFAULTS,
  // Список фонов: встроенные + пользовательские (динамически).
  getAllBackgrounds,
  findBackground,
  loadCustomBackgrounds,
  getCustomBackgroundsDir: () => customBackgroundsDir,
  BUILTIN_BACKGROUNDS,
  DEFAULT_ID,
  BACKGROUNDS_DIR,
};
