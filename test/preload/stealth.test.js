'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const stealth = require('../../src/preload/dom/stealth');
const state = require('../../src/preload/dom/state');

// ===== Хелперы: минимальные фейковые DOM-узлы =====

function mkClassList(initial) {
  const set = new Set(initial || []);
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
  };
}

function mkNode(opts = {}) {
  return {
    tagName: opts.tagName || 'DIV',
    nodeType: 1,
    textContent: opts.textContent || '',
    classList: mkClassList(opts.classes),
    attributes: {},
    children: opts.children || [],
    childNodes: opts.childNodes || opts.children || [],
    parentElement: null,
    parentNode: null,
    querySelector: opts.querySelector || (() => null),
    getAttribute: (name) => (opts.attrs && opts.attrs[name]) || null,
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

// ===== isServiceText =====

test('isServiceText: распознаёт все служебные сообщения Cookie Code', () => {
  const samples = [
    '【工具执行结果】read 执行成功 (callId: abc)\n{...}',              // результат tool
    '【工具执行结果】bash 被用户拒绝 (callId: js_123)',                 // отказ
    '【JS 执行结果汇总】(共 2 个脚本)',                                 // JS-сводка
    '【MCP 配置已更新】\n\n可用的 MCP server：files。',                  // MCP-инфо
    '# 身份与能力\n\n你是一个由 Cookie Code 驱动的 AI 编程助手...',       // системный промпт
    '你是一个由 Cookie Code 驱动的 AI 编程助手，能够使用命令行',          // промпт без заголовка
    '我已选择目录：C:\\proj',                                          // легаси-инициализация
    '请使用```cuckoo``` 代码块进行工具调用，不要使用 XML invoke 格式。',   // XML-подсказка
  ];
  for (const s of samples) {
    assert.strictEqual(stealth.isServiceText(s), true, JSON.stringify(s.slice(0, 30)));
  }
});

test('isServiceText: обычные сообщения не считаются служебными', () => {
  const samples = [
    'Напиши функцию сортировки на Python',
    'Вот пример кода с【примером】скобок',   // маркер должен совпадать точно
    '【工具执行结】опечатка',
    '',
    null,
    undefined,
    42,
  ];
  for (const s of samples) {
    assert.strictEqual(stealth.isServiceText(s), false, JSON.stringify(String(s).slice(0, 30)));
  }
});

// ===== isUserBubble =====

test('isUserBubble: ответ AI (есть .ds-markdown) не пользовательский', () => {
  const ai = mkNode({ querySelector: (sel) => (sel === '.ds-markdown' ? { tagName: 'DIV' } : null) });
  assert.strictEqual(stealth.isUserBubble(ai), false);
});

test('isUserBubble: пузырь без .ds-markdown — пользовательский', () => {
  const user = mkNode({});
  assert.strictEqual(stealth.isUserBubble(user), true);
});

test('isUserBubble: role-атрибут user/human — пользовательский', () => {
  const withRole = mkNode({ attrs: { 'data-role': 'user' } });
  const parent = mkNode({ attrs: { 'data-author': 'human' } });
  const child = mkNode({});
  child.parentElement = parent;
  assert.strictEqual(stealth.isUserBubble(withRole), true);
  assert.strictEqual(stealth.isUserBubble(child), true);
});

// ===== hideMessageEl =====

test('hideMessageEl: скрывает пузырь и пустые обёртки над ним', () => {
  const bubble = mkNode({ textContent: '【工具执行结果】read 执行成功' });
  const wrapper = mkNode({ tagName: 'DIV' });
  const container = mkNode({ tagName: 'DIV' });
  const other = mkNode({ textContent: 'обычное сообщение' });

  wrapper.children = [bubble];
  wrapper.childNodes = [bubble];
  bubble.parentElement = wrapper;
  container.children = [wrapper, other];
  container.childNodes = [wrapper, other];
  wrapper.parentElement = container;

  assert.strictEqual(stealth.hideMessageEl(bubble), true);
  assert.strictEqual(bubble.classList.contains('cuckoo-hidden-msg'), true);
  assert.strictEqual(bubble.attributes['data-cuckoo-hidden'], '1');
  // обёртка, в которой пузырь был единственным элементом — тоже скрыта
  assert.strictEqual(wrapper.classList.contains('cuckoo-hidden-msg'), true);
  // контейнер с другими дочерними элементами не скрыт
  assert.strictEqual(container.classList.contains('cuckoo-hidden-msg'), false);
});

test('hideMessageEl: обёртка с собственным текстом не скрывается', () => {
  const bubble = mkNode({ textContent: '【JS 执行结果汇总】' });
  const wrapper = mkNode({ tagName: 'DIV' });
  wrapper.children = [bubble];
  wrapper.childNodes = [bubble, { nodeType: 3, nodeValue: 'Метка:' }];
  bubble.parentElement = wrapper;

  stealth.hideMessageEl(bubble);
  assert.strictEqual(bubble.classList.contains('cuckoo-hidden-msg'), true);
  assert.strictEqual(wrapper.classList.contains('cuckoo-hidden-msg'), false);
});

test('hideMessageEl: null безопасен', () => {
  assert.strictEqual(stealth.hideMessageEl(null), false);
});

// ===== findServiceBubbles =====

test('findServiceBubbles: находит только служебные пользовательские пузыри', () => {
  const service = mkNode({ textContent: '【工具执行结果】read 执行成功' });
  const serviceAiLike = mkNode({
    textContent: '【工具执行结果】read 执行成功',
    querySelector: (sel) => (sel === '.ds-markdown' ? {} : null), // ответ AI, цитирующий маркер
  });
  const normal = mkNode({ textContent: 'Привет, напиши тесты' });
  const alreadyHidden = mkNode({
    textContent: '【工具执行结果】edit 执行成功',
    classes: ['cuckoo-hidden-msg'],
  });

  const fakeDocument = {
    querySelectorAll: (sel) => {
      assert.strictEqual(sel, '.ds-message');
      return [service, serviceAiLike, normal, alreadyHidden];
    },
  };

  const found = stealth.findServiceBubbles(fakeDocument);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0], service);
});

test('findServiceBubbles: без document возвращает пустой список', () => {
  assert.deepStrictEqual(stealth.findServiceBubbles(null), []);
  assert.deepStrictEqual(stealth.findServiceBubbles({}), []);
});

// ===== scanAndHide + переключатель =====

test('scanAndHide: скрывает пузыри, уважает state.hideSystemMessages', () => {
  const bubble = mkNode({ textContent: '【工具执行结果】bash 执行成功' });
  global.document = {
    querySelectorAll: () => [bubble],
    getElementById: () => null,
  };

  const saved = state.hideSystemMessages;
  try {
    state.hideSystemMessages = true;
    stealth.scanAndHide();
    assert.strictEqual(bubble.classList.contains('cuckoo-hidden-msg'), true);

    const fresh = mkNode({ textContent: '【工具执行结果】bash 执行成功' });
    global.document.querySelectorAll = () => [fresh];
    state.hideSystemMessages = false;
    stealth.scanAndHide();
    assert.strictEqual(fresh.classList.contains('cuckoo-hidden-msg'), false);
  } finally {
    state.hideSystemMessages = saved;
    delete global.document;
  }
});
