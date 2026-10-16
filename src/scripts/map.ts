// The run as two maps of 300 points: each point is one question, grouped by site.
// A point turns amber when that answer holds a phrase the plugin's check reports,
// brighter for two or three. Playback reveals the run question by question; the
// range input is the playhead and the accessible control. Every figure the maps
// show is also printed as text in the section.

import { lean, morph, reduce, relabel, settle } from './motion';

type Question = [site: number, id: number, off: number, on: number];
type Marked = { s: string; m: [number, number][] };
// An excerpt: paragraphs before, the sentence, paragraphs after. The last of `b` and the first
// of `a` share the sentence's paragraph.
type Excerpt = { w: number; b: string[]; s: string; m: [number, number][]; a: string[] };
type Detail = { t: string; u: string; au: string; a: string; l: string; lu: string; off: Marked[]; on: Marked[]; x: Record<'off' | 'on', Excerpt> };
type Block = { p?: string; li?: string; table?: string[][] };


const COLS = 6;
const ROWS = 10;
const GAP = 0.04; // between districts, as a share of the width; matches the label grid
const STEP_MS = 28;
const POP_MS = 420;
const EMPTY = '#27423b';
const QUIET = '#3a5249';
const RAMP = ['#b7862e', '#d79f36', '#f2b33d'];
const RING = '#ece6d9';
const RIPPLE_MS = 1300; // after a full run, one wave crosses the maps to show that dots answer a tap

