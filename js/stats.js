// Streaks und Quoten.
import { getLog, isFull, counts, addDays, parseKey, fmt, allDays, MAX_PER_TYPE } from './storage.js';

/** Aktuelle Streak: Ein noch nicht voller heutiger Tag bricht die Serie nicht. */
export function currentStreak(today) {
  let k = isFull(getLog(today)) ? today : addDays(today, -1);
  let n = 0;
  while (isFull(getLog(k))) { n++; k = addDays(k, -1); }
  return n;
}

/** Anzahl voller Tage in Folge, die an Tag k enden (0, wenn k nicht voll ist). */
export function streakAt(k) {
  let n = 0;
  while (isFull(getLog(k))) { n++; k = addDays(k, -1); }
  return n;
}

/** Flammenstufe: 0 = keine, 1 = Tag 3–6, 2 = Tag 7–13, 3 = ab Tag 14. */
export function flameStage(n) {
  if (n >= 14) return 3;
  if (n >= 7) return 2;
  if (n >= 3) return 1;
  return 0;
}

export function longestStreak() {
  const full = Object.keys(allDays()).filter((k) => isFull(getLog(k))).sort();
  let best = 0, run = 0, prev = null;
  for (const k of full) {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

/** Kennzahlen für den Zeitraum [from, to] (inklusive, Tagesschlüssel). */
export function rangeStats(from, to) {
  let days = 0, full = 0, s = 0, m = 0;
  for (let k = from; k <= to; k = addDays(k, 1)) {
    const log = getLog(k);
    const c = counts(log);
    days++;
    if (isFull(log)) full++;
    s += Math.min(c.s, MAX_PER_TYPE);
    m += Math.min(c.m, MAX_PER_TYPE);
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  return {
    days, full,
    fullPct: pct(full, days),
    sPct: pct(s, days * MAX_PER_TYPE),
    mPct: pct(m, days * MAX_PER_TYPE),
  };
}

export function weekStart(k) {
  const d = parseKey(k);
  const wd = (d.getDay() + 6) % 7; // Montag = 0
  d.setDate(d.getDate() - wd);
  return fmt(d);
}
export function monthStart(k) { return k.slice(0, 8) + '01'; }
