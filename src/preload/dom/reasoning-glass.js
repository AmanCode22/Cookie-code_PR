/**
 * Матовое стекло для плашки «Размышление N секунд» (._5ab5d64) в чате DeepSeek.
 *
 * Проблема: backdrop-filter не работает, потому что между плашкой и body стоят
 * непрозрачные предки, а виртуализированный список DeepSeek использует transform
 * (это ломает background-attachment: fixed у потомков). Поэтому стекло рисует
 * псевдоэлемент ::before самого _5ab5d64, а мы считаем ему размер и позицию так,
 * чтобы картинка покрыла и вьюпорт, и саму плашку и выглядела как размытый фон.
 *
 * Размер картинки подбираем так, чтобы она покрывала и вьюпорт, и саму плашку
 * (с запасом pad = max(40, 4×blur) с каждой стороны). Позицию считаем как
 * центрирование cover от вьюпорта, затем клампим по границам псевдоэлемента.
 */

const PLATE_SELECTOR = '._5ab5d64';
const MIN_PAD = 40;

/**
 * Динамический отступ ::before: не меньше 4× blur, чтобы края размытия
 * полностью скрывались за границей плашки (overflow: hidden).
 */
function computePad() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--cuckoo-reasoning-blur').trim();
  const blur = parseFloat(raw) || 12;
  return Math.max(MIN_PAD, Math.ceil(blur * 4));
}

let imgNatural = null; // { w, h } — натуральные размеры фоновой картинки
let pending = false;
let started = false;

function getBgUrl() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--cuckoo-bg-image').trim();
  if (!v || v === 'none') return '';
  const m = v.match(/url\((['"]?)([^'")]+)\1\)/);
  return m ? m[2] : '';
}

function ensureImageLoaded(url) {
  if (!url || imgNatural) return;
  const img = new Image();
  img.onload = () => { imgNatural = { w: img.naturalWidth, h: img.naturalHeight }; schedule(); };
  img.onerror = () => { imgNatural = null; };
  img.src = url;
}

/**
 * Размер картинки в px так, чтобы она покрывала И вьюпорт, И саму плашку
 * (с запасом pad с каждой стороны). Пропорции сохраняем — внутри плашки
 * картинка может оказаться чуть крупнее, чем на body, но в размытии это
 * незаметно, зато не остаётся «дырок».
 */
function computeSizeFor(vw, vh, rect, pad) {
  const url = getBgUrl();
  if (!url) return null;
  ensureImageLoaded(url);
  if (!imgNatural || !imgNatural.w || !imgNatural.h) return null;
  const needW = Math.max(vw, rect.width + 2 * pad);
  const needH = Math.max(vh, rect.height + 2 * pad);
  const scale = Math.max(needW / imgNatural.w, needH / imgNatural.h);
  const iw = Math.round(imgNatural.w * scale);
  const ih = Math.round(imgNatural.h * scale);
  return { iw, ih };
}

function positionPlates() {
  const plates = document.querySelectorAll(PLATE_SELECTOR);
  if (!plates.length) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = computePad();
  plates.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    // ::before в координатах вьюпорта:
    // [r.left-pad, r.right+pad] × [r.top-pad, r.bottom+pad].
    const pvLeft = r.left - pad;
    const pvTop = r.top - pad;
    // Размер картинки покрывает И вьюпорт, И псевдо (по обеим осям).
    const size = computeSizeFor(vw, vh, r, pad);
    if (!size) return;
    // Базовая позиция — центрирование cover от вьюпорта.
    let bx = (vw - size.iw) / 2;
    let by = (vh - size.ih) / 2;
    // Картинку НЕ сдвигаем относительно body — она должна совпадать с фоном,
    // иначе в плате покажется другой участок обоев. Покрытие псевдо по обеим
    // осям уже гарантировано размером (см. computeSizeFor: needW/needH ≥
    // max(вьюпорт, плашка + 2*pad)), поэтому clamp не нужен и только вредит.
    // Позиция картинки внутри ::before (локальные координаты).
    const px = bx - pvLeft;
    const py = by - pvTop;
    el.style.setProperty('--cuckoo-plate-pad', pad + 'px');
    el.style.setProperty('--cuckoo-plate-bg-size', size.iw + 'px ' + size.ih + 'px');
    el.style.setProperty('--cuckoo-plate-bg-pos', px + 'px ' + py + 'px');
  });
}

function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    try { positionPlates(); } catch (_) {}
  });
}

function startWatch() {
  if (started) return;
  started = true;

  // Скролл любого контейнера (в т.ч. виртуализированного списка DeepSeek) — через capture.
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('resize', schedule, { passive: true });

  // Любое появление/удаление элементов (React перерисовывает плашки).
  const mo = new MutationObserver(schedule);
  try {
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}

  // Изменение переменной --cuckoo-bg-image (смена фона в настройках).
  const rootMo = new MutationObserver(() => { imgNatural = null; schedule(); });
  try {
    rootMo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  } catch (_) {}

  // Стартовый прогон.
  schedule();
  // Интервал-страховка на случай, если rAF «съедается» React-перерисовками.
  setInterval(schedule, 400);
}

module.exports = { startWatch, schedule };
