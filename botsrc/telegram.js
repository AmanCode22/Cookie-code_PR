/**
 * botsrc/telegram.js
 * Лёгкий Telegram-бот для Cookie Code (без внешних зависимостей).
 *
 * Возможности:
 *  - sendMessage(text)   — уведомления в Telegram (tool выполнился и т.п.)
 *  - startPolling()      — long-polling getUpdates, входящие сообщения →
 *                          отдаются в onMessage(chatId, text)
 *  - stopPolling()       — остановка опроса
 *  - getStatus()         — текущее состояние
 *
 * Токен и chat_id берутся из настроек Cookie Code (cuckoo-settings.json):
 *   telegramBotToken, telegramChatId, telegramEnabled
 *
 * Использует global fetch (Node 18+/Electron), без npm-зависимостей.
 */
const API_BASE = 'https://api.telegram.org';

class TelegramBot {
  constructor() {
    this.token = '';
    this.chatId = '';
    this.polling = false;
    this.offset = 0;
    this.pollTimer = null;
    this.onMessage = null;   // (chatId, text, msg) => void
    this.onCallback = null;  // (chatId, data, cbq) => void
    this.onLog = null;       // (level, ...args) => void
    this._lastError = null;
    this._pollDelayMs = 2000; // пауза при ошибке/пустом ответе
  }

  _log(level, ...args) {
    if (typeof this.onLog === 'function') {
      try { this.onLog(level, ...args); } catch (_) {}
    }
  }

  /** Настроить токен/chat_id. Возвращает true, если параметры валидны. */
  configure(token, chatId) {
    this.token = String(token || '').trim();
    this.chatId = String(chatId || '').trim();
    return this.isConfigured();
  }

  isConfigured() {
    return !!this.token && !!this.chatId;
  }

  _apiUrl(method) {
    return API_BASE + '/bot' + this.token + '/' + method;
  }