export function initMap(root: HTMLElement) {
  const questions: Question[] = JSON.parse(root.dataset.run!);
  const sites: { id: string; name: string }[] = JSON.parse(root.dataset.sites!);
  const L = JSON.parse(root.dataset.labels!);
  const base = root.dataset.base!;
  const section = root.closest('section')!;
  const N = questions.length;

  const key = (i: number) => `${sites[questions[i][0]].id}-${questions[i][1]}`;
  const within: number[] = [];
  const seen = sites.map(() => 0);
  const bySlot = new Map<string, number>();
  questions.forEach((q, i) => {
    within[i] = seen[q[0]]++;
    bySlot.set(`${q[0]}:${within[i]}`, i);
  });

  const maps = [...root.querySelectorAll<HTMLElement>('.map')].map((figure) => {
    const canvas = figure.querySelector('canvas')!;
    return { side: figure.dataset.side as 'off' | 'on', canvas, ctx: canvas.getContext('2d')!, tip: figure.querySelector<HTMLElement>('.tip')!, w: 0, h: 0, cell: 0, district: 0 };
  });
  const counters = { off: section.querySelector('[data-count="off"]')!, on: section.querySelector('[data-count="on"]')! };
  const play = root.querySelector<HTMLButtonElement>('.play')!;
  const scrub = root.querySelector<HTMLLabelElement>('.scrub')!;
  const range = scrub.querySelector('input')!;
  const status = root.querySelector<HTMLElement>('.status')!;
  const panel = section.querySelector<HTMLElement>('.panel')!;

  let shown = N;
  const featured = Math.max(0, questions.findIndex((_, i) => key(i) === root.dataset.featured));
  let selected = featured;
  let chosen = false; // the ring waits for the reader's choice
  let hovered = -1;
  let rippleAt = 0;
  let playing = false;
  let raf = 0;
  let last = 0;
  let carry = 0;
  const revealedAt = new Float64Array(N);

  // ---- layout and drawing

  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const m of maps) {
      m.w = m.canvas.clientWidth;
      m.district = (m.w * (1 - 4 * GAP)) / sites.length;
      m.cell = m.district / COLS;
      m.h = m.cell * ROWS;
      m.canvas.width = Math.round(m.w * dpr);
      m.canvas.height = Math.round(m.h * dpr);
      m.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function centre(m: (typeof maps)[number], i: number) {
    const j = within[i];
    const x = questions[i][0] * (m.district + m.w * GAP) + ((j % COLS) + 0.5) * m.cell;
    const y = (Math.floor(j / COLS) + 0.5) * m.cell;
    return [x, y];
  }

  function draw(now: number) {
    let popping = false;
    const wave = rippleAt ? (now - rippleAt) / RIPPLE_MS : 2;
    for (const m of maps) {
      const { ctx, cell } = m;
      ctx.clearRect(0, 0, m.w, m.h);
      for (let i = 0; i < N; i++) {
        const [x, y] = centre(m, i);
        const found = questions[i][m.side === 'off' ? 2 : 3];
        let r = cell * 0.17;
        ctx.fillStyle = EMPTY;
        if (i < shown) {
          r = cell * (found ? 0.34 : 0.28);
          ctx.fillStyle = found ? RAMP[Math.min(found, 3) - 1] : QUIET;
          const age = now - revealedAt[i];
          if (found && revealedAt[i] && age < POP_MS) {
            const t = 1 - age / POP_MS;
            r *= 1 + 0.9 * t * t;
            popping = true;
          }
          const phase = wave - (x / m.w) * 0.6;
          if (found && phase > 0 && phase < 0.4) r *= 1 + 0.45 * Math.sin((phase / 0.4) * Math.PI);
          if (i === hovered) r *= 1.4;
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!chosen) continue;
      const [sx, sy] = centre(m, selected);
      ctx.strokeStyle = RING;
      ctx.lineWidth = Math.max(1.5, cell * 0.09);
      ctx.beginPath();
      ctx.arc(sx, sy, cell * 0.46, 0, Math.PI * 2);
      ctx.stroke();
    }
    return popping || wave < 1.05;
  }

  const siteCounts = {
    off: sites.map((_, s) => section.querySelector(`[data-site-count="off-${s}"]`)),
    on: sites.map((_, s) => section.querySelector(`[data-site-count="on-${s}"]`)),
  };
  function count() {
    const off = sites.map(() => 0);
    const on = sites.map(() => 0);
    for (let i = 0; i < shown; i++) {
      if (questions[i][2]) off[questions[i][0]]++;
      if (questions[i][3]) on[questions[i][0]]++;
    }
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    counters.off.textContent = String(sum(off));
    counters.on.textContent = String(sum(on));
    sites.forEach((_, s) => {
      if (siteCounts.off[s]) siteCounts.off[s]!.textContent = String(off[s]);
      if (siteCounts.on[s]) siteCounts.on[s]!.textContent = String(on[s]);
    });
  }

  // The status line follows the run while it plays or is scrubbed, and holds the invitation to tap once all 300 are in.
  function tellPosition(i: number) {
    if (shown >= N) {
      if (status.textContent !== status.dataset.hint) {
        status.textContent = status.dataset.hint!;
        settle(status);
      }
      return;
    }
    const n = Math.min(N, Math.max(1, i + 1));
    const title = details?.[key(n - 1)]?.t;
    status.textContent = [L.position.replace('{n}', n).replace('{total}', N), sites[questions[n - 1][0]].name, title].filter(Boolean).join(' · ');
  }

  // ---- playback

  function frame(now: number) {
    if (playing) {
      carry += now - (last || now);
      while (carry >= STEP_MS && shown < N) {
        revealedAt[shown] = now;
        shown++;
        carry -= STEP_MS;
      }
      range.value = String(Math.max(1, shown));
      count();
      tellPosition(shown - 1);
      if (shown >= N) stop(true);
    }
    last = now;
    const popping = draw(now);
    raf = playing || popping ? requestAnimationFrame(frame) : 0;
  }

  function start(fromStart: boolean) {
    if (fromStart || shown >= N) {
      shown = 0;
      revealedAt.fill(0);
    }
    playing = true;
    carry = 0;
    last = 0;
    rippleAt = 0;
    relabel(play, L.pause);
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function stop(ended = false) {
    playing = false;
    if (ended && !reduce.matches) rippleAt = performance.now();
    relabel(play, ended || shown >= N ? L.replay : L.play);
  }

  function redraw() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  // ---- the panel

  let details: Record<string, Detail> | null = null;
  let detailsLoading: Promise<void> | null = null;
  const answers: Record<string, Promise<Record<string, { off: Block[]; on: Block[] }>>> = {};

  function loadDetails() {
    detailsLoading ??= fetch(`${base}data/questions.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        details = d;
      })
      .catch(() => {
        detailsLoading = null;
      });
    return detailsLoading;
  }

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  }

  function markedText(text: string, spans: [number, number][]) {
    const out: (Node | string)[] = [];
    let at = 0;
    for (const [a, b] of spans) {
      out.push(text.slice(at, a), el('mark', {}, text.slice(a, b)));
      at = b;
    }
    out.push(text.slice(at));
    return out;
  }

  function excerpt(side: 'off' | 'on', x: Excerpt) {
    const lead = x.b[x.b.length - 1];
    const body = el('div', { className: 'excerpt' },
      ...x.b.slice(0, -1).map((text) => el('p', { className: 'ctx' }, text)),
      el('p', {}, ...(lead ? [el('span', { className: 'ctx' }, `${lead} `)] : []), el('span', { className: 'said' }, ...markedText(x.s, x.m)), ...(x.a[0] ? [el('span', { className: 'ctx' }, ` ${x.a[0]}`)] : [])),
      ...x.a.slice(1).map((text) => el('p', { className: 'ctx' }, text)),
    );
    const words = el('p', { className: 'words' }, L.excerpt.replace('{n}', x.w.toLocaleString(document.documentElement.lang)));
    const col = el('div', { className: 'col' }, el('p', { className: 'col-head' }, side === 'off' ? L.off : L.on), body, words);
    col.dataset.side = side;
    return col;
  }

  function link(href: string, text: string) {
    return el('a', { className: 'link', href }, text);
  }

  function showPanel(i: number) {
    const d = details?.[key(i)];
    if (!d) return;
    const site = sites[questions[i][0]].name;
    const meta = el('p', { className: 'meta' });
    for (const part of L.asked.split(/(\{user\}|\{site\})/)) {
      if (part === '{user}') meta.append(link(d.au, L.user.replace('{id}', d.a)));
      else if (part === '{site}') meta.append(link(new URL(d.u).origin, site));
      else meta.append(part);
    }
    meta.append(' · ', link(d.lu, d.l));
    const full = el('div', { className: 'full', hidden: true });
    const chev = el('span', { className: 'chev' });
    chev.setAttribute('aria-hidden', 'true');
    const both = el('button', { className: 'both plate', type: 'button' }, el('span', { className: 'label' }, L.readBoth), chev);
    both.setAttribute('aria-expanded', 'false');
    both.addEventListener('click', () => toggleBoth(i, d, both, full));
    lean(both, 12);
    const cols = el('div', { className: 'cols' }, excerpt('off', d.x.off), excerpt('on', d.x.on));
    const example = chosen ? [] : [el('p', { className: 'example' }, L.example)];
    morph(panel, () => {
      panel.replaceChildren(...example, meta, el('p', { className: 'title' }, el('a', { href: d.u }, d.t)), cols, el('p', { className: 'key' }, L.wavy), both, full);
      copyScopedStyle(panel);
    });
  }

  // Astro scopes component styles with a data attribute; nodes made here need it too.
  const scope = [...panel.attributes].find((a) => a.name.startsWith('data-astro-cid'))?.name;
  function copyScopedStyle(node: Element) {
    if (!scope) return;
    node.querySelectorAll('*').forEach((child) => child.setAttribute(scope, ''));
  }

  function renderBlocks(blocks: Block[], flagged: Marked[]) {
    const out: HTMLElement[] = [];
    let list: HTMLUListElement | null = null;
    for (const b of blocks) {
      if (b.table) {
        list = null;
        const table = el('table');
        b.table.forEach((row, r) => table.append(el('tr', {}, ...row.map((cell) => el(r === 0 ? 'th' : 'td', {}, cell)))));
        out.push(table);
        continue;
      }
      const text = (b.p ?? b.li)!;
      const hit = flagged.find((f) => text.includes(f.s));
      const content = hit ? [text.slice(0, text.indexOf(hit.s)), ...markedText(hit.s, hit.m), text.slice(text.indexOf(hit.s) + hit.s.length)] : [text];
      if (b.li !== undefined) {
        if (!list) out.push((list = el('ul')));
        list.append(el('li', {}, ...content));
      } else {
        list = null;
        out.push(el('p', {}, ...content));
      }
    }
    return out;
  }

  async function toggleBoth(i: number, d: Detail, button: HTMLButtonElement, full: HTMLElement) {
    if (!full.hidden) {
      button.setAttribute('aria-expanded', 'false');
      relabel(button, L.readBoth);
      morph(panel, () => (full.hidden = true), null);
      return;
    }
    const site = sites[questions[i][0]].id;
    relabel(button, L.loading);
    try {
      answers[site] ??= fetch(`${base}data/answers-${site}.json`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
      const pair = (await answers[site])[key(i)];
      full.replaceChildren(
        el('div', {}, el('h4', {}, L.off), ...renderBlocks(pair.off, d.off)),
        el('div', {}, el('h4', {}, L.on), ...renderBlocks(pair.on, d.on)),
      );
      copyScopedStyle(full);
      relabel(button, L.hideBoth);
      button.setAttribute('aria-expanded', 'true');
      morph(panel, () => (full.hidden = false), full);
    } catch {
      delete answers[site];
      relabel(button, L.failed);
    }
  }

  async function select(i: number) {
    selected = i;
    chosen = true;
    redraw();
    await loadDetails();
    showPanel(i);
  }

  // A second tap on the ringed dot takes the ring away and brings back the example.
  async function deselect() {
    selected = featured;
    chosen = false;
    redraw();
    await loadDetails();
    showPanel(featured);
  }

  // ---- wiring

  size();
  new ResizeObserver(() => {
    size();
    redraw();
  }).observe(root);

  play.hidden = false;
  scrub.hidden = false;
  const featuredBoth = panel.querySelector<HTMLButtonElement>('.both');
  if (featuredBoth) {
    featuredBoth.hidden = false;
    featuredBoth.addEventListener('click', async () => {
      await loadDetails();
      showPanel(selected);
      panel.querySelector<HTMLButtonElement>('.both')?.click();
    });
  }

  let userPaused = false;
  play.addEventListener('click', () => {
    userPaused = playing;
    playing ? stop() : start(false);
  });
  range.addEventListener('input', () => {
    userPaused = true;
    stop();
    shown = Number(range.value);
    revealedAt.fill(0);
    count();
    tellPosition(shown - 1);
    select(shown - 1);
  });
  function indexAt(m: (typeof maps)[number], e: MouseEvent) {
    const box = m.canvas.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const s = Math.floor(x / (m.district + m.w * GAP));
    const inX = x - s * (m.district + m.w * GAP);
    if (s < 0 || s >= sites.length || inX > m.district) return undefined;
    return bySlot.get(`${s}:${Math.floor(y / m.cell) * COLS + Math.floor(inX / m.cell)}`);
  }
  for (const m of maps) {
    m.canvas.addEventListener('click', (e) => {
      const i = indexAt(m, e);
      if (i === undefined) return;
      if (chosen && i === selected) deselect();
      else select(i);
    });
    // With a mouse, the dot under the pointer grows and names its question.
    m.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const at = indexAt(m, e);
      const i = at !== undefined && at < shown ? at : -1;
      if (i !== hovered) {
        hovered = i;
        redraw();
      }
      if (i < 0) return void (m.tip.hidden = true);
      m.tip.textContent = details?.[key(i)]?.t ?? `${L.position.replace('{n}', i + 1).replace('{total}', N)} · ${sites[questions[i][0]].name}`;
      m.tip.hidden = false;
      const plot = m.tip.parentElement!.getBoundingClientRect();
      const x = e.clientX - plot.left;
      const left = x + 16 + m.tip.offsetWidth > plot.width ? x - 16 - m.tip.offsetWidth : x + 16;
      m.tip.style.transform = `translate(${left}px, ${e.clientY - plot.top + 16}px)`;
    });
    m.canvas.addEventListener('pointerleave', () => {
      hovered = -1;
      m.tip.hidden = true;
      redraw();
    });
  }

  tellPosition(selected);
  if (reduce.matches) {
    relabel(play, L.replay);
    redraw();
    loadDetails();
    return;
  }

  // Start empty and play once the maps are well in view; pause only while they are out of it.
  shown = 0;
  count();
  redraw();
  let started = false;
  new IntersectionObserver(
    (entries) => {
      const ratio = entries[0].intersectionRatio;
      if (ratio >= 0.35 && !started) {
        started = true;
        loadDetails();
        start(true);
      } else if (ratio >= 0.35 && !playing && !userPaused && shown < N) start(false);
      else if (ratio === 0 && playing) stop();
    },
    { threshold: [0, 0.35] },
  ).observe(root);
}
