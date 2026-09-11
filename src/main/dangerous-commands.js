/**
 * Проверка опасных команд.
 * Список regex-паттернов берётся из пользовательских настроек
 * (settings.json → dangerousPatterns). При отсутствии/ошибке — используется
 * встроенный DEFAULT_DANGEROUS_PATTERNS.
 */
const settingsStore = require('./settings-store');

/**
 * Преобразовать массив строк-regex в массив RegExp.
 * Невалидные паттерны игнорируются с предупреждением.
 */
function buildRegexps(patterns) {
  const out = [];
  for (const p of patterns) {
    if (typeof p !== 'string' || !p.trim()) continue;
    try {
      out.push(new RegExp(p, 'i'));
    } catch (err) {
      console.warn('[Cookie Code] Невалидный regex опасной команды:', p, '—', err.message);
    }
  }
  return out;
}

/**
 * Получить активный список RegExp (из настроек или дефолт).
 */
function getActivePatterns() {
  try {
    const settings = settingsStore.readSettings();
    const custom = settings.dangerousPatterns;
    if (Array.isArray(custom) && custom.length > 0) {
      const compiled = buildRegexps(custom);
      if (compiled.length > 0) return compiled;
    }
    // Fallback: дефолтный список
    return buildRegexps(settingsStore.DEFAULT_DANGEROUS_PATTERNS);
  } catch (err) {
    console.error('[Cookie Code] Ошибка чтения опасных команд:', err.message);
    return buildRegexps(settingsStore.DEFAULT_DANGEROUS_PATTERNS);
  }
}

/**
 * Проверить, опасна ли команда.
 */
function isDangerous(cmd) {
  if (!cmd || typeof cmd !== 'string') return false;
  const patterns = getActivePatterns();
  return patterns.some((re) => re.test(cmd.trim()));
}

/**
 * Скомпилированный список дефолтных RegExp-паттернов опасных команд.
 * Публичный (для тестов и внешних потребителей); не зависит от настроек.
 */
const DANGEROUS_CMDS = buildRegexps(settingsStore.DEFAULT_DANGEROUS_PATTERNS);

module.exports = { isDangerous, getActivePatterns, DANGEROUS_CMDS };
