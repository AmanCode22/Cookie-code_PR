'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { JsRunner } = require('../../tools/JsRunner');
const { registry } = require('../../tools');
const todoStore = require('../../src/main/todo-store');

test('JsRunner 执行简单 JS 代码', async () => {
  const runner = new JsRunner(registry);
  const r = await runner.run('const x = 1 + 2; log(x);', process.cwd());
  assert.strictEqual(r.success, true);
  assert.ok(r.output.includes('3'));
});

test('JsRunner 空代码报错', async () => {
  const runner = new JsRunner(registry);
  const r = await runner.run('', null);
  assert.strictEqual(r.success, false);
  assert.match(r.error, /无效的 JS 代码/);
});

test('JsRunner null 代码报错', async () => {
  const runner = new JsRunner(registry);
  const r = await runner.run(null, null);
  assert.strictEqual(r.success, false);
});

test('JsRunner 语法错误返回失败', async () => {
  const runner = new JsRunner(registry);
  let r;
  try { r = await runner.run('const = ;', process.cwd()); } catch (e) { r = { success: false, error: e.message }; }
  assert.strictEqual(r.success, false);
  assert.ok(r.error);
});

test('JsRunner 调用 read 工具', async () => {
  const runner = new JsRunner(registry);
  const r = await runner.run('const c = await read("package.json"); log(c.slice(0, 20));', process.cwd());
  assert.strictEqual(r.success, true);
  assert.ok(r.output.length > 0);
});

test('JsRunner 未知工具报错', async () => {
  const runner = new JsRunner(registry);
  const r = await runner.run('await read("a.txt")', null);
  assert.strictEqual(r.success, false);
  assert.ok(r.error);
});

test('JsRunner passes senderId to todo tools', async () => {
  const runner = new JsRunner(registry);
  const senderId = 'test-js-runner-todo';
  todoStore.clear(senderId);
  const r = await runner.run(
    'await todoWrite([{ content: "show todo panel", status: "in_progress" }]);',
    process.cwd(),
    senderId
  );
  assert.strictEqual(r.success, true);
  const todos = todoStore.getList(senderId);
  assert.strictEqual(todos.length, 1);
  assert.strictEqual(todos[0].content, 'show todo panel');
  assert.strictEqual(todos[0].status, 'in_progress');
  todoStore.clear(senderId);
});

test('JsRunner поддерживает ask_user_question в snake_case', async () => {
  const runner = new JsRunner(registry);
  const r = await runner.run(
    'const result = await ask_user_question([{ question: "Как продолжить?", options: [{ label: "A" }, { label: "B" }, { label: "C" }] }]); return result.answers[0].answer;',
    process.cwd(),
    'test-js-runner-question',
    async (questions) => [{ question: questions[0].question, answer: 'A' }]
  );
  assert.strictEqual(r.success, true);
  assert.ok(r.output.includes('A'));
});
