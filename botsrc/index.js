/**
 * botsrc/index.js
 * Интеграция Telegram-бота с Cookie Code.
 *
 * Роли:
 *  - читает настройки (token/chatId/enabled/notifyTools/chatFeed) из settings-store;
 *  - запускает/останавливает polling;
 *  - notifyToolResult(toolName, ok, detail)  → уведомление в TG (с деталями вызова: аргументы + новый код).
 *  - входящее сообщение из TG → sendToChat в активном окне DeepSeek.
 */
const { telegramBot } = require('./telegram');
const settingsStore = require('../src/main/settings-store');
const windowState = require('../src/main/window');

let started = false;

function _read() {
  const s = settingsStore.readSettings();
  return {
    enabled: !!s.telegramEnabled,
    token: s.telegramBotToken || '',
    chatId: s.telegramChatId || '',
    notifyTools: !!s.telegramNotifyTools,
    chatFeed: !!s.telegramChatFeed,
  };
}

function _log(level, ...args) {
  const tag = '[Cookie Code][telegram]';
  if (level === 'error') console.error(tag, ...args);
  else if (level === 'warn') console.warn(tag, ...args);
  else console.log(tag, ...args);
}

/**
 * Отправить текст в активное окно DeepSeek как сообщение пользователя.
 * Использует тот же путь, что и оверлей: native Enter.
 * Вставляем текст в textarea и жмём Enter.
 */
async function _sendToChat(text) {
  try {
    const win = windowState.getMainWindow();
    if (!win || win.isDestroyed()) return { success: false, error: 'нет активного окна' };

    const safe = JSON.stringify(String(text));
    const script = `(function(){
      const ta = document.querySelector('textarea[placeholder], textarea[name="search"], textarea.ds-scroll-area');
      if (!ta) return { ok: false, error: 'textarea not found' };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${safe});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      return { ok: true };
    })()`;

    await win.webContents.executeJavaScript(script, true);
    // Небольшая пауза, чтобы React обработал ввод.
    await new Promise((r) => setTimeout(r, 150));
    // Отправляем нативный Enter (тот же приём, что chat-send-enter).
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return', key: 'Enter' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: 'Return', key: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return', key: 'Enter' });
    return { success: true };
  } catch (err) {
    _log('error', 'sendToChat error:', err.message);
    return { success: false, error: err.message };
  }
}

/** Входящее из TG → в чат DeepSeek. */
async function _handleIncoming(chatId, text) {
  const cfg = _read();
  if (!cfg.chatFeed) {
    _log('info', 'chatFeed выключен — игнор входящего:', text);
    return;
  }
  _log('info', 'incoming → chat:', text);
  const res = await _sendToChat(text);
  if (!res.success) {
    await telegramBot.sendMessage('⚠ Не удалось отправить в чат: ' + (res.error || 'unknown'));
  }
}

/**
 * Человекочитаемое представление аргументов вызова инструмента.
 * Для edit показываем НОВЫЙ код (new_string) до 2000 символов.
 */
function formatToolArgs(toolName, args) {
  if (!args || typeof args !== 'object') return '';
  const a = args;

  switch (toolName) {
    case 'edit': {
      const file = a.file_path || a.path || '';
      const neu = a.new_string != null ? String(a.new_string) : '';
      const old = a.old_string != null ? String(a.old_string) : '';
      let s = '';
      if (file) s += '📄 ' + file + '\n';
      if (old) s += '➖ было:\n' + old.slice(0, 500) + (old.length > 500 ? '\n…(обрезано)' : '') + '\n';
      if (neu) s += '➕ стало:\n' + neu.slice(0, 2000) + (neu.length > 2000 ? '\n…(обрезано, всего ' + neu.length + ' симв.)' : '');
      return s;
    }
    case 'read':
    case 'readLines':
    case 'write':
      return a.file_path || a.path ? '📄 ' + (a.file_path || a.path) : '';
    case 'grep':
      return '🔎 ' + (a.pattern || '') + (a.path ? ' в ' + a.path : '') + (a.include ? ' (' + a.include + ')' : '');
    case 'glob':
      return '🔎 ' + (a.pattern || '') + (a.path ? ' в ' + a.path : '');
    case 'bash':
    case 'pwsh':
      return '💻 ' + (a.command || '');
    case 'todoWrite':
      return '☑ ' + (Array.isArray(a.todos) ? a.todos.length + ' пункт(ов)' : '');
    default: {
      // Общий случай — компактный JSON, кроме длинных полей.
      try {
        const shallow = {};
        for (const k of Object.keys(a)) {
          const v = a[k];
          if (typeof v === 'string' && v.length > 200) shallow[k] = v.slice(0, 200) + '…';
          else shallow[k] = v;
        }
        const s = JSON.stringify(shallow);
        return s && s !== '{}' ? '📥 ' + s : '';
      } catch (_) {
        return '';
      }
    }
  }
}

