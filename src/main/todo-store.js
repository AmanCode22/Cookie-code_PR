/**
 * Хранилище todo-задач, привязанное к окну (webContents.id).
 * Живёт в main-процессе; переживает перезагрузку страницы, но не перезапуск приложения.
 */

// senderId -> [{ id, content, status }]
const byWindow = new Map();
let idCounter = 0;

function nextId() {
  return 'todo_' + Date.now().toString(36) + '_' + (++idCounter);
}

function getRaw(senderId) {
  return byWindow.get(senderId) || [];
}

/** Получить список задач окна (копия). */
function getList(senderId) {
  return getRaw(senderId).map(t => ({ id: t.id, content: t.content, status: t.status }));
}

/** Полностью заменить список задач. Каждой задаче присваивается id. */
function setList(senderId, todos) {
  const list = todos.map(t => ({
    id: t.id || nextId(),
    content: String(t.content || '').trim(),
    status: t.status,
  }));
  byWindow.set(senderId, list);
  return getList(senderId);
}

/** Изменить одну задачу по id. */
function editTask(senderId, id, patch) {
  const list = getRaw(senderId);
  const task = list.find(t => t.id === id);
  if (!task) return { ok: false, error: 'task not found: ' + id };
  if (patch && patch.content !== undefined) {
    const c = String(patch.content || '').trim();
    if (!c) return { ok: false, error: 'content must be a non-empty string' };
    task.content = c;
  }
  if (patch && patch.status !== undefined) {
    if (!['pending', 'in_progress', 'completed'].includes(patch.status)) {
      return { ok: false, error: 'invalid status: ' + patch.status };
    }
    task.status = patch.status;
  }
  return { ok: true };
}

/** Удалить задачу по id. */
function deleteTask(senderId, id) {
  const list = getRaw(senderId);
  const idx = list.findIndex(t => t.id === id);
  if (idx === -1) return { ok: false, error: 'task not found: ' + id };
  list.splice(idx, 1);
  return { ok: true };
}

/** Очистить задачи окна. */
function clear(senderId) {
  byWindow.delete(senderId);
}

module.exports = { getList, setList, editTask, deleteTask, clear };
