/**
 * Экспорт ответа AI в PDF / DOCX.
 *
 * PDF — нативно через скрытое BrowserWindow + webContents.printToPDF(),
 *       без внешних библиотек (только Electron).
 * DOCX — через пакет docx (парсим простой HTML в параграфы/раны/таблицы).
 *
 * Оба формата сохраняются через системный диалог (dialog.showSaveDialog)
 * с дефолтным именем «CookieCode.<ext>».
 */
const fs = require('fs');
const path = require('path');
const { BrowserWindow, dialog } = require('electron');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } = require('docx');

/**
 * Стили для PDF: совместимы с printToPDF, без внешних ресурсов.
 */
const PDF_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 14px; line-height: 1.65; color: #1a1a1a;
    margin: 0; padding: 24px 32px;
    max-width: 800px;
  }
  h1 { font-size: 24px; margin: 18px 0 10px; font-weight: 700; }
  h2 { font-size: 20px; margin: 16px 0 8px; font-weight: 700; }
  h3 { font-size: 17px; margin: 14px 0 6px; font-weight: 600; }
  h4, h5, h6 { font-size: 15px; margin: 12px 0 6px; font-weight: 600; }
  p { margin: 0 0 10px; }
  ul, ol { margin: 0 0 10px 22px; padding: 0; }
  li { margin: 2px 0; }
  pre {
    background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 6px;
    padding: 10px 12px; margin: 0 0 10px; overflow-x: auto;
    font-family: "Consolas", "Menlo", "Courier New", monospace; font-size: 12.5px;
    white-space: pre-wrap; word-break: break-word;
  }
  code {
    background: #f0f0f0; padding: 1px 5px; border-radius: 4px;
    font-family: "Consolas", "Menlo", "Courier New", monospace; font-size: 12.5px;
  }
  pre code { background: none; padding: 0; }
  table {
    border-collapse: collapse; width: 100%; margin: 0 0 12px; font-size: 13px;
  }
  th, td {
    border: 1px solid #d0d0d0; padding: 6px 10px; text-align: left; vertical-align: top;
  }
  th { background: #f5f5f5; font-weight: 600; }
  blockquote {
    border-left: 3px solid #c0c0c0; padding-left: 12px; margin: 0 0 10px; color: #555;
  }
  a { color: #2563eb; text-decoration: none; word-break: break-all; }
  img { max-width: 100%; height: auto; }
  hr { border: none; border-top: 1px solid #e0e0e0; margin: 14px 0; }
`;

/**
 * Экранирование HTML для безопасной вставки текста (в редких случаях).
 */
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Собрать полный HTML-документ для printToPDF.
 * @param {string} bodyHtml — HTML из .ds-markdown
 * @param {string} title — заголовок (для <title>)
 */
function buildPdfHtml(bodyHtml, title) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
    escapeHtml(title || 'Cookie Code') + '</title><style>' + PDF_STYLES + '</style></head><body>' +
    (bodyHtml || '') + '</body></html>';
}

/**
 * Сохранить HTML в PDF через скрытое окно + printToPDF.
 * @returns {Promise<{success: boolean, path?: string, error?: string, canceled?: boolean}>}
 */
async function exportToPdf(bodyHtml, defaultName) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showSaveDialog(win, {
    title: 'Export to PDF',
    defaultPath: defaultName || 'CookieCode.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };

  let hidden = null;
  try {
    hidden = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: false, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });

    const html = buildPdfHtml(bodyHtml, 'Cookie Code');
    // Загружаем через data URL — быстро и без временных файлов.
    await hidden.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    // Даём странице дорисоваться (шрифты, layout). Небольшая пауза достаточна для data URL.
    await new Promise((r) => setTimeout(r, 150));

    const pdfBuffer = await hidden.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      pageSize: 'A4',
    });

    fs.writeFileSync(result.filePath, pdfBuffer);
    return { success: true, path: result.filePath };
  } catch (err) {
    console.error('[Cookie Code] exportToPdf error:', err.message);
    return { success: false, error: err.message };
  } finally {
    if (hidden && !hidden.isDestroyed()) hidden.destroy();
  }
}

/**
 * Простейший HTML → docx-элементы парсер.
 * Поддерживает: h1-h6, p, ul/ol/li, pre/code, table, blockquote, br, hr.
 * Стилистика минимальная — важно сохранить структуру и текст.
 */
function parseHtmlToDocxElements(html) {
  // Регекс-парсер намеренно простой: не тянем cheerio/jsdom в main-процесс.
  const elements = [];
  const blockRe = /<(h[1-6]|p|ul|ol|pre|blockquote|table|hr)\b[^>]*>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;

  // Дополнительно разберём верхнеуровневые блоки; вложенные таблицы/списки обрабатываем рекурсивно.
  let m;
  const consumed = [];
  while ((m = blockRe.exec(html)) !== null) {
    const tag = (m[1] || 'hr').toLowerCase();
    const inner = m[2] || '';
    const raw = m[0];
    // Пропускаем вложенные блоки — они уже внутри внешних (грубый фильтр).
    const start = m.index;
    const end = start + raw.length;
    if (consumed.some(([s, e]) => start >= s && end <= e)) continue;
    consumed.push([start, end]);

    if (tag === 'hr') {
      elements.push(new Paragraph({ text: '', border: { bottom: { color: 'CCCCCC', style: BorderStyle.SINGLE, size: 6, space: 1 } } }));
      continue;
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = tag[1];
      const headingMap = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4, 5: HeadingLevel.HEADING_5, 6: HeadingLevel.HEADING_6 };
      elements.push(new Paragraph({ heading: headingMap[level], children: inlineRuns(inner) }));
      continue;
    }

    if (tag === 'p') {
      const runs = inlineRuns(inner);
      if (runs.length) elements.push(new Paragraph({ children: runs }));
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((x) => x[1]);
      for (const item of items) {
        elements.push(new Paragraph({ children: inlineRuns(item), bullet: { level: 0 } }));
      }
      continue;
    }

    if (tag === 'pre') {
      // Извлекаем текст из <code> или как есть.
      const codeMatch = inner.match(/<code\b[^>]*>([\s\S]*?)<\/code>/i);
      const codeHtml = codeMatch ? codeMatch[1] : inner;
      const codeText = decodeEntities(codeHtml.replace(/<[^>]+>/g, ''));
      const lines = codeText.replace(/\r\n/g, '\n').split('\n');
      for (const line of lines) {
        elements.push(new Paragraph({
          children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 20 })],
          shading: { fill: 'F5F5F5' },
        }));
      }
      continue;
    }

    if (tag === 'blockquote') {
      elements.push(new Paragraph({
        children: inlineRuns(inner),
        indent: { left: 400 },
        border: { left: { color: 'C0C0C0', style: BorderStyle.SINGLE, size: 12, space: 6 } },
      }));
      continue;
    }

    if (tag === 'table') {
      const table = parseTableToDocx(inner);
      if (table) elements.push(table);
      continue;
    }
  }

  // Если ни одного блока не нашли — весь текст как один абзац.
  if (elements.length === 0) {
    const text = decodeEntities(String(html || '').replace(/<[^>]+>/g, '')).trim();
    if (text) elements.push(new Paragraph({ text }));
  }

  return elements;
}

/**
 * Разбор inline-HTML в массив TextRun (bold/italic/code/br/ссылки).
 */
function inlineRuns(html) {
  const runs = [];
  const re = /<(strong|b|em|i|code|a|br)\b([^>]*)>([\s\S]*?)<\/\1>|<br\s*\/?>/gi;
  let last = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    const before = html.slice(last, m.index);
    if (before) pushText(runs, decodeEntities(before.replace(/<[^>]+>/g, '')));
    last = m.index + m[0].length;

    if (m[0].toLowerCase().startsWith('<br')) {
      runs.push(new TextRun({ break: 1 }));
      continue;
    }
    const tag = m[1].toLowerCase();
    const inner = decodeEntities(m[3].replace(/<[^>]+>/g, ''));
    if (tag === 'strong' || tag === 'b') pushText(runs, inner, { bold: true });
    else if (tag === 'em' || tag === 'i') pushText(runs, inner, { italics: true });
    else if (tag === 'code') pushText(runs, inner, { font: 'Consolas', size: 20, shading: { fill: 'F0F0F0' } });
    else if (tag === 'a') pushText(runs, inner);
  }
  const tail = html.slice(last);
  if (tail) pushText(runs, decodeEntities(tail.replace(/<[^>]+>/g, '')));
  return runs;
}

function pushText(runs, text, opts) {
  if (!text) return;
  runs.push(new TextRun({ text, ...(opts || {}) }));
}

/**
 * Разбор <table> → docx Table (минимальный: строки/ячейки, заголовок — жирный).
 */
function parseTableToDocx(inner) {
  const rows = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((x) => x[1]);
  if (!rows.length) return null;
  const docRows = rows.map((rowHtml) => {
    const cells = [...rowHtml.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
    const docCells = cells.map((c) => {
      const isHeader = c[1].toLowerCase() === 'th';
      const cellHtml = c[2];
      const runs = inlineRuns(cellHtml);
      if (isHeader && runs.length) {
        // Заголовочные ячейки — жирным
        for (const r of runs) { try { r.bold = true; } catch (_) {} }
      }
      return new TableCell({
        children: [new Paragraph({ children: runs.length ? runs : [new TextRun({ text: '' })] })],
      });
    });
    return new TableRow({ children: docCells });
  });
  return new Table({ rows: docRows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Сохранить HTML в DOCX.
 */
async function exportToDocx(bodyHtml, defaultName) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showSaveDialog(win, {
    title: 'Export to DOCX',
    defaultPath: defaultName || 'CookieCode.docx',
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };

  try {
    const elements = parseHtmlToDocxElements(bodyHtml);
    const doc = new Document({
      creator: 'Cookie Code',
      title: 'Cookie Code',
      sections: [{ properties: {}, children: elements }],
    });
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, path: result.filePath };
  } catch (err) {
    console.error('[Cookie Code] exportToDocx error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Точка входа: экспорт ответа.
 * @param {{format: 'pdf'|'docx', html: string, defaultName?: string}} payload
 */
async function exportChat(payload) {
  const format = String(payload && payload.format || '').toLowerCase();
  const html = String(payload && payload.html || '');
  const defaultName = String(payload && payload.defaultName || 'CookieCode');
  if (!html.trim()) return { success: false, error: 'Пустой HTML ответа' };

  if (format === 'pdf') return exportToPdf(html, defaultName + '.pdf');
  if (format === 'docx') return exportToDocx(html, defaultName + '.docx');
  return { success: false, error: 'Неизвестный формат: ' + format };
}

module.exports = { exportChat };
