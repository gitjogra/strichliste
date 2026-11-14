// Übungskatalog: feste Liste vom Zettel + eigene Übungen (lokal gespeichert, mit Supabase synchronisiert).
const BASE = {
  s: [
    'Liegestütze',
    'Pullups',
    'Bodyrows',
    'Plank ein Arm vor',
    'Plank Knie vor Ellbogen',
    'Plank Side Knee',
    'Bauch Crunch divers',
    'Windshield',
    'Dips + Bauch',
    'Adiletten Supermans',
    'Side Plank',
    'KB Chinese',
    'KB Curls',
    'KB Kreisen',
    'KB hinterm Rücken',
  ],
  m: [
    'Ausfallschritt Hip Ham',
    'Squat',
    '90/90 li/re',
    'Hürdensitz',
    'Schneidersitz',
    'Nacken auf Bett',
    'Fensterbrett alle 3',
    'Spagat',
    'Seitlich Hängebauch',
    'Verwringen',
    'Reverse Bridge + Bauch',
    'Hip Tilt im Liegen',
    'Warrior 1+2',
    'Down Dog + Cobra',
    'Plank left right swing',
  ],
};

const KEY = 'tally.exercises.v1';
const listeners = new Set();
// items: { [id]: { id, type, name, deleted, createdAt, updatedAt, dirty } }
let items = load();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY))?.items ?? {}; } catch { return {}; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ items })); } catch { /* Speicher voll o. Ä. */ }
}
function emit(info) { listeners.forEach((fn) => fn(info)); }
export function subscribeExercises(fn) { listeners.add(fn); }

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16);
  }));

/** Liste für die Anzeige: feste Übungen, danach eigene (älteste zuerst). */
export function listExercises(type) {
  const own = Object.values(items)
    .filter((e) => e.type === type && !e.deleted)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((e) => ({ id: e.id, name: e.name, custom: true }));
  return [...BASE[type].map((name) => ({ name, custom: false })), ...own];
}

export function addExercise(type, name) {
  name = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!name) return false;
  const now = new Date().toISOString();
  const id = uuid();
  items[id] = { id, type, name, deleted: false, createdAt: now, updatedAt: now, dirty: true };
  persist();
  emit({ local: true });
  return true;
}

export function removeExercise(id) {
  const e = items[id];
  if (!e) return;
  e.deleted = true;
  e.updatedAt = new Date().toISOString();
  e.dirty = true;
  persist();
  emit({ local: true });
}

// ---- Sync-Schnittstelle ----
export const dirtyExercises = () => Object.values(items).filter((e) => e.dirty);
export function markExercisesClean(pushed) {
  for (const p of pushed) if (items[p.id]?.updatedAt === p.updatedAt) items[p.id].dirty = false;
  persist();
}
export function applyRemoteExercises(rows) {
  let changed = false;
  for (const r of rows) {
    const local = items[r.id];
    if (local && (local.dirty || Date.parse(local.updatedAt) >= Date.parse(r.updated_at))) continue;
    items[r.id] = {
      id: r.id, type: r.type, name: r.name, deleted: r.deleted,
      createdAt: r.created_at, updatedAt: r.updated_at, dirty: false,
    };
    changed = true;
  }
  persist();
  if (changed) emit({ remote: true });
}
