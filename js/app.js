import {
  dayKey, parseKey, addDays, fmt, getLog, counts, isFull, addStroke, removeLastOfType,
  subscribe, exportData, validateImport, importData, MAX_PER_TYPE,
} from './storage.js';
import { boardSVG, miniSVG, flameSVG } from './strokes.js';
import { attachGestures } from './gestures.js';
import { currentStreak, longestStreak, streakAt, flameStage, rangeStats, weekStart, monthStart } from './stats.js';
import * as sync from './sync.js';
import { listExercises, addExercise, removeExercise, subscribeExercises } from './exercises.js';

const $ = (id) => document.getElementById(id);
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const HELP_KEY = 'tally.helpSeen';
const SKIP_LOGIN_KEY = 'tally.skipLogin';

const ui = {
  view: 'today',
  today: dayKey(),
  day: dayKey(),            // aktuell bearbeiteter Tag
  month: dayKey().slice(0, 7),
};

// ---------- Hilfen ----------
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* nicht unterstützt */ } };
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}
function longDate(k) {
  const d = parseKey(k);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------- Ansicht: Tag ----------
function renderDay(animate) {
  const log = getLog(ui.day);
  const c = counts(log);
  const isToday = ui.day === ui.today;

  if (ui.view === 'today') {
    $('title').textContent = isToday ? 'Heute' : (ui.day === addDays(ui.today, -1) ? 'Gestern' : 'Nachtragen');
    $('subtitle').textContent = longDate(ui.day);
  }
  $('past-banner').hidden = isToday;
  $('next-day').disabled = ui.day >= ui.today;
  $('board-svg').innerHTML = boardSVG(ui.day, log, { animate });
  $('board').classList.toggle('full', isFull(log));

  for (const t of ['s', 'm']) {
    const el = $(`tally-${t}`);
    el.querySelector('.count').textContent = `${c[t]}/${MAX_PER_TYPE}`;
    el.classList.toggle('done', c[t] >= MAX_PER_TYPE);
    el.querySelector('.minus').disabled = c[t] === 0;
  }

  // Serie: heute zählt ein noch offener Tag nicht als Bruch; vergangene Tage zeigen die Serie bis dahin
  const n = isToday ? currentStreak(ui.today) : streakAt(ui.day);
  const box = $('streak');
  box.hidden = n === 0;
  box.className = `streak stage-${flameStage(n)}`;
  box.innerHTML = `${flameSVG(flameStage(n))}<span class="streak-num">${n}</span>`;
  box.setAttribute('aria-label', `Serie: ${plural(n, 'Tag', 'Tage')}`);
}

function onStroke(type) {
  const name = type === 's' ? 'Strength' : 'Mobility';
  if (ui.day > dayKey()) { toast('Zukünftige Tage kannst du nicht befüllen'); return; }
  if (!addStroke(ui.day, type)) {
    vibrate([20, 40, 20]);
    toast(`${name} ist schon voll`);
    $('board').classList.remove('shake'); void $('board').offsetWidth; $('board').classList.add('shake');
    return;
  }
  const log = getLog(ui.day);
  if (isFull(log)) { vibrate([30, 60, 120]); toast('Tag geschafft!'); } else vibrate(15);
  renderDay(true);
}
function onMinus(type) {
  if (!removeLastOfType(ui.day, type)) return;
  vibrate([15, 50, 15]);
  renderDay();
  toast(`${type === 's' ? 'Strength' : 'Mobility'}-Strich entfernt`);
}
function stepDay(delta) {
  const next = addDays(ui.day, delta);
  if (next > ui.today) return;
  ui.day = next;
  renderDay();
}
function onNone(reason) {
  if (reason === 'diagonal') toast('Gerader wischen: senkrecht oder waagerecht');
}

// ---------- Ansicht: Kalender ----------
function renderCalendar() {
  const [y, m] = ui.month.split('-').map(Number);
  $('month-title').textContent = `${MONTHS[m - 1]} ${y}`;
  $('next-month').disabled = ui.month >= ui.today.slice(0, 7);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(y, m, 0).getDate();
  let html = '<span class="cal-empty"></span>'.repeat(lead);
  for (let d = 1; d <= daysIn; d++) {
    const k = fmt(new Date(y, m - 1, d));
    const future = k > ui.today;
    const log = getLog(k);
    const cls = ['cal-day', k === ui.today && 'today', future && 'future', isFull(log) && 'full'].filter(Boolean).join(' ');
    const stage = future ? 0 : flameStage(streakAt(k));
    html += `<button class="${cls}" data-day="${k}" ${future ? 'disabled' : ''} aria-label="${longDate(k)}: ${counts(log).s} Strength, ${counts(log).m} Mobility">
      <span class="num">${d}</span>${miniSVG(k, log)}${stage ? flameSVG(stage) : ''}</button>`;
  }
  $('cal-grid').innerHTML = html;
}
function shiftMonth(delta) {
  const [y, m] = ui.month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const next = fmt(d).slice(0, 7);
  if (next > ui.today.slice(0, 7)) return;
  ui.month = next;
  renderCalendar();
}

// ---------- Ansicht: Statistik ----------
function renderStats() {
  $('st-current').textContent = currentStreak(ui.today);
  $('st-longest').textContent = longestStreak();
  const w = rangeStats(weekStart(ui.today), ui.today);
  const mo = rangeStats(monthStart(ui.today), ui.today);
  $('st-week').textContent = `${w.full} / ${w.days} · ${w.fullPct} %`;
  $('st-month').textContent = `${mo.full} / ${mo.days} · ${mo.fullPct} %`;
  $('bar-s').style.width = `${mo.sPct}%`; $('pct-s').textContent = `${mo.sPct} %`;
  $('bar-m').style.width = `${mo.mPct}%`; $('pct-m').textContent = `${mo.mPct} %`;
  renderAccount();
}
function renderAccount() {
  const u = sync.getUser();
  const configured = sync.isConfigured();
  const statusText = {
    off: 'Nur lokal gespeichert (Supabase nicht eingerichtet).',
    ok: 'Mit Supabase synchronisiert.',
    pending: u ? 'Änderungen warten auf Sync.' : 'Nicht angemeldet – nur lokal gespeichert.',
    syncing: 'Synchronisiere …',
    offline: 'Offline – wird nachgeholt, sobald Netz da ist.',
    error: 'Sync-Fehler – wird erneut versucht.',
  }[sync.getStatus()];
  $('account-line').textContent = (u ? `Angemeldet als ${u.email}. ` : '') + statusText;
  $('logout-btn').hidden = !u;
  $('sync-now').hidden = !u;
  $('logout-btn').textContent = 'Abmelden';
  if (configured && !u) { $('logout-btn').hidden = false; $('logout-btn').textContent = 'Anmelden'; }
}

// ---------- Navigation ----------
function show(view) {
  ui.view = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.day-arrow').forEach((b) => { b.hidden = view !== 'today'; });
  if (view === 'today') renderDay();
  if (view === 'stats') { $('title').textContent = 'Statistik'; $('subtitle').textContent = longDate(ui.today); renderCalendar(); renderStats(); }
  if (view === 'exercises') { $('title').textContent = 'Übungen'; $('subtitle').textContent = 'Such dir je 3 aus'; renderExercises(); }
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function renderExercises() {
  for (const t of ['s', 'm']) {
    $(`ex-${t}`).innerHTML = listExercises(t).map((e) => (e.custom
      ? `<li class="custom"><span>${esc(e.name)}</span><button class="ex-del" data-id="${e.id}" aria-label="${esc(e.name)} löschen">×</button></li>`
      : `<li>${esc(e.name)}</li>`)).join('');
  }
}
function setupExerciseForms() {
  document.querySelectorAll('.ex-add').forEach((form) => {
    const plus = form.querySelector('.ex-plus');
    const input = form.querySelector('input');
    const close = () => { input.value = ''; input.hidden = true; plus.hidden = false; };
    plus.addEventListener('click', () => { plus.hidden = true; input.hidden = false; input.focus(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (addExercise(form.dataset.type, input.value)) { toast('Übung hinzugefügt'); renderExercises(); }
      close();
    });
    input.addEventListener('blur', () => { if (!input.value.trim()) close(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  });
  $('view-exercises').addEventListener('click', (e) => {
    const btn = e.target.closest('.ex-del');
    if (!btn) return;
    const name = btn.parentElement.querySelector('span').textContent;
    if (!confirm(`„${name}“ löschen?`)) return;
    removeExercise(btn.dataset.id);
    renderExercises();
  });
  subscribeExercises((info) => { if (info?.remote && ui.view === 'exercises') renderExercises(); });
}
function openDay(k) {
  ui.day = k;
  show('today');
}

/** Tageswechsel um 3 Uhr erkennen, wenn die App lange offen ist. */
function checkRollover() {
  const now = dayKey();
  if (now === ui.today) return;
  const wasOnToday = ui.day === ui.today;
  ui.today = now;
  if (wasOnToday) ui.day = now;
  show(ui.view);
}

// ---------- Sync-Status (steht unter Statistik → Daten) ----------
function onSyncStatus() {
  if (ui.view === 'stats') renderAccount();
}

// ---------- Login ----------
function showLogin() {
  $('login').hidden = false;
  $('login-email').value = localStorage.getItem('tally.email') ?? '';
  $('login-submit').textContent = 'Link senden';
  $('login-msg').textContent = '';
}
async function onLoginSubmit(e) {
  e.preventDefault();
  const msg = $('login-msg');
  const btn = $('login-submit');
  btn.disabled = true;
  try {
    const email = $('login-email').value.trim();
    localStorage.setItem('tally.email', email);
    msg.textContent = 'Sende Link …';
    await sync.sendLink(email);
    btn.textContent = 'Erneut senden';
    msg.textContent = 'Link ist unterwegs. Öffne die Mail auf diesem Gerät und tippe den Link an (ggf. im Spam nachsehen).';
  } catch (err) {
    msg.textContent = `Hat nicht geklappt: ${err.message ?? err}`;
  } finally {
    btn.disabled = false;
  }
}

// ---------- Export / Import ----------
function doExport() {
  const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `strichliste-backup-${ui.today}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function doImport(file) {
  try {
    const obj = JSON.parse(await file.text());
    const err = validateImport(obj);
    if (err) { alert(err); return; }
    const n = Object.keys(obj.days).length;
    if (!confirm(`${plural(n, 'Tag', 'Tage')} aus der Sicherung übernehmen? Vorhandene Einträge an diesen Tagen werden überschrieben.`)) return;
    importData(obj);
    toast('Backup importiert');
    renderStats();
  } catch {
    alert('Die Datei konnte nicht gelesen werden.');
  }
}

// ---------- Start ----------
function init() {
  attachGestures($('board'), $('trail'), { onStroke, onNone });
  document.querySelectorAll('.minus').forEach((b) => b.addEventListener('click', () => onMinus(b.dataset.type)));
  $('prev-day').addEventListener('click', () => stepDay(-1));
  $('next-day').addEventListener('click', () => stepDay(1));

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.view === 'today') ui.day = ui.today;
    show(b.dataset.view);
  }));
  $('back-today').addEventListener('click', () => openDay(ui.today));
  $('prev-month').addEventListener('click', () => shiftMonth(-1));
  $('next-month').addEventListener('click', () => shiftMonth(1));
  $('cal-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.cal-day');
    if (b && !b.disabled) openDay(b.dataset.day);
  });

  $('help-btn').addEventListener('click', () => { $('help').hidden = false; });
  $('help-close').addEventListener('click', () => {
    $('help').hidden = true;
    try { localStorage.setItem(HELP_KEY, '1'); } catch { /* egal */ }
  });

  $('export-btn').addEventListener('click', doExport);
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => { if (e.target.files[0]) doImport(e.target.files[0]); e.target.value = ''; });
  $('sync-now').addEventListener('click', () => sync.syncNow());
  $('logout-btn').addEventListener('click', async () => {
    if (sync.getUser()) {
      if (!confirm('Abmelden? Deine Striche bleiben auf diesem Gerät und in Supabase.')) return;
      await sync.signOut();
      renderAccount();
    } else showLogin();
  });
  $('login-form').addEventListener('submit', onLoginSubmit);
  setupExerciseForms();
  $('login-skip').addEventListener('click', () => {
    $('login').hidden = true;
    try { localStorage.setItem(SKIP_LOGIN_KEY, '1'); } catch { /* egal */ }
  });

  subscribe((info) => {
    if (info?.remote || info?.import) {
      if (ui.view === 'today') renderDay();
      if (ui.view === 'stats') { renderCalendar(); renderStats(); }
    }
  });
  sync.onStatus(onSyncStatus);
  sync.onUser((u) => {
    if (u && !$('login').hidden) {
      $('login').hidden = true;
      try { localStorage.removeItem(SKIP_LOGIN_KEY); } catch { /* egal */ }
      toast('Angemeldet');
    }
    if (ui.view === 'stats') renderAccount();
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkRollover(); });
  setInterval(checkRollover, 60_000);

  show('today');

  let helpSeen = false;
  try { helpSeen = localStorage.getItem(HELP_KEY) === '1'; } catch { /* egal */ }
  if (!helpSeen) $('help').hidden = false;

  sync.initSync().then(({ needsLogin }) => {
    let skipped = false;
    try { skipped = localStorage.getItem(SKIP_LOGIN_KEY) === '1'; } catch { /* egal */ }
    if (needsLogin && !skipped) showLogin();
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Offline-Modus weiter */ });
  }
}

init();
