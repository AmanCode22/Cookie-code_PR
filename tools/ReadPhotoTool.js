const { Tool, ToolResult } = require('./ToolRegistry');
const fs = require('fs');
const path = require('path');

/**
 * Инструмент вставки изображения в чат.
 * Читает файл изображения с диска и вставляет его в поле ввода чата
 * через буфер обмена (clipboard → Ctrl+V).
 */
class ReadPhotoTool extends Tool {
  constructor() {
    super(
      'read_photo',
      '从文件中将图片插入聊天输入框并发送。' +
      '支持的格式：png、jpg、jpeg、gif、webp、bmp。' +
      '接受文件的绝对路径或相对路径。',
      {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '图片文件的绝对路径或相对路径'
          },
          caption: {
            type: 'string',
            description: '可选的文字说明，将在插入图片前填入输入框',
            default: ''
          },
          send: {
            type: 'boolean',
            description: '插入图片后是否发送消息（按 Enter）。默认为 true。',
            default: true
          }
        },
        required: ['file_path'],
        additionalProperties: false
      },
      null
    );
  }

  getPromptSection() {
    return {
      name: 'tool:read_photo',
      order: 106,
      text: '使用 read_photo 可将本地图片文件插入聊天输入框并发送，让 AI 直接查看图片内容。' +
        '当用户要求分析、描述或处理某张图片时，优先使用 read_photo 将其发送到聊天，而不是尝试用 file_read 读取二进制内容。' +
        '支持的格式：png、jpg、jpeg、gif、webp、bmp，文件大小不超过 20 MB。' +
        '参数：file_path（必填，图片路径），caption（选填，附加文字说明），send（选填，默认 true，发送后 AI 即可看到图片）。',
    };
  }
  /**
   * 执行将图片插入聊天。
   * @param {Object} params
   * @param {string} params.file_path
   * @param {string} [params.caption]
   * @param {boolean} [params.send]
   * @param {string} [params.projectDir]
   * @param {Function} [params.pasteImage] - callback (filePath, caption, send) => Promise<{success, error?}>
   * @returns {Promise<ToolResult>}
   */
  async execute(params) {
    const {
      file_path,
      caption = '',
      send = true,
      projectDir,
      pasteImage,
    } = params || {};

    if (!file_path || typeof file_path !== 'string') {
      return ToolResult.error('Параметр file_path обязателен.');
    }

    // Проверяем доступность callback вставки (предоставляется из главного процесса)
    if (typeof pasteImage !== 'function') {
      return ToolResult.error(
        'Инструмент read_photo недоступен в текущем контексте (отсутствует pasteImage callback).'
      );
    }

    // Нормализуем путь
    const normalized = file_path.replace(/\//g, path.sep);
    let resolved = normalized;
    if (!path.isAbsolute(normalized)) {
      if (projectDir) {
        resolved = path.join(projectDir, normalized);
      } else {
        resolved = path.resolve(normalized);
      }
    }

    // Проверяем существование файла
    if (!fs.existsSync(resolved)) {
      return ToolResult.error(`Файл не найден: ${resolved}`);
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return ToolResult.error(`Указанный путь не является файлом: ${resolved}`);
    }

    // Проверяем расширение
    const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return ToolResult.error(
        `Неподдерживаемый формат файла: ${ext}. ` +
        `Допустимы: ${[...ALLOWED_EXT].join(', ')}`
      );
    }

    // Ограничение размера — 20 МБ
    const MAX_SIZE = 20 * 1024 * 1024;
    if (stat.size > MAX_SIZE) {
      return ToolResult.error(
        `Файл слишком большой (${(stat.size / 1024 / 1024).toFixed(1)} МБ). ` +
        'Максимальный размер — 20 МБ.'
      );
    }

    try {
      const result = await pasteImage(resolved, String(caption || ''), !!send);
      if (!result || !result.success) {
        return ToolResult.error(
          'Не удалось вставить изображение в чат: ' + (result && result.error ? result.error : 'неизвестная ошибка')
        );
      }
      return ToolResult.success(
        `Изображение вставлено в чат: ${path.basename(resolved)}` +
        (send ? ' (отправлено)' : ' (не отправлено)')
      );
    } catch (err) {
      return ToolResult.error(`Ошибка при вставке изображения: ${err.message}`);
    }
  }
}

module.exports = { ReadPhotoTool };
