/**
 * Принудительно держит тёмную тему DeepSeek.
 *
 * Детектор: у <body> класс "dark" при тёмной теме (проверено в F12).
 * Если класс пропал (светлая/системная светлая) — кликаем по кнопке
 * темы с текстом «Тёмная» (ru) / «Dark» (en).
 *
 * Работает постоянно: MutationObserver на class <body> + interval-страховка.
 */

let started = false;
let clicking = false;

/** Кнопка переключения на тёмную тему. */
function findDarkButton() {
  const btns = document.querySelectorAll('div[role="button"], button');
  for (const b of btns) {
    const txt = (b.textContent || '').trim();
    if (txt === 'Тёмная' || txt === 'Dark' || txt === 'Темная') return b;
  }
  return null;
}

/** Тёмная ли сейчас тема. */
function isDark() {
  return document.body && document.body.classList.contains('dark');
}

/** Если тема не тёмная — переключить на тёмную. */
function enforce() {
  if (clicking) return;
  if (isDark()) return;
  const btn = findDarkButton();
  if (!btn) return;
  clicking = true;
  try {
    btn.click();
  } catch (_) {
  } finally {
    // Небольшая пауза, чтобы React успел применить тему и observer не зациклился.
    setTimeout(() => { clicking = false; }, 300);
  }
}

function startWatch() {
  if (started) return;
  started = true;

  // Реакция на смену класса <body> (переключение темы).
  const bodyMo = new MutationObserver(enforce);
  try {
    bodyMo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } catch (_) {}

  // На случай, если кнопка появляется позже (SPA-перерисовка).
  const docMo = new MutationObserver(enforce);
  try {
    docMo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // Стартовый прогон + интервал-страховка.
  enforce();
  setInterval(enforce, 1000);
}

module.exports = { startWatch, enforce, isDark };
