// Two hourglasses drawn from the mark: plates that narrow to the point.
// Grounded Copy's sand passes one neck. Writing and then rewriting passes two:
// the glass has three bulbs, one neck per request. Durations are the run's median
// seconds per answer, played ten times faster; the clocks show real seconds.

import { reduce, relabel } from './motion';

const SPEED = 10;
const FULL = 2.8; // sand, in plate widths; the first bulb holds exactly this much

type Bulb = number[]; // plate widths, top to bottom
type Glass = { x: number; bulbs: Bulb[]; phases: number[]; clock: HTMLElement };

const TOP: Bulb = [1.0, 0.8, 0.6, 0.4];
const BOTTOM: Bulb = [0.4, 0.6, 0.8, 1.0];
const MIDDLE: Bulb = [0.4, 0.7, 1.0, 0.7, 0.4];

export function initHourglass(stage: HTMLElement) {
  const canvas = stage.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const button = stage.querySelector<HTMLButtonElement>('.play')!;
  const label = button.dataset as { play: string; pause: string; again: string };
  const css = getComputedStyle(stage);
  const colour = { slot: css.getPropertyValue('--quiet').trim(), sand: css.getPropertyValue('--ink').trim(), point: css.getPropertyValue('--point').trim() };
  const one = (Number(stage.dataset.one) * 1000) / SPEED;
  const two = (Number(stage.dataset.two) * 1000) / SPEED;
  const first = two * Number(stage.dataset.first);
  const glasses: Glass[] = [
    { x: 0.25, bulbs: [TOP, BOTTOM], phases: [one], clock: stage.querySelector('[data-clock="one"]')! },
    { x: 0.75, bulbs: [TOP, MIDDLE, BOTTOM], phases: [first, two - first], clock: stage.querySelector('[data-clock="two"]')! },
  ];
  const total = (g: Glass) => g.phases.reduce((a, b) => a + b, 0);
  const end = Math.max(...glasses.map(total));
  const format = new Intl.NumberFormat(document.documentElement.lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  let W = 0;
  let H = 0;
  let U = 0;
  let elapsed = 0;
  let last = 0;
  let running = false;
  let raf = 0;
  let grains: { g: number; neck: number; born: number; dx: number }[] = [];
  let lastSpawn = 0;

  const plateH = () => U * 0.16;
  const gap = () => U * 0.07;
  const neckR = () => U * 0.11;

  // Row geometry of a glass, bottom-aligned on the canvas: [y of each plate per bulb], [y of each neck].
  function layout(g: Glass) {
    const rows: { bulb: number; plate: number; y: number }[] = [];
    const necks: number[] = [];
    let y = H - 2; // bottom edge of what comes next, moving up
    for (let b = g.bulbs.length - 1; b >= 0; b--) {
      for (let k = g.bulbs[b].length - 1; k >= 0; k--) {
        rows.push({ bulb: b, plate: k, y: y - plateH() / 2 });
        y -= plateH() + gap();
      }
      if (b > 0) {
        necks.unshift(y - neckR());
        y -= 2 * neckR() + gap();
      }
    }
    return { rows, necks };
  }

  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    U = Math.min(H / 3.8, W * 0.4);
  }

  // Sand in each bulb at time t. Phase n moves the sand from bulb n to bulb n + 1.
  function amounts(g: Glass, t: number) {
    const sand = g.bulbs.map((_, i) => (i === 0 ? FULL : 0));
    let at = 0;
    let falling = -1;
    g.phases.forEach((d, n) => {
      const p = Math.max(0, Math.min(1, (t - at) / d));
      sand[n] -= FULL * p;
      sand[n + 1] += FULL * p;
      if (p > 0 && p < 1) falling = n;
      at += d;
    });
    return { sand, falling };
  }

  function bar(cx: number, cy: number, w: number, h: number, fill: string) {
    if (w <= 0.5) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, Math.min(h / 2, w / 2));
    ctx.fill();
  }

  function draw(now: number) {
    ctx.clearRect(0, 0, W, H);
    glasses.forEach((g, gi) => {
      const cx = W * g.x;
      const { rows, necks } = layout(g);
      const { sand, falling } = amounts(g, elapsed);
      // Sand settles from the lowest plate of each bulb upwards.
      const left = [...sand];
      const surface: number[] = g.bulbs.map(() => -1);
      for (const row of rows) {
        const w = g.bulbs[row.bulb][row.plate];
        const fill = Math.max(0, Math.min(w, left[row.bulb]));
        left[row.bulb] -= fill;
        bar(cx, row.y, w * U, plateH(), colour.slot);
        bar(cx, row.y, fill * U, plateH(), colour.sand);
        if (fill > 0 || surface[row.bulb] < 0) surface[row.bulb] = row.y - plateH() / 2;
      }
      necks.forEach((y) => {
        ctx.fillStyle = colour.point;
        ctx.beginPath();
        ctx.arc(cx, y, neckR(), 0, Math.PI * 2);
        ctx.fill();
      });
      if (falling >= 0 && running && now - lastSpawn > 12) {
        grains.push({ g: gi, neck: falling, born: now, dx: (Math.random() - 0.5) * neckR() * 0.5 });
        if (gi === glasses.length - 1 || glasses[gi + 1] === undefined) lastSpawn = now;
      }
      grains = grains.filter((p) => {
        if (p.g !== gi) return true;
        const y = necks[p.neck] + neckR() + 0.5 * U * 9 * ((now - p.born) / 1000) ** 2;
        if (y > surface[p.neck + 1] || amounts(g, elapsed).falling !== p.neck) return false;
        ctx.fillStyle = colour.point;
        ctx.beginPath();
        ctx.arc(cx + p.dx, y, U * 0.022, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });
      g.clock.textContent = `${format.format((Math.min(elapsed, total(g)) * SPEED) / 1000)} s`;
    });
  }

  function frame(now: number) {
    if (running) {
      elapsed += now - (last || now);
      if (elapsed >= end) {
        elapsed = end;
        running = false;
        relabel(button, label.again);
      }
    }
    last = now;
    draw(now);
    raf = running || grains.length ? requestAnimationFrame(frame) : 0;
  }

  function play(reset: boolean) {
    if (reset) {
      elapsed = 0;
      grains = [];
    }
    running = true;
    last = 0;
    relabel(button, label.pause);
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function pause() {
    running = false;
    relabel(button, label.play);
  }

  size();
  new ResizeObserver(() => {
    size();
    draw(performance.now());
  }).observe(canvas);

  if (reduce.matches) {
    elapsed = end;
    draw(performance.now());
    return;
  }

  draw(performance.now());
  button.hidden = false;
  let started = false;
  let userPaused = false;
  button.addEventListener('click', () => {
    started = true;
    userPaused = running;
    if (running) pause();
    else play(elapsed >= end);
  });
  // Start once the glasses are mostly in view; pause only when they have left it entirely.
  new IntersectionObserver(
    (entries) => {
      const ratio = entries[0].intersectionRatio;
      if (ratio >= 0.45 && !started) {
        started = true;
        play(true);
      } else if (ratio >= 0.45 && !running && !userPaused && elapsed > 0 && elapsed < end) play(false);
      else if (ratio === 0 && running) pause();
    },
    { threshold: [0, 0.45] },
  ).observe(canvas);
}
