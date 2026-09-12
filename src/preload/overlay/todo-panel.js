/**
 * Плавающее окошко «Задачи» слева.
 * - Появляется автоматически, когда есть задачи; скрывается, когда список пуст.
 * - Перетаскивается за заголовок.
 * - Данные: main-процесс (todo-get) + пуш todo-updated.
 */

const PANEL_ID = 'cuckoo-todo-panel';
const LIST_ID = 'cuckoo-todo-list';
const COUNTER_ID = 'cuckoo-todo-counter';
const DRAG_ID = 'cuckoo-todo-drag';
const POS_KEY = 'cuckoo-todo-pos';
const TAB_ID = 'cuckoo-todo-tab';
const TAB_COUNTER_ID = 'cuckoo-todo-tab-counter';

const CLOSE_ID = 'cuckoo-todo-close';
const STATUS_ICON = { pending: '☐', in_progress: '◔', completed: '☑' };

// Пользователь закрыл окно вручную — не показывать до новых изменений
let userClosed = false;
let currentTodos = [];

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function updateTab(items, done, show) {
  const tab = document.getElementById(TAB_ID);
  const tabCounter = document.getElementById(TAB_COUNTER_ID);
  if (!tab) return;
  if (tabCounter) tabCounter.textContent = done + '/' + items.length;
  tab.classList.toggle('cuckoo-hidden', !show);
}

/** Отрендерить список задач. */
function render(todos) {
  const panel = document.getElementById(PANEL_ID);
  const list = document.getElementById(LIST_ID);
  const counter = document.getElementById(COUNTER_ID);
  if (!panel || !list) return;

  const items = Array.isArray(todos) ? todos : [];
  currentTodos = items;
  const done = items.filter(t => t.status === 'completed').length;

  // Нет задач → прячем окно и сбрасываем флаг ручного закрытия
  if (items.length === 0) {
    panel.classList.add('cuckoo-hidden');
    list.innerHTML = '';
    if (counter) counter.textContent = '0/0';
    updateTab(items, done, false);
    userClosed = false;
    return;
  }

  // Пользователь вручную скрыл окно — ждём изменений (новых задач)
  if (counter) counter.textContent = done + '/' + items.length;

  list.innerHTML = items.map(t =>
    '<div class="cuckoo-todo-item ' + escapeHtml(t.status) + '">' +
      '<span class="cuckoo-todo-icon">' + (STATUS_ICON[t.status] || '☐') + '</span>' +
      '<span class="cuckoo-todo-text">' + escapeHtml(t.content) + '</span>' +
    '</div>'
  ).join('');

  if (done === items.length && !userClosed) {
    panel.classList.add('cuckoo-hidden');
    updateTab(items, done, true);
  } else if (userClosed) {
    panel.classList.add('cuckoo-hidden');
    updateTab(items, done, true);
  } else {
    panel.classList.remove('cuckoo-hidden');
    updateTab(items, done, false);
  }
}

/** Загрузить задачи из main и отрисовать. */
async function refresh() {
  try {
    const res = await window.electronAPI.getTodos();
    render(res && res.success ? res.todos : []);
  } catch (_) {
    render([]);
  }
}

/** Восстановить позицию из localStorage. */
function restorePosition() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return;
    const pos = JSON.parse(raw);
    if (typeof pos.left === 'number' && typeof pos.top === 'number') {
      panel.style.left = pos.left + 'px';
      panel.style.top = pos.top + 'px';
    }
  } catch (_) {}
}

/** Сделать окно перетаскиваемым за заголовок. */
function makeDraggable() {
  const panel = document.getElementById(PANEL_ID);
  const handle = document.getElementById(DRAG_ID);
  if (!panel || !handle) return;

  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  const onDown = (e) => {
    dragging = true;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  const onMove = (e) => {
    if (!dragging) return;
    let left = startLeft + (e.clientX - startX);
    let top = startTop + (e.clientY - startY);
    // Не выпускаем за пределы экрана
    left = Math.max(0, Math.min(window.innerWidth - 60, left));
    top = Math.max(0, Math.min(window.innerHeight - 40, top));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    try {
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
    } catch (_) {}
  };

  handle.addEventListener('mousedown', onDown);
}

/** Инициализация: позиция, drag, подписка, первая загрузка. */
function start() {
  restorePosition();
  makeDraggable();

  // Кнопка «×» — скрыть окно до следующего обновления задач
  const closeBtn = document.getElementById(CLOSE_ID);
  closeBtn?.addEventListener('click', () => {
    userClosed = true;
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.classList.add('cuckoo-hidden');
    const done = currentTodos.filter(t => t.status === 'completed').length;
    updateTab(currentTodos, done, currentTodos.length > 0 && done < currentTodos.length);
  });

  const tab = document.getElementById(TAB_ID);
  tab?.addEventListener('click', () => {
    const panel = document.getElementById(PANEL_ID);
    userClosed = false;
    if (panel && currentTodos.length > 0) {
      panel.classList.remove('cuckoo-hidden');
      const done = currentTodos.filter(t => t.status === 'completed').length;
      updateTab(currentTodos, done, false);
    } else {
      render(currentTodos);
    }
  });

  try {
    window.electronAPI.onTodoUpdated((data) => {
      // Сбрасываем ручное закрытие только при реальном изменении списка
      const next = JSON.stringify((data && data.todos) || []);
      const prev = JSON.stringify(currentTodos || []);
      if (next !== prev) userClosed = false;
      render(data && data.todos);
    });
  } catch (_) {}
  refresh();
}

module.exports = { start, refresh, render };
