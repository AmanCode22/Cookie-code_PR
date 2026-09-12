'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { AskUserQuestionTool, normalizeQuestions } = require('../../tools/AskUserQuestionTool');

const validQuestions = [{
  question: 'Как продолжить?',
  options: [{ label: 'Сделать A' }, { label: 'Сделать B' }, { label: 'Сделать C' }],
}];

test('ask_user_question ограничивает число вопросов и вариантов', () => {
  assert.throws(() => normalizeQuestions([]), /between 1 and 5/);
  assert.throws(() => normalizeQuestions(new Array(6).fill(validQuestions[0])), /between 1 and 5/);
  assert.throws(() => normalizeQuestions([{ question: 'x', options: [{ label: 'A' }] }]), /exactly 3 options/);
});

test('ask_user_question помечает первый вариант рекомендуемым', () => {
  const questions = normalizeQuestions(validQuestions);
  assert.strictEqual(questions[0].options[0].recommended, true);
  assert.strictEqual(questions[0].options[1].recommended, false);
  assert.strictEqual(questions[0].options[2].recommended, false);
});

test('ask_user_question добавляет инструкции в системный prompt', () => {
  const section = new AskUserQuestionTool().getPromptSection();
  assert.strictEqual(new AskUserQuestionTool().jsApi, 'ask_user_question(questions)');
  assert.strictEqual(section.name, 'tool:ask_user_question');
  assert.match(section.text, /от 1 до 5 вопросов/);
  assert.match(section.text, /ровно 3 варианта/);
  assert.match(section.text, /Свой ответ/);
});

test('ask_user_question ждёт callback и возвращает ответы', async () => {
  const tool = new AskUserQuestionTool();
  const result = await tool.execute({
    questions: validQuestions,
    askUserQuestion: async (questions) => [{ question: questions[0].question, answer: 'Свой ответ' }],
  });
  assert.strictEqual(result.success, true);
  assert.deepStrictEqual(result.data.answers, [{ question: 'Как продолжить?', answer: 'Свой ответ' }]);
});

test('ask_user_question требует callback ответа', async () => {
  const result = await new AskUserQuestionTool().execute({ questions: validQuestions });
  assert.strictEqual(result.success, false);
  assert.match(result.error, /недоступен/);
});