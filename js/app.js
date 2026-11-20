import {
  toDateKey, dateFromKey, daysBetween, daysInMonth,
  computeStats, trainingDays, stretchDays, exerciseStats, lastEntryFor,
  formatEntry, formatVolume, reachedMilestone, MILESTONES,
} from './stats.js';
import { load, save, normalize, defaultData, newId, TYPES, STORAGE_KEY } from './store.js';
import { celebrate } from './confetti.js';

// ---------- State ----------
const loaded = load();
let data = loaded.data;
let storageError = loaded.error;
let tab = 'today';
let todayKey = toDateKey();
let historyMonth = todayKey.slice(0, 7); // "YYYY-MM"
let selectedDay = todayKey;

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const sheet = $('#sheet');
const backdrop = $('#sheet-backdrop');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const exById = (id) => data.exercises.find((e) => e.id === id);
const entriesOn = (date) => data.entries.filter((e) => e.date === date).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
const dayInfo = (date) => data.days[date] ?? { stretched: false, stretchMinutes: null, notes: '' };

function persist() {
  if (!save(data)) {
    storageError = 'Could not save. Storage may be full or disabled.';
    toast(storageError);
  } else if (storageError && !storageError.startsWith('Saved data')) {
    storageError = null;
  }
}

function setDay(date, patch) {
  const day = { ...dayInfo(date), ...patch };
  if (!day.stretched && !day.notes && day.stretchMinutes == null) delete data.days[date];
  else data.days[date] = day;
  persist();
}

