/**
 * Декорация блоков \`\`\`cuckoo ... \`\`\` в AI-ответах DeepSeek.
 * Оборачивает код в раскрывающийся блок в стиле dsh-web-dev:
 *   ▼  {Иконка}  {Название инструмента}   [файл или краткая сводка]
 *
 * Работает поверх DOM DeepSeek (реплика .ds-message > .ds-markdown).
 * При перерисовке React observer вызывает decorate() повторно — идемпотентно.
 */

const BLOCK_CLASS = 'cuckoo-tool-block';
const WRAPPED_ATTR = 'data-cuckoo-tool-wrapped';

/**
 * Определение инструмента по первой строке JS-кода.
 * Возвращает { id, label, icon, file } — что показать в заголовке.
 */
function detectTool(code) {
  const firstLine = (code.split('\n').find(l => l.trim()) || '').trim();

  // Пытаемся найти самую частую функцию из набора инструментов
  const patterns = [
    { id: 'read',   re: /await\s+read\s*\(|await\s+readLines\s*\(/,  label: 'Read',   icon: '📖' },
    { id: 'write',  re: /await\s+write\s*\(/,                            label: 'Write',  icon: '📝' },
    { id: 'edit',   re: /await\s+edit\s*\(/,                             label: 'Edit',   icon: '✏️' },
    { id: 'glob',   re: /await\s+glob\s*\(/,                             label: 'Glob',   icon: '🔍' },
    { id: 'grep',   re: /await\s+grep\s*\(/,                             label: 'Grep',   icon: '🔎' },
    { id: 'bash',   re: /await\s+bash\s*\(/,                             label: 'Bash',   icon: '⌘' },
    { id: 'pwsh',   re: /await\s+pwsh\s*\(/,                             label: 'PowerShell', icon: '⌘' },
    { id: 'delete', re: /await\s+deleteFile\s*\(/,                       label: 'Delete', icon: '🗑️' },
    { id: 'todo',   re: /await\s+todoWrite\s*\(/,                        label: 'Todo',   icon: '☑️' },
    { id: 'fetch',  re: /await\s+webFetch\s*\(/,                         label: 'WebFetch', icon: '🌐' },
    { id: 'mcp',    re: /await\s+mcpCall\s*\(/,                          label: 'MCP',    icon: '🔌' },
    { id: 'browser',re: /await\s+(openBrowserWindow|injectJS)\s*\(/,     label: 'Browser',icon: '🌏' },
    { id: 'skill',  re: /await\s+(skillList|skillLoad|skillExecute)\s*\(/, label: 'Skill', icon: '🧩' },
    { id: 'mysql',  re: /await\s+mysql\s*\(/,                            label: 'MySQL',  icon: '🗄️' },
  ];
  for (const p of patterns) {
    if (p.re.test(code)) {
      return { id: p.id, label: p.label, icon: p.icon, file: extractFileHint(code, p.id) };
    }
  }
  return { id: 'js', label: 'JS', icon: '⌨️', file: '' };
}

/**
 * Краткая подсказка «файла» для заголовка (первый строковый аргумент).
 */
function extractFileHint(code, toolId) {
  try {
    const m = code.match(/await\s+\w+\s*\(\s*["'\`]([^"'\`]+)["'\`]/);
    if (m && m[1]) {
      const s = m[1];
      // Обрезаем длинные пути — оставляем последние 2 сегмента
      const parts = s.split(/[\\/]/);
      if (parts.length > 2) return parts.slice(-2).join('/');
      return s;
    }
  } catch (_) {}
  return '';
}

/**
 * Обернуть все ещё не обработанные .md-code-block (язык cuckoo) в наш контейнер.
 * @param {HTMLElement} scope — корень реплики (.ds-markdown)
 */
function decorate(scope) {
  if (!scope) return;
  const codeBlocks = scope.querySelectorAll('.md-code-block');
  codeBlocks.forEach((block) => {
    if (block.getAttribute(WRAPPED_ATTR) === '1') return;
    // Определяем язык
    let lang = block.getAttribute('data-language') || '';
    if (!lang) {
      const banner = block.querySelector('.md-code-block-banner');
      if (banner) {
        const spans = banner.querySelectorAll('span');
        for (const s of spans) {
          if (s.closest('button')) continue;
          const t = (s.textContent || '').trim().toLowerCase();
          if (/^[a-z]+$/.test(t)) { lang = t; break; }
        }
      }
    }

    // Извлекаем код
    const pre = block.querySelector('pre code') || block.querySelector('pre');
    const code = pre ? (pre.textContent || '') : '';
    if (!code.trim()) return;

    // Решаем, «наш» ли это блок:
    // - язык в баннере `cuckoo` (некоторые рендереры оставляют как есть), ИЛИ
    // - язык `js`/`javascript` и в коде есть вызовы tool-функций (await read/write/edit/...).
    // DeepSeek показывает `cuckoo` как `js`, потому что языка cuckoo у него нет.
    const TOOL_CALL_RE = /await\s+(read|readLines|write|edit|glob|grep|bash|pwsh|todoWrite|deleteFile|webFetch|mcpCall|openBrowserWindow|injectJS|mysql|skillList|skillLoad|skillExecute)\s*\(/;
    const hasToolCall = TOOL_CALL_RE.test(code);
    const langIsCuckoo = lang === 'cuckoo';
    const langIsJs = lang === 'js' || lang === 'javascript' || !lang;
    if (!langIsCuckoo && !(langIsJs && hasToolCall)) return;

    // Собираем контейнер
    const meta = detectTool(code);
    const wrapper = document.createElement('div');
    wrapper.className = BLOCK_CLASS;
    wrapper.setAttribute('data-tool-id', meta.id);
    wrapper.setAttribute('data-expanded', 'false');

    const header = document.createElement('div');
    header.className = 'cuckoo-tool-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.innerHTML =
      '<span class="cuckoo-tool-chevron">▸</span>' +
      '<span class="cuckoo-tool-icon">' + meta.icon + '</span>' +
      '<span class="cuckoo-tool-label">' + escapeHtml(meta.label) + '</span>' +
      (meta.file ? '<span class="cuckoo-tool-sep">·</span><span class="cuckoo-tool-file">' + escapeHtml(meta.file) + '</span>' : '');

    // Скрываем встроенный баннер DeepSeek (копировать/скачать)
    const nativeBanner = block.querySelector('.md-code-block-banner-wrap');
    if (nativeBanner) nativeBanner.style.display = 'none';

    // Переносим блок в обёртку
    block.parentNode.insertBefore(wrapper, block);
    wrapper.appendChild(header);
    wrapper.appendChild(block);
    block.setAttribute(WRAPPED_ATTR, '1');
    block.style.display = 'none'; // по умолчанию свёрнуто

    // Обработчик клика
    header.addEventListener('click', () => {
      const expanded = wrapper.getAttribute('data-expanded') === 'true';
      wrapper.setAttribute('data-expanded', expanded ? 'false' : 'true');
      block.style.display = expanded ? 'none' : '';
      const chev = header.querySelector('.cuckoo-tool-chevron');
      if (chev) chev.textContent = expanded ? '▸' : '▾';
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Запустить собственный MutationObserver, который:
 * - следит за появлением новых .md-code-block в чате,
 * - автоматически оборачивает те, что содержат вызовы tool-функций.
 * Нужен потому, что основной observer.js вызывает decorate() однократно
 * и может «промахнуться» при перерисовке React.
 */
let watchStarted = false;
function startWatch() {
  if (watchStarted) return;
  watchStarted = true;
  window.__cuckooWatchStarted = true;

  // Основной путь: MutationObserver.
  const runAll = () => {
    try {
      const scopes = document.querySelectorAll('.ds-markdown');
      scopes.forEach((s) => { try { decorate(s); } catch (_) {} });
    } catch (_) {}
  };

  if (document.body) {
    const mo = new MutationObserver(runAll);
    mo.observe(document.body, { childList: true, subtree: true });
    runAll();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      const mo = new MutationObserver(runAll);
      mo.observe(document.body, { childList: true, subtree: true });
      runAll();
    }, { once: true });
  }

  // Дополнительно: polling каждые 700ms на случай виртуализации/SPA,
  // когда MutationObserver не ловит перерисовку (DeepSeek virtual list).
  setInterval(runAll, 700);

  console.log('[Cuckoo Code] tool-render watch started (mutation + poll)');
}

module.exports = { decorate, detectTool, startWatch };