/** Экранирование для HTML parse_mode. */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Уведомление о результате tool. */
async function notifyToolResult(toolName, ok, detail) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.notifyTools) return { success: false, skipped: true };
  const emoji = ok ? '✅' : '❌';
  const header = emoji + ' ' + escapeHtml(toolName);

  // detail может быть строкой (ошибка) или объектом { args, preview }.
  if (detail && typeof detail === 'object') {
    const { args, preview } = detail;
    const argsText = formatToolArgs(toolName, args);
    const parts = [];

    if (toolName === 'edit') {
      // edit оставляем как есть (структурированное представление, без цитаты).
      if (argsText) parts.push(escapeHtml(argsText));
      if (preview) parts.push('📤 ' + escapeHtml(String(preview).replace(/\n{3,}/g, '\n\n').slice(0, 600)));
      const msg = header + '\n' + parts.join('\n');
      return telegramBot.sendMessage(msg, { parseMode: 'HTML' });
    }

    // Остальные инструменты: аргументы + результат в цитате <blockquote>.
    const bodyParts = [];
    if (argsText) bodyParts.push(argsText);
    if (preview) bodyParts.push('📤 ' + String(preview).replace(/\n{3,}/g, '\n\n').slice(0, 600));
    const bodyHtml = escapeHtml(bodyParts.join('\n'));
    const msg = header + (bodyHtml ? '\n<blockquote>' + bodyHtml + '</blockquote>' : '');
    return telegramBot.sendMessage(msg, { parseMode: 'HTML' });
  }

  // detail — строка.
  let msg = header;
  if (detail) msg += '\n<blockquote>' + escapeHtml(String(detail).slice(0, 600)) + '</blockquote>';
  return telegramBot.sendMessage(msg, { parseMode: 'HTML' });
}

/** Применить настройки: пересоздать конфиг бота и (при необходимости) запустить polling. */
async function applySettings() {
  const cfg = _read();
  telegramBot.configure(cfg.token, cfg.chatId);

  if (cfg.enabled && cfg.token) {
    telegramBot.startPolling(_handleIncoming);
    started = true;
  } else {
    telegramBot.stopPolling();
    started = false;
  }
  return telegramBot.getStatus();
}

function getStatus() {
  return Object.assign({ started }, telegramBot.getStatus());
}

/**
 * Отправить ответ AI в Telegram (для просмотра с телефона).
 * Обрезает слишком длинные ответы.
 */
async function notifyAIResponse(text) {
  const cfg = _read();
  if (!cfg.enabled || !cfg.chatFeed) return { success: false, skipped: true };
  const s = String(text || '').trim();
  if (!s) return { success: false, skipped: true };
  const MAX = 3500;
  const body = s.length > MAX ? s.slice(0, MAX) + '\n…(обрезано, всего ' + s.length + ' симв.)' : s;
  return telegramBot.sendMessage('🤖 ' + body);
}

/** Пингануть бота (getMe) для проверки токена. */
async function ping() {
  const cfg = _read();
  telegramBot.configure(cfg.token, cfg.chatId);
  return telegramBot.getMe();
}

/** Отправить тестовое сообщение. */
async function testSend() {
  const cfg = _read();
  telegramBot.configure(cfg.token, cfg.chatId);
  return telegramBot.sendMessage('👋 Cookie Code: тестовое уведомление. Всё работает.');
}

module.exports = {
  applySettings,
  getStatus,
  ping,
  testSend,
  notifyToolResult,
  notifyAIResponse,
  _handleIncoming,
  _sendToChat,
};
