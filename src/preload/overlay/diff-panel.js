/**
 * Панель «Изменения» (git diff).
 * Данные берутся из git через IPC (git-status / git-diff-file).
 * Клик по файлу открывает отдельное модальное окно с unified diff.
 */
const { showToast } = require('./ui');

const PANEL_ID = 'cuckoo-diff-panel';
const LIST_ID = 'cuckoo-diff-list';
const VIEWER_ID = 'cuckoo-diff-viewer';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

/** Ярлык статуса файла. */
function statusLabel(status) {
  switch (status) {
    case 'modified': return { txt: 'M', cls: 'modified' };
    case 'added': return { txt: 'A', cls: 'added' };
    case 'deleted': return { txt: 'D', cls: 'deleted' };
    case 'renamed': return { txt: 'R', cls: 'renamed' };
    case 'untracked': return { txt: 'U', cls: 'untracked' };
    default: return { txt: '?', cls: 'changed' };
  }
}

/** Загрузить список изменённых файлов. */
async function renderDiffList() {
  const list = document.getElementById(LIST_ID);
  if (!list) return;
  list.innerHTML = '<div class="cuckoo-session-empty">Загрузка…</div>';
  try {
    const res = await window.electronAPI.gitStatus();
    if (!res || !res.success) {
      list.innerHTML = '<div class="cuckoo-session-empty">' + escapeHtml(res && res.reason || 'git не найден') + '</div>';
      return;
    }
    const files = res.files || [];
    if (files.length === 0) {
      list.innerHTML = '<div class="cuckoo-session-empty">Нет изменённых файлов</div>';
      return;
    }
    list.innerHTML = files.map(f => {
      const s = statusLabel(f.status);
      return '<div class="cuckoo-diff-file" data-path="' + escapeHtml(f.path) + '" data-status="' + escapeHtml(f.status) + '" title="' + escapeHtml(f.path) + '">' +
        '<span class="cuckoo-diff-file-badge ' + s.cls + '">' + s.txt + '</span>' +
        '<span class="cuckoo-diff-file-path">' + escapeHtml(f.path) + '</span>' +
      '</div>';
    }).join('');

    list.querySelectorAll('.cuckoo-diff-file').forEach(el => {
      el.addEventListener('click', () => {
        list.querySelectorAll('.cuckoo-diff-file').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        openDiffViewer(el.dataset.path, el.dataset.status);
      });
    });
  } catch (err) {
    list.innerHTML = '<div class="cuckoo-session-empty">Ошибка: ' + escapeHtml(err.message || err) + '</div>';
  }
}

/** Отрендерить unified diff в HTML (подсветка +/-/@@). */
function renderUnifiedDiff(diffText) {
  if (!diffText || !diffText.trim()) {
    return '<div class="cuckoo-diff-empty">Пустой diff</div>';
  }
  const lines = diffText.split(/\r?\n/);
  const html = lines.map(line => {
    let cls = 'ctx';
    if (line.startsWith('+++') || line.startsWith('---')) cls = 'meta';
    else if (line.startsWith('@@')) cls = 'hunk';
    else if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('similarity') || line.startsWith('rename ')) cls = 'meta';
    else if (line.startsWith('+')) cls = 'add';
    else if (line.startsWith('-')) cls = 'del';
    return '<div class="cuckoo-diff-line ' + cls + '"><span class="cuckoo-diff-text">' + escapeHtml(line) + '</span></div>';
  }).join('');
  return '<pre class="cuckoo-diff-code">' + html + '</pre>';
}

/** Открыть отдельное модальное окно с diff файла. */
async function openDiffViewer(filePath, status) {
  const viewer = document.getElementById(VIEWER_ID);
  if (!viewer) return;
  const titleEl = viewer.querySelector('#cuckoo-diff-viewer-title');
  const bodyEl = viewer.querySelector('#cuckoo-diff-viewer-body');
  if (titleEl) titleEl.textContent = filePath;
  if (bodyEl) bodyEl.innerHTML = '<div class="cuckoo-diff-empty">Загрузка…</div>';
  viewer.classList.remove('cuckoo-hidden');

  try {
    const res = await window.electronAPI.gitDiffFile(filePath, status);
    if (!res || !res.success) {
      bodyEl.innerHTML = '<div class="cuckoo-diff-empty">' + escapeHtml(res && res.reason || 'Не удалось получить diff') + '</div>';
      return;
    }
    bodyEl.innerHTML = renderUnifiedDiff(res.diff || '');
  } catch (err) {
    bodyEl.innerHTML = '<div class="cuckoo-diff-empty">Ошибка: ' + escapeHtml(err.message || err) + '</div>';
  }
}

/** Закрыть окно просмотра diff. */
function closeDiffViewer() {
  const viewer = document.getElementById(VIEWER_ID);
  if (viewer) viewer.classList.add('cuckoo-hidden');
}

/** Открыть панель. */
function openDiffPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel.classList.remove('cuckoo-hidden');
  renderDiffList();
}

/** Закрыть панель (и окно просмотра). */
function closeDiffPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (panel) panel.classList.add('cuckoo-hidden');
  closeDiffViewer();
}

/** Переключить видимость панели. */
function toggleDiffPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  if (panel.classList.contains('cuckoo-hidden')) {
    openDiffPanel();
  } else {
    closeDiffPanel();
  }
}

module.exports = { openDiffPanel, closeDiffPanel, toggleDiffPanel, renderDiffList, closeDiffViewer };
