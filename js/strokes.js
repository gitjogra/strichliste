// Erzeugt handgezeichnet wirkende Kreidestriche als SVG.
// Deterministisch: derselbe Tag ergibt immer dieselben "Wackler".

import { MAX_PER_TYPE, isFull } from './storage.js';

const SIZE = 300;
const SLOTS = [90, 150, 210];       // Positionen der 3 Striche je Richtung
const SPAN = [42, 258];             // Anfang/Ende eines Strichs

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const n = (r, amp) => (r() * 2 - 1) * amp;
const f = (v) => v.toFixed(1);

/** Ein leicht schiefer, gebogener Strich. type 's' = vertikal, 'm' = horizontal. */
function strokePath(type, slot, seed) {
  const r = rng(seed);
  const pos = SLOTS[slot] + n(r, 5);
  const a = SPAN[0] + n(r, 8), b = SPAN[1] + n(r, 8);
  const tilt = n(r, 7);
  const bow = n(r, 6);
  if (type === 's') {
    const x0 = pos - tilt / 2, x1 = pos + tilt / 2;
    return `M${f(x0)},${f(a)} Q${f(pos + bow)},${f((a + b) / 2)} ${f(x1)},${f(b)}`;
  }
  const y0 = pos - tilt / 2, y1 = pos + tilt / 2;
  return `M${f(a)},${f(y0)} Q${f((a + b) / 2)},${f(pos + bow)} ${f(b)},${f(y1)}`;
}

/** Handgezeichneter Kreis um ein volles Gitter (Catmull-Rom → Bézier). */
function circlePath(seed) {
  const r = rng(seed);
  const cx = 150 + n(r, 4), cy = 150 + n(r, 4);
  const start = r() * Math.PI * 2;
  const pts = [];
  const N = 14;
  for (let i = 0; i <= N + 1; i++) {
    const ang = start + (i / N) * Math.PI * 2.12;
    const rad = 136 + n(r, 5) + i * 0.6;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.97]);
  }
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

/** Liste der zu zeichnenden Striche aus dem Log (Reihenfolge = Zeichenreihenfolge). */
function layout(day, log) {
  const seen = { s: 0, m: 0 };
  return log.map((type, i) => {
    const slot = seen[type]++;
    return { type, slot, index: i, d: strokePath(type, slot, hash(`${day}|${type}|${slot}`)) };
  });
}

/**
 * Großes Gitter für die Zeichenfläche.
 * opts.animate: animiert den letzten Strich (und den Kreis, falls der Tag damit voll wird).
 */
export function boardSVG(day, log, opts = {}) {
  const strokes = layout(day, log);
  const full = isFull(log);
  const lastIdx = strokes.length - 1;

  let ghosts = '';
  for (let i = 0; i < MAX_PER_TYPE; i++) {
    ghosts += `<line class="ghost" x1="${SLOTS[i]}" y1="${SPAN[0]}" x2="${SLOTS[i]}" y2="${SPAN[1]}"/>`;
    ghosts += `<line class="ghost" x1="${SPAN[0]}" y1="${SLOTS[i]}" x2="${SPAN[1]}" y2="${SLOTS[i]}"/>`;
  }

  const paths = strokes.map((s) => {
    const anim = opts.animate && s.index === lastIdx ? ' draw' : '';
    return `<g class="stroke st-${s.type}${anim}">
      <path d="${s.d}" pathLength="1" class="core"/>
      <path d="${s.d}" pathLength="1" class="dust" transform="translate(1.6,-1.2)"/>
    </g>`;
  }).join('');

  const circle = full
    ? `<g class="stroke st-done${opts.animate ? ' draw slow' : ''}"><path d="${circlePath(hash(day + '|o'))}" pathLength="1" class="core"/></g>`
    : '';

  return `<svg viewBox="0 0 ${SIZE} ${SIZE}" class="board-svg" aria-hidden="true">
    <defs>
      <filter id="chalk" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="3" result="noise"/>
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="rough"/>
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 3.2 -0.55" result="grain"/>
        <feComposite in="rough" in2="grain" operator="in"/>
      </filter>
    </defs>
    <g class="ghosts">${ghosts}</g>
    <g filter="url(#chalk)">${paths}${circle}</g>
  </svg>`;
}

/** Flamme in Stufe 1–3 (gelb → orange → rot). Stufe 0 = nur Kreide-Umriss. */
export function flameSVG(stage) {
  const outer = 'M12 1.5C13.2 7 20 11 20 20.2 20 26.4 16.4 31 12 31S4 26.4 4 20.2C4 15.4 6.8 12.2 8.2 8.4 9 11 10 12.3 11.2 12.6 11 8.6 11.2 4.6 12 1.5Z';
  const inner = 'M12 14.5C13.2 18.4 16.2 20.4 16.2 24.2 16.2 27.2 14.3 29.2 12 29.2S7.8 27.2 7.8 24.2C7.8 21.4 9.8 19.6 10.2 17.4 11 18.2 11.6 16.8 12 14.5Z';
  if (!stage) {
    return `<svg viewBox="0 0 24 32" class="flame flame-0" aria-hidden="true"><path d="${outer}"/></svg>`;
  }
  return `<svg viewBox="0 0 24 32" class="flame flame-${stage}" aria-hidden="true">
    <path d="${outer}" class="fo"/><path d="${inner}" class="fi"/></svg>`;
}

/** Kleines Gitter für den Kalender (ohne Filter, ohne Animation). */
export function miniSVG(day, log) {
  const strokes = layout(day, log);
  const full = isFull(log);
  const paths = strokes.map((s) => `<path d="${s.d}" class="st-${s.type}"/>`).join('');
  const circle = full ? `<path d="${circlePath(hash(day + '|o'))}" class="st-done"/>` : '';
  return `<svg viewBox="0 0 ${SIZE} ${SIZE}" class="mini-svg" aria-hidden="true">${paths}${circle}</svg>`;
}
