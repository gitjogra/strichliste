// Gestenerkennung auf der Zeichenfläche.
//   senkrecht wischen  → 's' (Strength)
//   waagerecht wischen → 'm' (Mobility)
//   Zickzack/Gekritzel → ignoriert (kein versehentlicher Strich)

const MIN_TURN_SEG = 18;   // px Bewegung, bevor ein Richtungswechsel zählt
const MAX_TURNS = 2;       // mehr Richtungswechsel = Gekritzel
const DOMINANCE = 1.5;

/** Klassifiziert eine Punktfolge. Exportiert, damit sie testbar ist. */
export function classify(points, minLen) {
  if (points.length < 2) return { kind: 'none' };
  const p0 = points[0], p1 = points[points.length - 1];
  const dx = p1.x - p0.x, dy = p1.y - p0.y;

  // Richtungswechsel auf beiden Achsen zählen (mit Hysterese gegen Zittern)
  const turns = (axis) => {
    let dir = 0, anchor = points[0][axis], count = 0;
    for (const p of points) {
      const delta = p[axis] - anchor;
      if (Math.abs(delta) < MIN_TURN_SEG) continue;
      const d = Math.sign(delta);
      if (dir !== 0 && d !== dir) count++;
      dir = d; anchor = p[axis];
    }
    return count;
  };
  const tx = turns('x'), ty = turns('y');
  if (Math.max(tx, ty) > MAX_TURNS) return { kind: 'none', reason: 'scribble' };

  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < minLen) return { kind: 'none', reason: 'short' };
  if (ay > DOMINANCE * ax) return { kind: 'stroke', type: 's' };
  if (ax > DOMINANCE * ay) return { kind: 'stroke', type: 'm' };
  return { kind: 'none', reason: 'diagonal' };
}

/**
 * Hängt die Gestenerkennung an ein Element.
 * handlers: { onStroke(type), onNone(reason) }
 * trail: optionales <svg>, in das die Fingerspur live gezeichnet wird.
 */
export function attachGestures(el, trail, handlers) {
  let points = null, pointerId = null, line = null;

  const local = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  el.addEventListener('pointerdown', (e) => {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch { /* z. B. bereits beendeter Zeiger */ }
    points = [local(e)];
    if (trail) {
      const r = el.getBoundingClientRect();
      trail.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
      line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('class', 'trail-line');
      trail.appendChild(line);
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId || !points) return;
    // Auch zusammengefasste Events nutzen, damit schnelle Zickzacks nicht verloren gehen
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ce of (evs.length ? evs : [e])) points.push(local(ce));
    if (line) line.setAttribute('points', points.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' '));
  });

  const finish = (e, cancelled) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    if (line) {
      const l = line;
      l.classList.add('fade');
      setTimeout(() => l.remove(), 450);
      line = null;
    }
    if (cancelled || !points) { points = null; return; }
    const r = el.getBoundingClientRect();
    const minLen = Math.max(40, Math.min(r.width, r.height) * 0.22);
    const res = classify(points, minLen);
    points = null;
    if (res.kind === 'stroke') handlers.onStroke?.(res.type);
    else handlers.onNone?.(res.reason);
  };
  el.addEventListener('pointerup', (e) => finish(e, false));
  el.addEventListener('pointercancel', (e) => finish(e, true));
}
