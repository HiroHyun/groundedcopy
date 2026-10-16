// The page's motion. A state change keeps its element: the box morphs from its old size to
// its new one on the spring, and the new content settles out of a short blur.

const CURVE =
  'linear(0, 0.0185, 0.0663, 0.1337, 0.2127, 0.2975, 0.3834, 0.4671, 0.5463, 0.6194, 0.6857, 0.7445, 0.796, 0.8404, 0.8781, 0.9096, 0.9355, 0.9565, 0.9732, 0.9862, 0.9961, 1.0034, 1.0085, 1.0119, 1.014, 1.015, 1.0151, 1.0148, 1.014, 1.0129, 1.0117, 1.0104, 1.0091, 1.0078, 1.0066, 1.0055, 1.0046, 1.0037, 1.0029, 1.0023, 1)';
export const SPRING = CSS.supports('transition-timing-function', CURVE) ? CURVE : 'cubic-bezier(0.34, 1.2, 0.64, 1)';
export const reduce = matchMedia('(prefers-reduced-motion: reduce)');

export function settle(el: Element | null, duration = 300) {
  if (!el || reduce.matches) return;
  el.animate([{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
}

// Runs `change`, then animates `box` from the size it had to the size it has.
export function morph(box: HTMLElement, change: () => void, content: Element | null = box) {
  if (reduce.matches) return change();
  const a = box.getBoundingClientRect();
  change();
  const b = box.getBoundingClientRect();
  const from: Keyframe = {};
  const to: Keyframe = {};
  if (Math.abs(a.width - b.width) > 0.5) {
    from.width = `${a.width}px`;
    to.width = `${b.width}px`;
  }
  if (Math.abs(a.height - b.height) > 0.5) {
    from.height = `${a.height}px`;
    to.height = `${b.height}px`;
  }
  if (Object.keys(from).length) box.animate([from, to], { duration: 560, easing: SPRING });
  settle(content);
}

// A button's label changes inside the same plate.
export function relabel(button: HTMLElement, text: string) {
  const label = button.querySelector<HTMLElement>('.label') ?? button;
  if (label.textContent === text) return;
  morph(button, () => (label.textContent = text), label);
}

// Under a mouse the element turns toward the pointer, up to `max` degrees each way, and springs
// back when the pointer leaves; a touch presses it in. The stylesheet turns --rx and --ry into the tilt.
export function lean(el: HTMLElement, max = 6) {
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reduce.matches) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--rx', `${(0.5 - (e.clientY - r.top) / r.height) * 2 * max}deg`);
    el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 2 * max}deg`);
  });
  el.addEventListener('pointerleave', () => {
    el.style.removeProperty('--rx');
    el.style.removeProperty('--ry');
  });
  el.addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && el.classList.add('is-pressed'));
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(type, () => el.classList.remove('is-pressed'));
}
