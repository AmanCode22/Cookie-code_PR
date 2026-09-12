const { Tool, ToolResult } = require('./ToolRegistry');
const todoStore = require('../src/main/todo-store');

const STATUSES = ['pending', 'in_progress', 'completed'];

/**
 * Проверка и нормализация списка задач (как в Claude Code):
 * - content trim непустой, без дублей
 * - status из допустимых
 * - максимум одна in_progress
 */
function parseTodoList(todos, allowMultipleInProgress = false) {
  if (!Array.isArray(todos)) throw new Error('todos must be an array');
  const result = [];
  const seen = new Set();
  let active = 0;
  for (const item of todos) {
    if (typeof item !== 'object' || item === null) throw new Error('invalid todo: item must be an object');
    const content = String(item.content || '').trim();
    if (!content) throw new Error('invalid todo: content must be a non-empty string');
    if (seen.has(content)) throw new Error('invalid todos: duplicate content ' + JSON.stringify(content));
    seen.add(content);
    if (!STATUSES.includes(item.status)) throw new Error('invalid todo status: ' + item.status);
    if (item.status === 'in_progress') active++;
    result.push({ content, status: item.status });
  }
  if (!allowMultipleInProgress && active > 1) throw new Error('invalid todos: at most one task may be in_progress (got ' + active + ')');
  return result;
}

function counts(list) {
  const c = (s) => list.filter(t => t.status === s).length;
  return { pending: c('pending'), inProgress: c('in_progress'), completed: c('completed') };
}

function formatTodoOutput(c) {
  return 'Updated todo list: ' + c.pending + ' pending, ' + c.inProgress + ' in progress, ' + c.completed + ' completed.';
}

/** todo_write — полностью заменяет список. */
class TodoWriteTool extends Tool {
  constructor() {
    super(
      'todo_write',
      '记录并更新当前工作的结构化任务列表。每次发送完整列表，替换之前的列表（无部分更新）。',
      {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            description: '完整任务列表，替换之前任何列表。',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                content: { type: 'string', description: '任务内容，简短的祈使句' },
                status: { type: 'string', enum: STATUSES, description: 'pending | in_progress | completed' },
              },
              required: ['content', 'status'],
            },
          },
        },
        required: ['todos'],
        additionalProperties: false,
      },
      'todoWrite(todos)'
    );
  }

  getPromptSection() {
    return {
      name: 'tool:todo_write',
      order: 110,
      text: '记录并更新当前工作的结构化任务列表。每次调用发送完整列表——它替换之前的列表（没有部分更新）。完成任务后立即标记为 completed。对于简单的单步任务可跳过列表。',
    };
  }

  async execute(params) {
    const { todos, senderId } = params;
    try {
      const list = parseTodoList(todos);
      const saved = todoStore.setList(senderId, list);
      const c = counts(saved);
      console.log('[TodoWriteTool] список обновлён:', JSON.stringify(c));
      return ToolResult.success(formatTodoOutput(c) + '\n' + saved.map(t => t.id + ' [' + t.status + '] ' + t.content).join('\n'));
    } catch (err) {
      return ToolResult.error('更新待办列表失败: ' + err.message);
    }
  }
}

/** todo_edit — правка одной задачи по id. */
class TodoEditTool extends Tool {
  constructor() {
    super(
      'todo_edit',
      'Изменить одну задачу по id: текст и/или статус. Id берётся из результата todo_write.',
      {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'id задачи (из todo_write)' },
          content: { type: 'string', description: 'Новый текст задачи (опционально)' },
          status: { type: 'string', enum: STATUSES, description: 'Новый статус (опционально)' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      'todoEdit(id, {content?, status?})'
    );
  }

  getPromptSection() {
    return {
      name: 'tool:todo_edit',
      order: 111,
      text: 'Изменить одну задачу по id: текст (content) и/или статус (status). Используй, когда нужно поправить одну задачу, а не переписывать весь список.',
    };
  }

  async execute(params) {
    const { id, content, status, senderId } = params;
    try {
      if (!id) throw new Error('id must be a non-empty string');
      if (content === undefined && status === undefined) throw new Error('nothing to update: pass content and/or status');
      const r = todoStore.editTask(senderId, id, { content, status });
      if (!r.ok) return ToolResult.error('更新 задачи失败: ' + r.error);
      return ToolResult.success('Задача ' + id + ' обновлена.');
    } catch (err) {
      return ToolResult.error('更新 задачи失败: ' + err.message);
    }
  }
}

/** todo_delete — удаление одной задачи по id. */
class TodoDeleteTool extends Tool {
  constructor() {
    super(
      'todo_delete',
      'Удалить одну задачу из списка по id.',
      {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'id задачи (из todo_write)' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      'todoDelete(id)'
    );
  }

  getPromptSection() {
    return {
      name: 'tool:todo_delete',
      order: 112,
      text: 'Удалить одну задачу из списка по id. Если задача больше не нужна — удали её, а не оставляй в pending.',
    };
  }

  async execute(params) {
    const { id, senderId } = params;
    try {
      if (!id) throw new Error('id must be a non-empty string');
      const r = todoStore.deleteTask(senderId, id);
      if (!r.ok) return ToolResult.error('Удаление задачи не удалось: ' + r.error);
      return ToolResult.success('Задача ' + id + ' удалена.');
    } catch (err) {
      return ToolResult.error('Удаление задачи не удалось: ' + err.message);
    }
  }
}

module.exports = { TodoWriteTool, TodoEditTool, TodoDeleteTool, parseTodoList, formatTodoOutput, STATUSES };