// ---------- Formatting helpers ----------
const fmtLong = (key) => dateFromKey(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = (key) => dateFromKey(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function relDay(key) {
  if (!key) return 'Never';
  const d = daysBetween(key, todayKey);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d > 1 && d < 7) return `${d} days ago`;
  return dateFromKey(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
const parseNum = (v) => {
  const s = String(v ?? '').trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const FLAME = `<svg class="flame" viewBox="0 0 64 64" aria-hidden="true">
  <path fill="#fff7ed" d="M32 4c3 10 18 16 18 34a18 18 0 0 1-36 0c0-9 5-14 9-19 .6 6 3 9.5 7 11-1.7-10 .3-18 2-26z"/>
  <path fill="#fdba74" d="M32 30c2.5 6 9 9 9 16a9 9 0 0 1-18 0c0-5 5.5-9 9-16z"/></svg>`;
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

// ---------- Rendering ----------
const TITLES = { today: 'Today', history: 'History', progress: 'Progress', settings: 'Settings' };

function render() {
  $('#title').textContent = TITLES[tab];
  document.querySelectorAll('.tab').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('.tab-dot').hidden = !needsBackup();
  const banner = storageError ? `<div class="error-banner">${esc(storageError)}</div>` : '';
  const html = { today: renderToday, history: renderHistory, progress: renderProgress, settings: renderSettings }[tab]();
  view.innerHTML = banner + html;
}

function renderToday() {
  const s = computeStats(data, todayKey);
  const n = s.currentStreak;
  let hint = '';
  if (!s.loggedToday) {
    hint = n > 0
      ? `<p class="streak-hint">Log something today to keep your ${n}-day streak</p>`
      : `<p class="streak-hint">Log an exercise to start a streak</p>`;
  }
  return `
    <section class="card streak" aria-label="Streak">
      <span id="streak-flame">${FLAME.replace('class="flame"', `class="flame${s.loggedToday ? '' : ' cold'}"`)}</span>
      <div>
        <div><span class="num">${n}</span> <span class="label">day${n === 1 ? '' : 's'} streak</span></div>
        <div class="best">Best: ${s.bestStreak} day${s.bestStreak === 1 ? '' : 's'}${s.stretchStreak ? ` · Stretch: ${s.stretchStreak}` : ''}</div>
      </div>
    </section>
    ${hint}
    ${renderDay(todayKey)}`;
}

function renderDay(date) {
  const entries = entriesOn(date);
  const usedIds = new Set(entries.map((e) => e.exerciseId));
  const list = data.exercises.filter((e) => !e.archived || usedIds.has(e.id));
  const day = dayInfo(date);
  const isToday = date === todayKey;
  const rows = list.map((ex) => {
    const mine = entries.filter((e) => e.exerciseId === ex.id);
    const chips = mine.map((e) => `<button class="chip" data-action="edit-entry" data-id="${esc(e.id)}" aria-label="Edit ${esc(ex.name)} ${esc(formatEntry(e, ex))}">${esc(formatEntry(e, ex))}<span class="pen" aria-hidden="true">✎</span></button>`).join('');
    return `<li class="${mine.length ? 'done' : ''}">
      <button class="ex-main" data-action="log" data-ex="${esc(ex.id)}" data-date="${date}" aria-label="Log ${esc(ex.name)}">
        <span class="check">${CHECK}</span>
        <span class="ex-text"><span class="ex-name">${esc(ex.name)}${ex.archived ? '<span class="tag">archived</span>' : ''}</span><span class="ex-how">${esc(ex.howto)}</span></span>
        <span class="add" aria-hidden="true">+</span>
      </button>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
    </li>`;
  }).join('');
  return `
    <section class="card">
      <h2>Exercises</h2>
      ${list.length ? `<ul class="ex-list">${rows}</ul>` : '<p class="muted">No active exercises. Add some in Settings.</p>'}
    </section>
    <section class="card">
      <div class="switch-row">
        <label for="stretch-${date}">${isToday ? 'Stretched today' : 'Stretched'}</label>
        <span class="switch"><input type="checkbox" role="switch" id="stretch-${date}" data-action="stretch" data-date="${date}" ${day.stretched ? 'checked' : ''}><span></span></span>
      </div>
      ${day.stretched ? `<div class="inline-field">
        <label for="stretchmin-${date}">Minutes (optional)</label>
        <input id="stretchmin-${date}" class="short" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-action="stretch-min" data-date="${date}" value="${day.stretchMinutes ?? ''}" placeholder="–">
      </div>` : ''}
    </section>
    <section class="card">
      <h2><label for="notes-${date}">Notes</label></h2>
      <textarea id="notes-${date}" data-action="notes" data-date="${date}" placeholder="How did your shins feel?" maxlength="5000">${esc(day.notes)}</textarea>
    </section>`;
}

function renderHistory() {
  const [y, m] = historyMonth.split('-').map(Number);
  const train = trainingDays(data);
  const stretch = stretchDays(data);
  const first = `${historyMonth}-01`;
  const offset = (dateFromKey(first).getDay() + 6) % 7; // Monday first
  const total = daysInMonth(y, m);
  const monthName = dateFromKey(first).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const isCurrentMonth = historyMonth === todayKey.slice(0, 7);
  let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => `<div class="dow" aria-hidden="true">${d}</div>`).join('');
  for (let i = 0; i < offset; i++) cells += '<div class="day blank"></div>';
  for (let d = 1; d <= total; d++) {
    const key = `${historyMonth}-${String(d).padStart(2, '0')}`;
    const cls = ['day'];
    if (train.has(key)) cls.push('trained');
    if (stretch.has(key)) cls.push('stretched');
    if (key === todayKey) cls.push('today');
    if (key === selectedDay) cls.push('selected');
    const future = key > todayKey;
    const label = `${fmtLong(key)}${train.has(key) ? ', trained' : ''}${stretch.has(key) ? ', stretched' : ''}`;
    cells += `<button class="${cls.join(' ')}" data-action="pick-day" data-date="${key}" ${future ? 'disabled' : ''} aria-label="${esc(label)}" ${key === selectedDay ? 'aria-pressed="true"' : ''}>${d}</button>`;
  }
  const sel = selectedDay && selectedDay <= todayKey ? selectedDay : null;
  return `
    <section class="card">
      <div class="cal-head">
        <button class="icon-btn" data-action="month" data-dir="-1" aria-label="Previous month">‹</button>
        <h2>${monthName}</h2>
        <button class="icon-btn" data-action="month" data-dir="1" aria-label="Next month" ${isCurrentMonth ? 'disabled' : ''}>›</button>
      </div>
      <div class="cal">${cells}</div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Exercised</span><span><i style="background:var(--stretch);border-radius:50%"></i>Stretched</span><span><i style="border:2px solid var(--text)"></i>Today</span></div>
    </section>
    ${sel ? `<h2 class="day-title">${sel === todayKey ? 'Today' : esc(fmtLong(sel))}</h2>${renderDay(sel)}` : ''}`;
}

function renderProgress() {
  const s = computeStats(data, todayKey);
  const tiles = [
    [s.currentStreak, 'Current streak'],
    [s.bestStreak, 'Best streak'],
    [s.stretchStreak, 'Stretch streak'],
    [s.totalTrainingDays, 'Total training days'],
    [s.daysThisWeek, 'Days this week'],
    [s.daysThisMonth, 'Days this month'],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');

  const { earned, next } = s.milestones;
  const badges = MILESTONES.map((m) => {
    if (earned.includes(m)) return `<div class="badge earned"><div class="medal">${m}</div>${m} days</div>`;
    if (m === next) {
      const p = Math.round((Math.min(s.currentStreak, m) / m) * 100);
      return `<div class="badge next" style="--p:${p}"><div class="medal"><b>${m}</b></div>${m} days</div>`;
    }
    return `<div class="badge"><div class="medal">${m}</div>${m} days</div>`;
  }).join('');
  const nextInfo = next
    ? `<div class="next-info">Next badge: <b>${next} days</b> · ${Math.min(s.currentStreak, next)}/${next}<div class="bar"><i style="width:${Math.round((Math.min(s.currentStreak, next) / next) * 100)}%"></i></div></div>`
    : '<div class="next-info">All badges earned. Legendary shins.</div>';

  const exRows = exerciseStats(data, todayKey)
    .filter((x) => !x.exercise.archived || x.entryCount > 0)
    .map((x) => {
      const t = x.exercise.type;
      const diff = x.thisWeek - x.lastWeek;
      const trend = x.thisWeek || x.lastWeek ? (diff > 0 ? '<span class="up">▲</span>' : diff < 0 ? '<span class="down">▼</span>' : '<span class="muted">=</span>') : '';
      return `<div class="ex-stat">
        <div class="top"><span class="name">${esc(x.exercise.name)}${x.exercise.archived ? '<span class="tag">archived</span>' : ''}</span><span class="last">${relDay(x.lastDone)}</span></div>
        <div class="vol">This week <b>${formatVolume(x.thisWeek, t)}</b> · last week ${formatVolume(x.lastWeek, t)} ${trend}</div>
      </div>`;
    }).join('');

  return `
    <section class="card"><h2>Stats</h2><div class="stats">${tiles}</div></section>
    <section class="card"><h2>Milestones</h2><div class="badges">${badges}</div>${nextInfo}</section>
    <section class="card"><h2>Per exercise</h2>${exRows || '<p class="muted">No exercises yet.</p>'}</section>`;
}

function needsBackup() {
  if (!data.entries.length) return false;
  if (!data.lastExport) return true;
  return daysBetween(toDateKey(new Date(data.lastExport)), todayKey) > 30;
}

function renderSettings() {
  const active = data.exercises.filter((e) => !e.archived);
  const archived = data.exercises.filter((e) => e.archived);
  const activeRows = active.map((ex, i) => `<li>
      <button class="grow" data-action="edit-ex" data-ex="${esc(ex.id)}"><span>${esc(ex.name)}</span><small>${TYPES[ex.type]}${ex.type === 'reps' && ex.weighted ? ' + weight' : ''}</small></button>
      <button class="icon-btn" data-action="move" data-ex="${esc(ex.id)}" data-dir="-1" aria-label="Move ${esc(ex.name)} up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon-btn" data-action="move" data-ex="${esc(ex.id)}" data-dir="1" aria-label="Move ${esc(ex.name)} down" ${i === active.length - 1 ? 'disabled' : ''}>↓</button>
    </li>`).join('');
  const archivedRows = archived.map((ex) => `<li>
      <button class="grow" data-action="edit-ex" data-ex="${esc(ex.id)}"><span>${esc(ex.name)}</span><small>${TYPES[ex.type]}</small></button>
      <button class="btn" data-action="unarchive" data-ex="${esc(ex.id)}">Restore</button>
    </li>`).join('');

  let exportInfo;
  if (data.lastExport) {
    const k = toDateKey(new Date(data.lastExport));
    const ago = daysBetween(k, todayKey);
    exportInfo = `Last export: <b>${fmtShort(k)}</b> (${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`})`;
  } else {
    exportInfo = 'Never exported.';
  }
  const reminder = needsBackup()
    ? `<div class="notice">${data.lastExport ? 'It has been over 30 days since your last backup.' : 'You have not made a backup yet.'} Export a copy now and save it to Files or iCloud Drive.</div>`
    : '';

  return `
    <section class="card">
      <h2>Exercises</h2>
      <ul class="manage">${activeRows || '<li class="muted">No active exercises.</li>'}</ul>
      <button class="btn block" data-action="add-ex" style="margin-top:10px">+ Add exercise</button>
    </section>
    ${archived.length ? `<section class="card"><h2>Archived</h2><p class="hint" style="margin:0 0 6px">Hidden from Today, still shown in History.</p><ul class="manage">${archivedRows}</ul></section>` : ''}
    <section class="card">
      <h2>Backup</h2>
      <p class="small" style="margin:0">${exportInfo}</p>
      ${reminder}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn primary" data-action="export">Export JSON</button>
        <button class="btn" data-action="import">Import JSON</button>
      </div>
      <p class="hint">Data lives only on this device, in this app. The home-screen app and Safari keep separate data.</p>
    </section>
    <section class="card">
      <h2>Danger zone</h2>
      <button class="btn danger block" data-action="reset">Reset all data</button>
    </section>
    <p class="hint" style="text-align:center">Shin Tracker · ${data.entries.length} entries stored</p>`;
}

// ---------- Sheet ----------
let sheetSubmit = null;
let lastFocus = null;

function openSheet(html, onSubmit) {
  lastFocus = document.activeElement;
  sheet.innerHTML = html;
  sheet.hidden = false;
  backdrop.hidden = false;
  sheetSubmit = onSubmit;
  document.body.style.overflow = 'hidden';
  sheet.setAttribute('tabindex', '-1');
  sheet.focus({ preventScroll: true });
}

function closeSheet() {
  sheet.hidden = true;
  backdrop.hidden = true;
  sheet.innerHTML = '';
  sheetSubmit = null;
  document.body.style.overflow = '';
  lastFocus?.focus?.({ preventScroll: true });
}

function stepper(name, label, value, { decimal = false, step = 1, placeholder = '' } = {}) {
  return `<div class="field">
    <label for="f-${name}">${label}</label>
    <div class="stepper">
      <button type="button" data-step="-${step}" data-target="${name}" aria-label="Decrease ${label}">−</button>
      <input id="f-${name}" name="${name}" type="text" inputmode="${decimal ? 'decimal' : 'numeric'}" ${decimal ? '' : 'pattern="[0-9]*"'} autocomplete="off" value="${value ?? ''}" placeholder="${placeholder}">
      <button type="button" data-step="${step}" data-target="${name}" aria-label="Increase ${label}">+</button>
    </div>
  </div>`;
}

const DEFAULTS = { reps: { sets: 3, reps: 15 }, time: { sets: 3, seconds: 30 }, duration: { minutes: 5 } };

function openLogSheet({ exerciseId, date, entryId }) {
  const editing = entryId ? data.entries.find((e) => e.id === entryId) : null;
  const ex = exById(editing ? editing.exerciseId : exerciseId);
  if (!ex) return;
  const logDate = editing ? editing.date : date;
  const prev = editing ?? lastEntryFor(data, ex.id) ?? DEFAULTS[ex.type];
  let fields = '';
  if (ex.type === 'reps') {
    fields = `<div class="grid2">${stepper('sets', 'Sets', prev.sets ?? 3)}${stepper('reps', 'Reps', prev.reps ?? 15)}</div>`;
    if (ex.weighted || (editing && editing.weight)) fields += stepper('weight', 'Weight (kg, optional)', prev.weight ?? '', { decimal: true, step: 2.5, placeholder: 'none' });
  } else if (ex.type === 'time') {
    fields = `<div class="grid2">${stepper('sets', 'Sets', prev.sets ?? 3)}${stepper('seconds', 'Seconds per set', prev.seconds ?? 30, { step: 5 })}</div>`;
  } else {
    fields = stepper('minutes', 'Minutes', prev.minutes ?? 5, { decimal: true });
  }
  const dateLabel = logDate === todayKey ? 'Today' : fmtLong(logDate);
  openSheet(`
    <form id="log-form" novalidate>
      <h2 id="sheet-title">${esc(ex.name)}</h2>
      <p class="sub">${esc(dateLabel)}${ex.howto ? ` · ${esc(ex.howto)}` : ''}</p>
      ${fields}
      <p class="hint" id="form-error" role="alert" style="color:var(--danger)"></p>
      <div class="actions">
        ${editing ? '<button type="button" class="btn danger" data-action="delete-entry">Delete</button>' : '<button type="button" class="btn" data-action="close-sheet">Cancel</button>'}
        <button type="submit" class="btn primary">${editing ? 'Save' : 'Log it'}</button>
      </div>
    </form>`, (form) => {
    const f = new FormData(form);
    const val = (k) => parseNum(f.get(k));
    const entry = { sets: null, reps: null, weight: null, seconds: null, minutes: null };
    const bad = (msg) => { $('#form-error').textContent = msg; return false; };
    if (ex.type === 'reps') {
      entry.sets = val('sets'); entry.reps = val('reps');
      if (!Number.isInteger(entry.sets) || entry.sets < 1) return bad('Sets must be a whole number of at least 1.');
      if (!Number.isInteger(entry.reps) || entry.reps < 1) return bad('Reps must be a whole number of at least 1.');
      if (f.has('weight')) {
        const w = val('weight');
        if (Number.isNaN(w) || (w !== null && w < 0)) return bad('Weight must be a number (or empty).');
        entry.weight = w && w > 0 ? w : null;
      }
    } else if (ex.type === 'time') {
      entry.sets = val('sets'); entry.seconds = val('seconds');
      if (!Number.isInteger(entry.sets) || entry.sets < 1) return bad('Sets must be a whole number of at least 1.');
      if (!Number.isInteger(entry.seconds) || entry.seconds < 1) return bad('Seconds must be a whole number of at least 1.');
    } else {
      entry.minutes = val('minutes');
      if (!(entry.minutes > 0)) return bad('Minutes must be more than 0.');
    }
    if (editing) {
      Object.assign(editing, entry);
      persist();
      toast('Entry updated');
    } else {
      const before = computeStats(data, todayKey);
      const firstOfDay = entriesOn(logDate).length === 0;
      data.entries.push({ id: newId(), date: logDate, exerciseId: ex.id, ...entry, createdAt: Date.now() });
      persist();
      const after = computeStats(data, todayKey);
      const milestone = reachedMilestone(before.currentStreak, after.currentStreak);
      if (milestone) {
        celebrate({ big: true });
        toast(`🏅 ${milestone}-day streak! New badge earned.`, 3500);
      } else if (firstOfDay && logDate === todayKey) {
        celebrate();
        toast(after.currentStreak > 1 ? `🔥 ${after.currentStreak}-day streak!` : '🔥 Streak started!');
      } else {
        toast(`Logged ${formatEntry(entry, ex)}`);
      }
      if (firstOfDay && logDate === todayKey) requestAnimationFrame(() => $('#streak-flame')?.classList.add('pop'));
    }
    return true;
  });
  sheet.dataset.entryId = editing ? editing.id : '';
}

function openExerciseSheet(id) {
  const ex = id ? exById(id) : null;
  const hasEntries = ex ? data.entries.some((e) => e.exerciseId === ex.id) : false;
  const type = ex?.type ?? 'reps';
  openSheet(`
    <form id="ex-form" novalidate>
      <h2 id="sheet-title">${ex ? 'Edit exercise' : 'New exercise'}</h2>
      <p class="sub">${ex ? (ex.archived ? 'Archived: hidden from Today.' : '') : 'It will appear at the bottom of Today.'}</p>
      <div class="field"><label for="f-name">Name</label><input id="f-name" name="name" type="text" maxlength="80" autocomplete="off" value="${esc(ex?.name ?? '')}" required></div>
      <div class="field"><label for="f-howto">How-to (one line)</label><input id="f-howto" name="howto" type="text" maxlength="200" autocomplete="off" value="${esc(ex?.howto ?? '')}"></div>
      <div class="field"><label for="f-type">Measurement</label>
        <select id="f-type" name="type" ${hasEntries ? 'disabled' : ''}>
          ${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${v}${k === 'reps' ? ' (+ optional weight)' : k === 'time' ? ' (seconds)' : ' (minutes)'}</option>`).join('')}
        </select>
        ${hasEntries ? '<span class="hint" style="margin:0">Measurement can’t change once entries exist.</span>' : ''}
      </div>
      <label class="checkbox" id="weighted-row" ${type === 'reps' ? '' : 'hidden'}><input type="checkbox" name="weighted" ${ex?.weighted ? 'checked' : ''}> Track weight (kg)</label>
      <p class="hint" id="form-error" role="alert" style="color:var(--danger)"></p>
      <div class="actions">
        ${ex ? `<button type="button" class="btn" data-action="${ex.archived ? 'unarchive' : 'archive'}" data-ex="${esc(ex.id)}">${ex.archived ? 'Restore' : 'Archive'}</button>` : '<button type="button" class="btn" data-action="close-sheet">Cancel</button>'}
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>`, (form) => {
    const f = new FormData(form);
    const name = String(f.get('name') ?? '').trim();
    if (!name) { $('#form-error').textContent = 'Give the exercise a name.'; return false; }
    const t = hasEntries ? ex.type : String(f.get('type'));
    const patch = { name, howto: String(f.get('howto') ?? '').trim(), type: TYPES[t] ? t : 'reps', weighted: t === 'reps' && f.get('weighted') === 'on' };
    if (ex) Object.assign(ex, patch);
    else data.exercises.push({ id: newId(), archived: false, ...patch });
    persist();
    toast(ex ? 'Exercise saved' : 'Exercise added');
    return true;
  });
  $('#f-type', sheet)?.addEventListener('change', (e) => { $('#weighted-row', sheet).hidden = e.target.value !== 'reps'; });
}

// ---------- Toast ----------
let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Export / import ----------
async function exportData() {
  const stamp = new Date().toISOString();
  const payload = { ...data, lastExport: stamp, exportedAt: stamp, app: 'shin-tracker' };
  const json = JSON.stringify(payload, null, 2);
  const name = `shin-tracker-${todayKey}.json`;
  const file = new File([json], name, { type: 'application/json' });
  let done = false;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Shin Tracker backup' });
      done = true;
    } catch (err) {
      if (err?.name === 'AbortError') return; // user cancelled
    }
  }
  if (!done) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  data.lastExport = stamp;
  persist();
  render();
  toast('Backup exported');
}

async function importFile(file) {
  let next;
  try {
    next = normalize(JSON.parse(await file.text()));
  } catch (err) {
    toast(`Import failed: ${err.message}`, 4000);
    return;
  }
  const msg = `Replace ALL current data with this backup?\n\nBackup: ${next.entries.length} entries, ${next.exercises.length} exercises.\nCurrent: ${data.entries.length} entries.\n\nThis cannot be undone.`;
  if (!confirm(msg)) return;
  data = next;
  persist();
  render();
  toast('Backup imported');
}

function resetAll() {
  if (!confirm('Reset all data? Every log, note and custom exercise will be deleted.')) return;
  if (!confirm('Are you absolutely sure? This cannot be undone. Export a backup first if you might need it.')) return;
  data = defaultData();
  persist();
  selectedDay = todayKey;
  render();
  toast('All data reset');
}

// ---------- Events ----------
document.querySelector('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  if (tab === b.dataset.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  tab = b.dataset.tab;
  if (tab === 'history' && !selectedDay) selectedDay = todayKey;
  render();
  window.scrollTo(0, 0);
});

