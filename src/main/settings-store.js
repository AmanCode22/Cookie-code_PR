/**
 * Пользовательские настройки Cookie Code (settings.json в userData).
 * Простой key-value store с дефолтами.
 *
 * Файл: <userData>/cuckoo-settings.json
 * Пример содержимого:
 *   { "background": "miku" }
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_DANGEROUS_PATTERNS = [
  '^rm\\s+-rf\\s+/',
  '^format\\s+',
  '^del\\s+/f',
  '^rd\\s+/s',
  '^shutdown\\s+',
  '^taskkill\\s+',
  '^diskpart',
  '^reg\\s+delete',
  '^cipher\\s+/w',
];

const DEFAULTS = {
  background: 'miku',
  backgroundBlur: 0,     // px — размытие самой картинки фона
  headerBlur: 12,        // px — стекло верхней панели
  sidebarBlur: 12,       // px — стекло левого сайдбара
  headerOpacity: 45,     // % — плотность фона шапки (0 = прозрачно)
  sidebarOpacity: 45,    // % — плотность фона сайдбара (0 = прозрачно)
  toolBlockOpacity: 55,  // % — плотность фона tool-блоков в чате
  toolBlockBlur: 0,      // px — стекло tool-блоков в чате
  rgbUsername: true,     // RGB-переливание ника пользователя (по умолчанию вкл)
  dangerousPatterns: DEFAULT_DANGEROUS_PATTERNS, // список regex-паттернов опасных команд
};

let cachedPath = null;

function getSettingsPath() {
  if (!cachedPath) {
    cachedPath = path.join(app.getPath('userData'), 'cuckoo-settings.json');
  }
  return cachedPath;
}

function readSettings() {
  try {
    const file = getSettingsPath();
    if (!fs.existsSync(file)) return { ...DEFAULTS };
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch (err) {
    console.error('[Cookie Code] 读取 settings.json 失败:', err.message);
    return { ...DEFAULTS };
  }
}

function writeSettings(settings) {
  try {
    const file = getSettingsPath();
    const merged = { ...DEFAULTS, ...settings };
    fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf-8');
    console.log('[Cookie Code] settings.json 已保存:', file);
    return merged;
  } catch (err) {
    console.error('[Cookie Code] 写入 settings.json 失败:', err.message);
    return null;
  }
}

/**
 * Частичное обновление одного ключа.
 */
function setSetting(key, value) {
  const current = readSettings();
  current[key] = value;
  return writeSettings(current);
}

/**
 * Получить значение одного ключа.
 */
function getSetting(key) {
  const s = readSettings();
  return s[key];
}

module.exports = {
  DEFAULTS,
  DEFAULT_DANGEROUS_PATTERNS,
  readSettings,
  writeSettings,
  getSetting,
  setSetting,
  getSettingsPath,
};