  /**
   * Отправить сообщение в Telegram.
   * @param {string} text
   * @param {{chatId?: string, parseMode?: string, replyMarkup?: object}} [opts]
   * @returns {Promise<{success: boolean, error?: string, messageId?: number}>}
   */
  async sendMessage(text, opts = {}) {
    if (!this.token) return { success: false, error: 'token не задан' };
    const chatId = opts.chatId || this.chatId;
    if (!chatId) return { success: false, error: 'chat_id не задан' };

    try {
      const res = await fetch(this._apiUrl('sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: String(text || ''),
          parse_mode: opts.parseMode || undefined,
          disable_web_page_preview: true,
          reply_markup: opts.replyMarkup || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const err = (data && data.description) || ('HTTP ' + res.status);
        this._lastError = err;
        return { success: false, error: err };
      }
      this._lastError = null;
      return { success: true, messageId: data.result && data.result.message_id };
    } catch (err) {
      this._lastError = err.message;
      return { success: false, error: err.message };
    }
  }

  /**
   * Ответить на callback_query (убрать «часики» у нажатой кнопки).
   * @param {string} callbackQueryId
   * @param {{text?: string, showAlert?: boolean}} [opts]
   */
  async answerCallbackQuery(callbackQueryId, opts = {}) {
    if (!this.token) return { success: false, error: 'token не задан' };
    try {
      const res = await fetch(this._apiUrl('answerCallbackQuery'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: opts.text || undefined,
          show_alert: !!opts.showAlert,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return { success: false, error: (data && data.description) || ('HTTP ' + res.status) };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Отредактировать текст сообщения (и/или клавиатуру под ним).
   * @param {number} messageId
   * @param {string} text
   * @param {{chatId?: string, parseMode?: string, replyMarkup?: object}} [opts]
   */
  async editMessageText(messageId, text, opts = {}) {
    if (!this.token) return { success: false, error: 'token не задан' };
    const chatId = opts.chatId || this.chatId;
    if (!chatId) return { success: false, error: 'chat_id не задан' };
    try {
      const res = await fetch(this._apiUrl('editMessageText'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: String(text || ''),
          parse_mode: opts.parseMode || undefined,
          disable_web_page_preview: true,
          reply_markup: opts.replyMarkup || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return { success: false, error: (data && data.description) || ('HTTP ' + res.status) };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Короткий пинг бота: getMe. Полезно для проверки токена из UI.
   */
  async getMe() {
    if (!this.token) return { success: false, error: 'token не задан' };
    try {
      const res = await fetch(this._apiUrl('getMe'));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return { success: false, error: (data && data.description) || ('HTTP ' + res.status) };
      }
      return { success: true, username: data.result && data.result.username };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Запустить long-polling.
   * @param {(chatId: string, text: string, rawMsg: object) => void} onMessage
   * @param {(chatId: string, data: string, cbq: object) => void} [onCallback]
   */
  startPolling(onMessage, onCallback) {
    if (this.polling) {
      // Обновляем обработчики на случай повторного старта.
      this.onMessage = typeof onMessage === 'function' ? onMessage : this.onMessage;
      this.onCallback = typeof onCallback === 'function' ? onCallback : this.onCallback;
      return { success: true, already: true };
    }
    if (!this.token) return { success: false, error: 'token не задан' };
    this.onMessage = typeof onMessage === 'function' ? onMessage : null;
    this.onCallback = typeof onCallback === 'function' ? onCallback : null;
    this.polling = true;
    this._log('info', 'Telegram polling запущен');
    this._pollLoop();
    return { success: true };
  }

  stopPolling() {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this._log('info', 'Telegram polling остановлен');
    return { success: true };
  }

  async _pollLoop() {
    while (this.polling) {
      try {
        const res = await fetch(this._apiUrl('getUpdates'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offset: this.offset,
            timeout: 25,          // long-poll: держим соединение до 25с
            allowed_updates: ['message', 'callback_query'],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          this._log('warn', 'getUpdates error:', (data && data.description) || res.status);
          await this._sleep(this._pollDelayMs);
          continue;
        }
        const updates = Array.isArray(data.result) ? data.result : [];
        for (const upd of updates) {
          if (typeof upd.update_id === 'number') {
            this.offset = upd.update_id + 1;
          }

          // Нажатие inline-кнопки.
          const cbq = upd.callback_query;
          if (cbq) {
            const cbChat = String(cbq.message && cbq.message.chat && cbq.message.chat.id);
            if (this.chatId && cbChat !== this.chatId) {
              this._log('warn', 'Игнор callback из чужого чата:', cbChat);
              continue;
            }
            if (this.onCallback) {
              try { this.onCallback(cbChat, String(cbq.data || ''), cbq); } catch (e) {
                this._log('error', 'onCallback handler error:', e.message);
              }
            }
            continue;
          }

          const msg = upd.message;
          if (!msg || !msg.text) continue;
          const fromChat = String(msg.chat && msg.chat.id);
          // Принимаем только сообщения от настроенного chat_id (если он задан).
          if (this.chatId && fromChat !== this.chatId) {
            this._log('warn', 'Игнор сообщения из чужого чата:', fromChat);
            continue;
          }
          if (this.onMessage) {
            try { this.onMessage(fromChat, msg.text, msg); } catch (e) {
              this._log('error', 'onMessage handler error:', e.message);
            }
          }
        }
        // Если пусто — небольшая пауза, чтобы не долбить API.
        if (updates.length === 0) {
          await this._sleep(this._pollDelayMs);
        }
      } catch (err) {
        this._lastError = err.message;
        this._log('warn', 'getUpdates exception:', err.message);
        await this._sleep(this._pollDelayMs * 2);
      }
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => {
      this.pollTimer = setTimeout(resolve, ms);
    });
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      polling: this.polling,
      hasToken: !!this.token,
      hasChatId: !!this.chatId,
      lastError: this._lastError,
    };
  }
}

// Singleton — бот один на приложение.
const telegramBot = new TelegramBot();
module.exports = { telegramBot, TelegramBot };