document.addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]');
  if (step) {
    const input = sheet.querySelector(`[name="${step.dataset.target}"]`);
    const cur = parseNum(input.value);
    const next = Math.max(0, (Number.isFinite(cur) ? cur : 0) + Number(step.dataset.step));
    input.value = Math.round(next * 100) / 100;
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el || el.matches('input, textarea')) return;
  const a = el.dataset.action;
  const ex = el.dataset.ex;
  switch (a) {
    case 'log': openLogSheet({ exerciseId: ex, date: el.dataset.date }); break;
    case 'edit-entry': openLogSheet({ entryId: el.dataset.id }); break;
    case 'delete-entry': {
      const id = sheet.dataset.entryId;
      const entry = data.entries.find((x) => x.id === id);
      if (!entry || !confirm(`Delete this entry (${formatEntry(entry, exById(entry.exerciseId))})?`)) return;
      data.entries = data.entries.filter((x) => x.id !== id);
      persist(); closeSheet(); render(); toast('Entry deleted');
      break;
    }
    case 'close-sheet': closeSheet(); break;
    case 'pick-day': selectedDay = el.dataset.date; render(); break;
    case 'month': {
      const [y, m] = historyMonth.split('-').map(Number);
      const d = new Date(y, m - 1 + Number(el.dataset.dir), 1, 12);
      historyMonth = toDateKey(d).slice(0, 7);
      if (historyMonth > todayKey.slice(0, 7)) historyMonth = todayKey.slice(0, 7);
      render();
      break;
    }
    case 'add-ex': openExerciseSheet(null); break;
    case 'edit-ex': openExerciseSheet(ex); break;
    case 'move': {
      const active = data.exercises.filter((x) => !x.archived);
      const i = active.findIndex((x) => x.id === ex);
      const j = i + Number(el.dataset.dir);
      if (i < 0 || j < 0 || j >= active.length) return;
      const ia = data.exercises.indexOf(active[i]);
      const ib = data.exercises.indexOf(active[j]);
      [data.exercises[ia], data.exercises[ib]] = [data.exercises[ib], data.exercises[ia]];
      persist(); render();
      break;
    }
    case 'archive':
    case 'unarchive': {
      const x = exById(ex);
      if (!x) return;
      x.archived = a === 'archive';
      persist();
      if (!sheet.hidden) closeSheet();
      render();
      toast(x.archived ? `${x.name} archived` : `${x.name} restored`);
      break;
    }
    case 'export': exportData(); break;
    case 'import': $('#import-file').click(); break;
    case 'reset': resetAll(); break;
  }
});

backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

sheet.addEventListener('submit', (e) => {
  e.preventDefault();
  if (sheetSubmit && sheetSubmit(e.target) !== false) {
    closeSheet();
    render();
  }
});

view.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.action === 'stretch') {
    setDay(el.dataset.date, { stretched: el.checked, ...(el.checked ? {} : { stretchMinutes: null }) });
    render();
    if (el.checked) toast('Stretch logged');
  }
});

view.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.action === 'notes') setDay(el.dataset.date, { notes: el.value });
  if (el.dataset.action === 'stretch-min') {
    const n = parseNum(el.value);
    setDay(el.dataset.date, { stretchMinutes: Number.isFinite(n) && n >= 0 ? n : null });
  }
});

$('#import-file').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) importFile(file);
});

// Pick up a new day if the app stays open past midnight or is resumed later.
function checkDate() {
  const k = toDateKey();
  if (k !== todayKey) {
    if (selectedDay === todayKey) selectedDay = k;
    if (historyMonth === todayKey.slice(0, 7)) historyMonth = k.slice(0, 7);
    todayKey = k;
    if (sheet.hidden) render();
  }
}
setInterval(checkDate, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDate(); });

// Keep multiple open tabs consistent.
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) { data = load().data; if (sheet.hidden) render(); }
});

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support unavailable */ });
  });
}

