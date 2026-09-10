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
 * Список доступных фонов — синхронизирован с src/ui/backgrounds/registry.json.
 * id = имя файла без расширения.
 */
const BACKGROUNDS = [
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

// Кэш data-URI: file → data:image/...;base64,...
const dataUriCache = new Map();

/**
 * Прочитать файл фона и вернуть data-URI (с кэшированием).
 */
function getDataUri(file) {
  if (dataUriCache.has(file)) return dataUriCache.get(file);
  try {
    const fullPath = path.join(BACKGROUNDS_DIR, file);
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
    console.error('[Cuckoo Code] Не удалось прочитать фон:', file, err.message);
    return '';
  }
}

/**
 * Применить фон по id (ключ из BACKGROUNDS).
 * Пустая строка / 'none' / null → очистить (только базовый цвет).
 */
function apply(id) {
  const entry = BACKGROUNDS.find(b => b.id === id);
  const uri = entry ? getDataUri(entry.file) : '';
  const value = uri ? 'url("' + uri + '")' : 'none';
  try {
    document.documentElement.style.setProperty('background-image', value, 'important');
    document.body.style.setProperty('background-image', value, 'important');
    console.log('[Cuckoo Code] Фон применён:', id, '(' + (uri ? Math.round(uri.length / 1024) + ' КБ' : 'нет') + ')');
  } catch (err) {
    console.error('[Cuckoo Code] Не удалось применить фон:', err.message);
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
  console.log('[Cuckoo Code] Стили: фон=' + bg + 'px, шапка=' + hdVal + 'px/' + hdOpVal + '%, сайдбар=' + sbVal + 'px/' + sbOpVal + '%, tool=' + tbBlurVal + 'px/' + tbOpVal + '%');
}

/**
 * Загрузить настройки из settings.json и применить фон + размытие.
 */
async function loadAndApply() {
  try {
    const settings = await window.electronAPI.getCuckooSettings();
    const bgId = (settings && settings.background) || DEFAULT_ID;
    apply(bgId);
    applyBlur(settings);
  } catch (err) {
    console.error('[Cuckoo Code] Не удалось загрузить настройки:', err.message);
    apply(DEFAULT_ID);
    applyBlur(null);
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
};

/**
 * Сбросить фон и все блюры к дефолтам (с сохранением в settings.json).
 */
async function resetAll() {
  apply(RESET_DEFAULTS.background);
  applyBlur(RESET_DEFAULTS);
  try {
    for (const key of Object.keys(RESET_DEFAULTS)) {
      await window.electronAPI.setCuckooSetting(key, RESET_DEFAULTS[key]);
    }
    console.log('[Cuckoo Code] Настройки сброшены к дефолтам');
  } catch (err) {
    console.error('[Cuckoo Code] Не удалось сохранить дефолты:', err.message);
  }
}

/**
 * Получить data-URI для указанного файла (для рендера превью в настройках).
 */
function getPreviewUri(file) {
  return getDataUri(file);
}

module.exports = {
  apply,
  applyBlur,
  loadAndApply,
  getPreviewUri,
  resetAll,
  RESET_DEFAULTS,
  BACKGROUNDS,
  DEFAULT_ID,
  BACKGROUNDS_DIR,
};
