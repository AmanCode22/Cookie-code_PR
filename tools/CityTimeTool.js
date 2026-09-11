const { Tool, ToolResult } = require('./ToolRegistry');

// 内部固定上限，不暴露给模型
const GEO_TIMEOUT_MS = 8000;
// 无密钥的 IP 地理定位服务（HTTPS）
const GEO_URL = 'https://ipwho.is/';

/**
 * Форматирует локальное время в ISO 8601 и человекочитаемую строку.
 * @param {Date} date
 * @param {string} timeZone — IANA-зона (например, Europe/Moscow)
 * @returns {{iso: string, human: string, timeZone: string}}
 */
function formatLocalTime(date, timeZone) {
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let human;
  try {
    human = new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz,
      dateStyle: 'long',
      timeStyle: 'medium',
    }).format(date);
  } catch (_) {
    human = date.toISOString();
  }
  return { iso: date.toISOString(), human, timeZone: tz };
}

/**
 * Запрашивает город/страну по внешнему IP.
 * @returns {Promise<{city?: string, country?: string, timezone?: string, error?: string}>}
 */
async function fetchGeo() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
  try {
    const response = await fetch(GEO_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'accept': 'application/json' },
    });
    if (!response.ok) {
      return { error: 'HTTP ' + response.status };
    }
    const data = await response.json();
    if (!data || data.success === false) {
      return { error: (data && data.message) || 'сервис вернул неуспешный ответ' };
    }
    return {
      city: data.city || undefined,
      country: data.country || undefined,
      timezone: data.timezone && data.timezone.id ? data.timezone.id : undefined,
    };
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'таймаут запроса' : err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Формирует текстовый вывод инструмента.
 * @param {object} local — { iso, human, timeZone }
 * @param {object} geo — { city?, country?, timezone?, error? }
 * @returns {string}
 */
function formatCityTimeOutput(local, geo) {
  const lines = [];
  lines.push('时间: ' + local.human + ' (' + local.iso + ')');
  lines.push('时区: ' + local.timeZone);
  if (geo && (geo.city || geo.country)) {
    const place = [geo.city, geo.country].filter(Boolean).join(', ');
    lines.push('城市 / 国家: ' + place);
  } else {
    lines.push('城市 / 国家: 未确定' + (geo && geo.error ? ' (' + geo.error + ')' : ''));
  }
  return lines.join('\n');
}

/**
 * city_time — сообщает модели текущее время и (по возможности) город/страну.
 * Время и часовой пояс берутся локально; город/страна — по внешнему IP.
 * При недоступности сети возвращается локальное время + часовой пояс.
 */
class CityTimeTool extends Tool {
  constructor() {
    super(
      'city_time',
      '返回当前时间和所在地（城市、国家）。时间和时区在本地获取，城市/国家通过外部 IP 确定。网络不可用时仅返回时间和时区。',
      {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      'cityTime()'
    );
  }

  getPromptSection() {
    return {
      name: 'tool:city_time',
      order: 112,
      text: '需要知道当前时间或用户所在地（城市/国家）时，使用 cityTime()。时间和时区在本地获取，城市/国家通过外部 IP 确定。'
    };
  }

  async execute() {
    try {
      const now = new Date();
      const geo = await fetchGeo();
      const local = formatLocalTime(now, geo.timezone);
      const output = formatCityTimeOutput(local, geo);

      console.log('[CityTimeTool] time=' + local.iso + ' tz=' + local.timeZone +
        ' city=' + (geo.city || '-') + ' country=' + (geo.country || '-'));
      return ToolResult.success(output);
    } catch (err) {
      return ToolResult.error('Не удалось определить время/местоположение: ' + err.message);
    }
  }
}

module.exports = { CityTimeTool, formatLocalTime, fetchGeo, formatCityTimeOutput };
