/**
 * Реестр slash-команд Cookie Code.
 * Каждая команда: { name, description, prompt }.
 * prompt — текст (китайский), которым заменяется токен /name в поле ввода.
 *
 * 命令注册表：每条命令包含 name（名称）、description（描述）、prompt（注入的提示词正文）。
 * 触发方式：在输入框中输入 "/" 开头，弹出补全菜单。
 */

/**
 * 计划模式提示词（译自 dsh-plan-mode 的 plan:policy）。
 * 当用户选择 /plan 时，用此文本替换输入框中的 /plan 标记。
 */
const PLAN_PROMPT = [
  '你正处于计划模式（plan mode）。在 exit_plan_mode 成功或用户切换会话模式之前，请一直保持计划模式。',
  '命令式的「去实现某改动」意味着要规划实现方案，而不是直接执行。用户的口头同意——包括对你提问的回答——并不代表批准，也不会退出计划模式；',
  '请把确认的结论并入计划，并通过 exit_plan_mode 提交。',
  '',
  '先探索。使用非破坏性的读取、搜索、静态分析和检查，让计划扎根于真实的代码库。不要编辑或写入文件、不要修改配置、不要运行会重写已跟踪文件的格式化或代码生成、不要提交，',
  '也不要执行计划中的任何改动。优先复用已有的函数和模式，而不是引入新机制。',
  '',
  '为保持请求缓存稳定，工具目录在各模式下保持一致。本计划模式规则优先于任何后续工具描述或指引中「建议使用修改类工具」的内容；这些工具仍然列出，只是为了保持请求结构稳定。',
  '不要用 todo_write 来跟踪本规划阶段：它跟踪的是计划获批之后的实现工作，而计划本身应当放在 exit_plan_mode 中。',
  '',
  '通过检查代码来确认可查证的事实。只有面对用户自有的选择，或检查无法解答的实质性歧义时，才使用 ask_user_question。',
  '当你能自己查清楚代码在哪里、当前行为如何时，不要向用户提问。',
  '',
  '让计划达到「决策完备」：说明目标与成功标准；按子系统归类实现改动；指出公共 API、schema 与数据流的变化；覆盖边界情况、失败模式、测试、验收标准以及明确的假设。',
  '保持足够简洁以便审阅，同时足够详细，使另一位工程师无需再做设计决策就能实现。',
  '',
  '准备好后，用完整的计划 Markdown（以 # 标题开头）调用 exit_plan_mode。让 exit_plan_mode 成为该次回复中唯一且最后的工具调用：它会提交计划供批准，实现只在获批后的后续步骤中开始。',
  '不要把最终计划作为普通回复粘贴出来，也不要通过文字或 ask_user_question 去问「我可以继续吗？」。如果评审驳回，请吸收反馈后重新提交。如果评审通道不可用或已中止，请停留在计划模式并请用户手动切换模式；不要继续实现。',
].join('\n');

/**
 * 已注册的命令列表。
 * @type {Array<{name: string, description: string, prompt: string}>}
 */
const COMMANDS = [
  {
    name: 'plan',
    // Ключ i18n; резолвится через descOf() в момент отрисовки.
    descriptionKey: 'cmd.plan.description',
    prompt: PLAN_PROMPT,
  },
];

/**
 * Возвращает локализованное описание команды.
 * @param {{descriptionKey?: string, description?: string}} cmd
 * @param {Function} [t] - функция перевода; если нет — возвращает descriptionKey/description
 * @returns {string}
 */
function descOf(cmd, t) {
  if (!cmd) return '';
  if (cmd.descriptionKey && typeof t === 'function') return t(cmd.descriptionKey);
  return cmd.description || cmd.descriptionKey || '';
}

/**
 * 按名称查找命令（大小写不敏感）。
 * @param {string} name
 * @returns {{name: string, description: string, prompt: string} | undefined}
 */
function findCommand(name) {
  if (!name) return undefined;
  const lower = String(name).toLowerCase();
  return COMMANDS.find((c) => c.name.toLowerCase() === lower);
}

/**
 * 返回名称以 query 前缀开头的命令（用于补全候选）。
 * 空 query 返回全部；结果按名称排序。
 * @param {string} query - "/" 之后的已输入文本
 * @returns {Array}
 */
function searchCommands(query) {
  const q = String(query || '').toLowerCase();
  const list = COMMANDS.filter((c) => c.name.toLowerCase().startsWith(q));
  return list.slice().sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  COMMANDS,
  PLAN_PROMPT,
  findCommand,
  searchCommands,
  descOf,
};
