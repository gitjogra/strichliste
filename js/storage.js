// Lokaler Cache (offline-first). Quelle der Wahrheit für die UI;
// sync.js gleicht ihn mit Supabase ab.

const KEY = 'tally.v1';
export const DAY_START_HOUR = 3; // Tag beginnt um 3:00 Uhr
export const MAX_PER_TYPE = 3;

// ---------- Datumshelfer ----------
export function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function dayKey(date = new Date()) {
  const d = new Date(date.getTime());
  d.setHours(d.getHours() - DAY_START_HOUR);
  return fmt(d);
}
export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

// ---------- Zustand ----------
let state = load();
const listeners = new Set();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s.days === 'object') return s;
  } catch { /* leer/ungültig */ }
  return { days: {} };
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Speicher voll/blockiert */ }
}
function emit(info) { listeners.forEach((fn) => fn(info)); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---------- Lesen ----------
export function getLog(k) { return state.days[k]?.log ?? []; }
export function counts(log) {
  let s = 0, m = 0;
  for (const t of log) t === 's' ? s++ : m++;
  return { s, m };
}
export function isFull(log) {
  const c = counts(log);
  return c.s >= MAX_PER_TYPE && c.m >= MAX_PER_TYPE;
}
export function allDays() { return state.days; }

// ---------- Schreiben ----------
function setLog(k, log, { local = true } = {}) {
  state.days[k] = { log, updatedAt: new Date().toISOString(), dirty: local };
  persist();
  emit({ day: k, local });
}

/** Fügt einen Strich hinzu. Gibt false zurück, wenn die Kategorie schon voll ist oder der Tag in der Zukunft liegt. */
export function addStroke(k, type) {
  if (k > dayKey()) return false; // Zukunft nie befüllbar – rückwirkend ja
  const log = getLog(k);
  if (counts(log)[type] >= MAX_PER_TYPE) return false;
  setLog(k, [...log, type]);
  return true;
}
/** Entfernt den zuletzt gezeichneten Strich eines Typs. Gibt false zurück, wenn keiner da ist. */
export function removeLastOfType(k, type) {
  const log = getLog(k);
  const i = log.lastIndexOf(type);
  if (i < 0) return false;
  setLog(k, [...log.slice(0, i), ...log.slice(i + 1)]);
  return true;
}

// ---------- Sync-Schnittstelle ----------
export function dirtyDays() {
  return Object.entries(state.days)
    .filter(([, v]) => v.dirty)
    .map(([day, v]) => ({ day, log: v.log, updatedAt: v.updatedAt }));
}
/** Nach erfolgreichem Push: nur als sauber markieren, wenn sich der Tag inzwischen nicht geändert hat. */
export function markClean(pushed) {
  for (const p of pushed) {
    const cur = state.days[p.day];
    if (cur && cur.updatedAt === p.updatedAt) cur.dirty = false;
  }
  persist();
}
/** Übernimmt Server-Zeilen, sofern lokal nichts Neueres ungesynct ist. */
export function applyRemote(rows) {
  let changed = false;
  for (const r of rows) {
    const cur = state.days[r.day];
    // Last-write-wins: lokale Version bleibt, wenn sie gleich alt oder neuer ist.
    if (cur && new Date(r.updated_at) <= new Date(cur.updatedAt)) continue;
    if (cur && sameLog(cur.log, r.log ?? [])) { cur.updatedAt = r.updated_at; cur.dirty = false; continue; }
    state.days[r.day] = { log: r.log ?? [], updatedAt: r.updated_at, dirty: false };
    changed = true;
  }
  persist();
  if (changed) emit({ remote: true });
}
function sameLog(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]); }

// ---------- Export / Import ----------
export function exportData() {
  const days = {};
  for (const [k, v] of Object.entries(state.days)) if (v.log.length) days[k] = v.log;
  return { app: 'strichliste', version: 1, exportedAt: new Date().toISOString(), days };
}
export function validateImport(obj) {
  if (!obj || obj.app !== 'strichliste' || typeof obj.days !== 'object') return 'Keine gültige Strichlisten-Sicherung.';
  for (const [k, log] of Object.entries(obj.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !Array.isArray(log)) return `Ungültiger Eintrag: ${k}`;
    const c = counts(log);
    if (log.some((t) => t !== 's' && t !== 'm') || c.s > MAX_PER_TYPE || c.m > MAX_PER_TYPE) return `Ungültige Striche am ${k}`;
  }
  return null;
}
/** Ersetzt alle Tage aus der Sicherung (andere Tage bleiben erhalten). */
export function importData(obj) {
  const now = new Date().toISOString();
  for (const [k, log] of Object.entries(obj.days)) {
    state.days[k] = { log: [...log], updatedAt: now, dirty: true };
  }
  persist();
  emit({ local: true, import: true });
}
