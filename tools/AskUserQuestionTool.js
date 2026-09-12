const { Tool, ToolResult } = require('./ToolRegistry');

function normalizeQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 5) {
    throw new Error('questions must contain between 1 and 5 questions');
  }

  return questions.map((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.question !== 'string' || !item.question.trim()) {
      throw new Error(`question ${index + 1} must have a non-empty question`);
    }
    if (!Array.isArray(item.options) || item.options.length !== 3) {
      throw new Error(`question ${index + 1} must have exactly 3 options`);
    }

    const options = item.options.map((option, optionIndex) => {
      const label = typeof option === 'string' ? option : option && option.label;
      if (typeof label !== 'string' || !label.trim()) {
        throw new Error(`question ${index + 1} option ${optionIndex + 1} must have a non-empty label`);
      }
      return {
        label: label.trim(),
        description: typeof option === 'object' && option.description ? String(option.description) : '',
        recommended: optionIndex === 0 || !!(option && option.recommended),
      };
    });

    return { question: item.question.trim(), options };
  });
}

class AskUserQuestionTool extends Tool {
  constructor() {
    super(
      'ask_user_question',
      'Задать пользователю до 5 вопросов. Для каждого вопроса укажите ровно 3 варианта ответа; первый вариант помечается рекомендуемым. Пользователь также может ввести свой ответ.',
      {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                question: { type: 'string' },
                options: {
                  type: 'array',
                  minItems: 3,
                  maxItems: 3,
                  items: { type: 'object', properties: { label: { type: 'string' }, description: { type: 'string' } }, required: ['label'] },
                },
              },
              required: ['question', 'options'],
            },
          },
        },
        required: ['questions'],
      },
      'ask_user_question(questions)'
    );
  }

  getPromptSection() {
    return {
      name: 'tool:ask_user_question',
      order: 105,
      text: 'Используй ask_user_question только для выбора пользователя или неустранимой неоднозначности, которую нельзя выяснить проверкой проекта. Передавай от 1 до 5 вопросов. Каждый вопрос должен содержать ровно 3 варианта: первый вариант — рекомендуемый (А), второй — обычный альтернативный (Б), третий — обычный альтернативный (С). Варианты должны быть конкретными и краткими; при необходимости добавляй description. Пользователь всегда может выбрать «Свой ответ». После получения ответов продолжай работу с учётом выбранных значений.',
    };
  }

  async execute(params) {
    let questions;
    try {
      questions = normalizeQuestions(params && params.questions);
    } catch (err) {
      return ToolResult.error(`Некорректные вопросы: ${err.message}`);
    }

    if (!params || typeof params.askUserQuestion !== 'function') {
      return ToolResult.error('Инструмент ask_user_question недоступен в текущем окне');
    }

    try {
      const answers = await params.askUserQuestion(questions);
      return ToolResult.success({ answers });
    } catch (err) {
      return ToolResult.error(`Не удалось получить ответ пользователя: ${err.message}`);
    }
  }
}

module.exports = { AskUserQuestionTool, normalizeQuestions };