// Supabase: Login per E-Mail-Link und Abgleich des lokalen Caches.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { dirtyDays, markClean, applyRemote, subscribe } from './storage.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const TABLE = 'tally_days';

let client = null;
let user = null;
let status = 'off';           // off | ok | pending | syncing | offline | error
let statusListeners = new Set();
let timer = null;
let running = false;
let again = false;

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const getStatus = () => status;
export const getUser = () => user;
export function onStatus(fn) { statusListeners.add(fn); fn(status); }
function setStatus(s) { status = s; statusListeners.forEach((fn) => fn(s)); }
const userListeners = new Set();
export function onUser(fn) { userListeners.add(fn); }
function setUser(u) {
  const changed = (u?.id ?? null) !== (user?.id ?? null);
  user = u;
  if (changed) userListeners.forEach((fn) => fn(u));
}

/** Initialisiert den Client. Gibt zurück, ob ein Login nötig ist. */
export async function initSync() {
  if (!isConfigured()) { setStatus('off'); return { needsLogin: false }; }
  try {
    const { createClient } = await import(SUPABASE_JS);
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tally.auth' },
    });
  } catch {
    // Offline beim allerersten Start o. Ä. – lokal weiterarbeiten
    setStatus('offline');
    return { needsLogin: false };
  }
  const { data } = await client.auth.getSession();
  user = data.session?.user ?? null;
  client.auth.onAuthStateChange((event, session) => {
    setUser(session?.user ?? null);
    if (event === 'SIGNED_IN') schedule(0);
  });
  // Nach Login per E-Mail-Link: Token-Reste aus der Adresszeile entfernen
  if (location.hash.includes('access_token') || location.hash.includes('error')) {
    history.replaceState(null, '', location.pathname + location.search);
  }

  subscribe((info) => { if (info?.local) schedule(800); });
  window.addEventListener('online', () => schedule(0));
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    // Login-Link wurde evtl. in einem anderen Tab/Chrome geöffnet → Sitzung neu einlesen
    if (!user) {
      const { data: d } = await client.auth.getSession();
      setUser(d.session?.user ?? null);
    }
    schedule(0);
  });

  if (user) schedule(0);
  else setStatus('pending');
  return { needsLogin: !user };
}

export async function sendLink(email) {
  const { error } = await client.auth.signInWithOtp({ email, options: {
    shouldCreateUser: true,
    // Der Link in der Mail führt zurück zur App
    emailRedirectTo: location.origin + location.pathname,
  } });
  if (error) throw error;
}
export async function signOut() {
  await client?.auth.signOut();
  setUser(null);
  setStatus('pending');
}

export function schedule(delay = 800) {
  if (!client || !user) return;
  if (dirtyDays().length) setStatus('pending');
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export async function syncNow() {
  if (!client || !user) return;
  if (running) { again = true; return; }
  if (!navigator.onLine) { setStatus('offline'); return; }
  running = true;
  setStatus('syncing');
  try {
    // 1) Push
    const dirty = dirtyDays();
    if (dirty.length) {
      const rows = dirty.map((d) => ({ user_id: user.id, day: d.day, log: d.log, updated_at: d.updatedAt }));
      const { error } = await client.from(TABLE).upsert(rows, { onConflict: 'user_id,day' });
      if (error) throw error;
      markClean(dirty);
    }
    // 2) Pull (ein Nutzer, wenige hundert Zeilen pro Jahr → komplett laden)
    const { data, error } = await client.from(TABLE).select('day,log,updated_at');
    if (error) throw error;
    applyRemote(data);
    setStatus(dirtyDays().length ? 'pending' : 'ok');
  } catch (err) {
    console.warn('Sync fehlgeschlagen', err);
    setStatus(navigator.onLine ? 'error' : 'offline');
  } finally {
    running = false;
    if (again) { again = false; schedule(0); }
  }
}
