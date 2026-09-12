/**
 * IPC 处理器注册（渲染进程 → 主进程）
 * 多窗口版：按 event.sender 路由到对应窗口的 profile 上下文。
 */
const { app, dialog, ipcMain, Notification, shell } = require('electron');
const { exec } = require('child_process');

const windowState = require('./window');
const profileManager = require('./profile-manager');
const { toolRegistry, jsRunner } = require('./tool-registry');
const { initProject } = require('./project-context');
const { isDangerous } = require('./dangerous-commands');
const settingsStore = require('./settings-store');
const chatExport = require('./chat-export');
const { decodeOutput, normalizeCommand } = require('../../tools/decodeOutput');
const gitDiff = require('./git-diff');

function registerIpcHandlers() {
  // 初始化项目
  ipcMain.handle('init-project', async (event, { skipPrompt = false } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    return initProject(skipPrompt, ctx);
  });

  // 列出会话
  ipcMain.handle('list-sessions', async (event) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const store = ctx ? ctx.sessionStore : null;
    if (!store || !store.state.selectedProjectDir) {
      return { success: true, sessions: [] };
    }
    const all = store.readSessionStore();
    const sessions = Object.keys(all).filter(id => all[id] === store.state.selectedProjectDir);
    return { success: true, sessions };
  });

  // 列出项目文件（用于 @ 文件提及自动补全）
  // 返回 { success, files: [{ rel, abs }] }，rel 为相对 projectDir 的路径，abs 为绝对路径。
  ipcMain.handle('list-project-files', async (event, { query = '' } = {}) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const store = ctx ? ctx.sessionStore : null;
    const projectDir = store ? store.state.selectedProjectDir : null;
    if (!projectDir) return { success: true, files: [] };

    try {
      const path = require('path');
      const { buildGlobArgs, runRipgrep } = require('../../tools/GlobToolNew');
      const safeQuery = String(query || '').replace(/[\\*?\[\]]/g, '');
      const pattern = safeQuery ? '**/*' + safeQuery + '*' : '**/*';
      const args = buildGlobArgs({ pattern });
      const { stdout } = await runRipgrep(args, projectDir);
      const files = stdout
        .split(/\r?\n/)
        .map((p) => p.replace(/\\/g, '/').replace(/^\.\//, ''))
        .filter((p) => p.length > 0)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 100)
        .map((rel) => ({ rel, abs: path.join(projectDir, rel) }));
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message, files: [] };
    }
  });

  // 导航到会话
  ipcMain.handle('navigate-session', async (event, { sessionId }) => {
    if (!sessionId) return { success: false, error: '缺少会话ID' };
    const ctx = windowState.getContextByWebContents(event.sender);
    const win = ctx ? ctx.win : null;
    if (!win || win.isDestroyed()) return { success: false, error: '窗口已关闭' };
    // 按当前 provider 拼会话 URL（智谱 cid=、DeepSeek /chat/s/、Claude /chat/）
    let url = null;
    try {
      const { getProviderByUrl } = require('../providers');
      const provider = getProviderByUrl(win.webContents.getURL());
      if (provider && typeof provider.sessionUrlBase === 'string' && provider.sessionUrlBase) {
        url = provider.sessionUrlBase + sessionId;
      }
    } catch (_) { /* 回退 DeepSeek */ }
    if (!url) url = 'https://chat.deepseek.com/a/chat/s/' + sessionId;
    try {
      await win.webContents.loadURL(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 执行命令
  ipcMain.handle('execute-command', async (event, { command, id }) => {
    if (!command || typeof command !== 'string') {
      return { id, success: false, error: '无效的命令' };
    }
    const trimmed = normalizeCommand(command.trim());
    if (!trimmed) return { id, success: false, error: '命令为空' };

    const ctx = windowState.getContextByWebContents(event.sender);
    const win = ctx ? ctx.win : windowState.getMainWindow();
    const store = ctx ? ctx.sessionStore : null;
    const selectedDir = store ? store.state.selectedProjectDir : null;

    const dangerWarning = isDangerous(trimmed) ? '\n\n⚠️ 警告：此命令可能存在风险，请谨慎确认！' : '';
    const result = await dialog.showMessageBox(win, {
      type: isDangerous(trimmed) ? 'warning' : 'question',
      buttons: ['取消', '确认执行'],
      defaultId: 0,
      cancelId: 0,
      title: '确认执行命令',
      message: '将执行以下命令：',
      detail: trimmed + dangerWarning,
    });
    if (result.response !== 1) {
      return { id, success: false, error: '用户取消了执行', canceled: true };
    }
    return new Promise((resolve) => {
      const child = exec(
        trimmed,
        {
          cwd: selectedDir || process.env.USERPROFILE || app.getPath('home'),
          timeout: 30000,
          maxBuffer: 1024 * 1024,
          encoding: 'buffer',
        },
        (error, stdout, stderr) => {
          resolve({
            id,
            success: !error,
            stdout: decodeOutput(stdout),
            stderr: decodeOutput(stderr),
            error: error ? error.message : null,
          });
        }
      );
    });
  });

  // 执行工具
  ipcMain.handle('execute-tool', async (event, { toolName, params, callId }) => {
    const ctx = windowState.getContextByWebContents(event.sender);
    const store = ctx ? ctx.sessionStore : null;
    const selectedDir = store ? store.state.selectedProjectDir : null;
    try {
      const result = await toolRegistry.execute(toolName, { ...params, projectDir: selectedDir });
      // Уведомление в Telegram (не блокирует ответ).
      try {
        const preview = result.success
          ? (typeof result.data === 'string' ? result.data : '')
          : (result.error || '');
        const exitMatch = String(preview).match(/\[exit code:\s*(-?\d+)\]/);
        const hasBadExit = !!(exitMatch && exitMatch[1] !== '0');
        const ok = !!result.success && !hasBadExit;
        require('../../botsrc').notifyToolResult(toolName, ok, { args: params, preview });
      } catch (_) {}
      return { callId, success: result.success, data: result.data, error: result.error };
    } catch (err) {
      try {
        require('../../botsrc').notifyToolResult(toolName, false, err.message);
      } catch (_) {}
      return { callId, success: false, error: err.message };
    }
  });

  // AI 回复完成时：窗口已聚焦则不打扰；否则弹通知并让任务栏/Dock 闪烁
  ipcMain.handle('show-ai-notification', async (event) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const win = ctx ? ctx.win : windowState.getMainWindow();

      if (win && !win.isDestroyed() && win.isFocused()) {
        // 用户正在查看该窗口，不弹通知、不闪烁
        return { success: true, skipped: true, reason: 'window-focused' };
      }

      if (win && !win.isDestroyed()) {
        let windowName = 'Cookie Code';
        if (ctx && ctx.profileId) {
          const profile = profileManager.getProfileById(ctx.profileId);
          if (profile && profile.name) windowName = profile.name;
        }

        const lang = settingsStore.getSetting('language') === 'en' ? 'en' : 'ru';
        const notifText = {
          ru: { title: 'AI завершил задачу', body: 'AI завершил ответ' },
          en: { title: 'AI task completed', body: 'AI has finished responding' },
        }[lang];

        const notification = new Notification({
          title: windowName + ' - ' + notifText.title,
          body: notifText.body,
        });
        notification.show();

        win.flashFrame(true);
        win.once('focus', () => {
          if (!win.isDestroyed()) win.flashFrame(false);
        });
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Экстренная остановка активных дочерних процессов (кнопка Kill)
  ipcMain.handle('kill-process', async () => {
    try {
      const { processManager } = require('./process-manager');
      const result = await processManager.killAll();
      return { success: true, count: result.count };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // 执行 JS 脚本
  ipcMain.handle('execute-js', async (event, { code, callId }) => {
    if (!code || typeof code !== 'string') {
      return { callId, success: false, error: '无效的 JS 代码' };
    }
    const ctx = windowState.getContextByWebContents(event.sender);
    const store = ctx ? ctx.sessionStore : null;
    const selectedDir = store ? store.state.selectedProjectDir : null;
    try {
      const result = await jsRunner.run(code, selectedDir);
      return { callId, ...result };
    } catch (err) {
      return { callId, success: false, error: err.message };
    }
  });

  // 站点原生发送：向聚焦输入框注入真实级 Enter（智谱只响应 isTrusted=true 的输入，合成事件免疫）
  ipcMain.handle('chat-send-enter', async (event) => {
    const sender = event.sender;
    if (!sender || sender.isDestroyed()) return false;
    try {
      sender.sendInputEvent({ type: 'keyDown', keyCode: 'Return', key: 'Enter' });
      sender.sendInputEvent({ type: 'char', keyCode: 'Return', key: '\r' });
      sender.sendInputEvent({ type: 'keyUp', keyCode: 'Return', key: 'Enter' });
      return true;
    } catch (err) {
      console.error('[Cookie Code] ❌ 原生 Enter 发送失败:', err.message);
      return false;
    }
  });

  // ========== Cookie Code 用户设置 (settings.json) ==========
  ipcMain.handle('cuckoo-settings-get-all', async () => {
    return settingsStore.readSettings();
  });

  ipcMain.handle('cuckoo-settings-set', async (_event, { key, value }) => {
    if (!key || typeof key !== 'string') {
      return { success: false, error: '无效的 key' };
    }
    const result = settingsStore.setSetting(key, value);
    if (!result) return { success: false, error: '写入失败' };
    return { success: true, settings: result };
  });

  // ========== Telegram-бот (botsrc/) ==========
  ipcMain.handle('telegram-apply', async () => {
    try {
      const bot = require('../../botsrc');
      const status = await bot.applySettings();
      return { success: true, status };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('telegram-status', async () => {
    try {
      const bot = require('../../botsrc');
      return { success: true, status: bot.getStatus() };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('telegram-ping', async () => {
    try {
      const bot = require('../../botsrc');
      return await bot.ping();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('telegram-test', async () => {
    try {
      const bot = require('../../botsrc');
      return await bot.testSend();
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Ответ AI → в Telegram (для просмотра с телефона).
  ipcMain.handle('telegram-notify-ai', async (_event, { text } = {}) => {
    try {
      const bot = require('../../botsrc');
      return await bot.notifyAIResponse(text);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ========== Экспорт ответа AI в PDF / DOCX ==========
  ipcMain.handle('cuckoo-chat-export', async (_event, payload) => {
    try {
      console.log('[Cookie Code] chat-export: получен запрос, format =', payload && payload.format, ', html.length =', payload && payload.html && payload.html.length);
      const result = await chatExport.exportChat(payload || {});
      console.log('[Cookie Code] chat-export: результат =', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('[Cookie Code] chat-export error:', err.message, err.stack);
      return { success: false, error: err.message };
    }
  });

  // ========== Git diff (панель «Изменения») ==========
  // Список изменённых файлов в текущем проекте (git status).
  ipcMain.handle('git-status', async (event) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      return await gitDiff.getStatus(projectDir);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  // Unified diff одного файла.
  ipcMain.handle('git-diff-file', async (event, { filePath, status } = {}) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      if (!filePath) return { success: false, reason: 'filePath is required' };
      return await gitDiff.getFileDiff(projectDir, filePath, status);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  // ========== Git history (вкладка «История») ==========
  ipcMain.handle('git-log', async (event, { limit } = {}) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      return await gitDiff.getLog(projectDir, limit || 20);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('git-commit-files', async (event, { hash } = {}) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      return await gitDiff.getCommitFiles(projectDir, hash);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('git-commit-file-diff', async (event, { hash, filePath } = {}) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      return await gitDiff.getCommitFileDiff(projectDir, hash, filePath);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  ipcMain.handle('git-commit-diff', async (event, { hash } = {}) => {
    try {
      const ctx = windowState.getContextByWebContents(event.sender);
      const projectDir = ctx && ctx.sessionStore && ctx.sessionStore.state.selectedProjectDir;
      if (!projectDir) return { success: false, reason: 'git не найден: проект не инициализирован' };
      return await gitDiff.getCommitDiff(projectDir, hash);
    } catch (err) {
      return { success: false, reason: err.message };
    }
  });

  // Открыть файл настроек (cuckoo-settings.json) системным редактором.
  // Если файла ещё нет — создаём его с дефолтами, чтобы редактор не ругался.
  ipcMain.handle('cuckoo-settings-open-file', async () => {
    try {
      const fs = require('fs');
      const file = settingsStore.getSettingsPath();
      if (!fs.existsSync(file)) {
        settingsStore.writeSettings(settingsStore.readSettings());
      }
      const errMsg = await shell.openPath(file);
      if (errMsg) return { success: false, error: errMsg };
      return { success: true, path: file };
    } catch (err) {
      console.error('[Cookie Code] 打开 settings.json 失败:', err.message);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerIpcHandlers };
