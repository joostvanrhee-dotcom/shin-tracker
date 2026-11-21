// localStorage persistence: one versioned key, validated on load and import.
import { isDateKey } from './stats.js';

export const STORAGE_KEY = 'shinTracker.v1';
export const DATA_VERSION = 1;
export const TYPES = {
  reps: 'Sets × reps',
  time: 'Sets × time',
  duration: 'Time only',
};

export const DEFAULT_EXERCISES = [
  { id: 'standing-calf-raises', name: 'Standing calf raises', howto: 'Straight knees: rise high onto your toes, lower slowly all the way down.', type: 'reps', weighted: true },
  { id: 'soleus-calf-raises', name: 'Bent-knee calf raises', howto: 'Knees bent: rise onto your toes and lower with control.', type: 'reps', weighted: true },
  { id: 'band-ankle-eversion', name: 'Band ankle eversion', howto: 'Seated, band over the top of your feet: heel down, turn your foot outward, return slowly.', type: 'reps' },
].map((e) => ({ weighted: false, archived: false, ...e }));

// Bump when the default exercise list changes; older data is migrated in migrateExercises().
export const SETUP_VERSION = 2;

// Exercises that were defaults in setup version 1.
const V1_DEFAULT_IDS = new Set(['tibialis-raises', 'heel-walks', 'toe-walks', 'band-dorsiflexion', 'eccentric-calf-raises',
  'soleus-calf-raises', 'single-leg-calf-raises', 'ankle-circles', 'foam-rolling-calves']);

/**
 * Switch data created with the old default list to the current one:
 * old defaults without history are removed, old defaults with history are archived
 * (so History still shows them), custom exercises are kept, and the current
 * defaults are put first.
 */
export function migrateExercises(exercises, entries) {
  const used = new Set(entries.map((e) => e.exerciseId));
  const currentIds = new Set(DEFAULT_EXERCISES.map((e) => e.id));
  const kept = [];
  for (const ex of exercises) {
    if (currentIds.has(ex.id)) continue; // re-added below with current name and how-to
    if (V1_DEFAULT_IDS.has(ex.id)) {
      if (used.has(ex.id)) kept.push({ ...ex, archived: true });
    } else {
      kept.push(ex);
    }
  }
  const defaults = DEFAULT_EXERCISES.map((d) => {
    const old = exercises.find((e) => e.id === d.id);
    return { ...d, weighted: old ? old.weighted || d.weighted : d.weighted };
  });
  return [...defaults, ...kept];
}

export function defaultData() {
  return {
    version: DATA_VERSION,
    setupVersion: SETUP_VERSION,
    exercises: DEFAULT_EXERCISES.map((e) => ({ ...e })),
    entries: [],
    days: {},
    lastExport: null,
  };
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const posNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Validate and clean data from storage or an import. Throws on unusable input. */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a Shin Tracker backup.');
  if (raw.version !== DATA_VERSION) throw new Error(`Unsupported data version: ${raw.version}`);
  if (!Array.isArray(raw.exercises) || !Array.isArray(raw.entries)) throw new Error('Backup is missing exercises or entries.');

  let exercises = [];
  const seen = new Set();
  for (const e of raw.exercises) {
    if (!e || typeof e.id !== 'string' || seen.has(e.id) || typeof e.name !== 'string') continue;
    seen.add(e.id);
    exercises.push({
      id: e.id,
      name: e.name.slice(0, 80),
      howto: typeof e.howto === 'string' ? e.howto.slice(0, 200) : '',
      type: TYPES[e.type] ? e.type : 'reps',
      weighted: !!e.weighted,
      archived: !!e.archived,
    });
  }

  const entries = [];
  for (const e of raw.entries) {
    if (!e || !isDateKey(e.date) || typeof e.exerciseId !== 'string') continue;
    entries.push({
      id: typeof e.id === 'string' ? e.id : newId(),
      date: e.date,
      exerciseId: e.exerciseId,
      sets: posNum(e.sets),
      reps: posNum(e.reps),
      weight: posNum(e.weight),
      seconds: posNum(e.seconds),
      minutes: posNum(e.minutes),
      createdAt: Number(e.createdAt) || 0,
    });
  }

  if (raw.setupVersion !== SETUP_VERSION) {
    exercises = migrateExercises(exercises, entries);
    seen.clear();
    for (const ex of exercises) seen.add(ex.id);
  }

  // Entries whose exercise is missing get a placeholder (archived) exercise so history stays readable.
  for (const e of entries) {
    if (!seen.has(e.exerciseId)) {
      seen.add(e.exerciseId);
      exercises.push({ id: e.exerciseId, name: 'Unknown exercise', howto: '', type: e.minutes != null ? 'duration' : e.seconds != null ? 'time' : 'reps', weighted: false, archived: true });
    }
  }

  const days = {};
  if (raw.days && typeof raw.days === 'object') {
    for (const [k, d] of Object.entries(raw.days)) {
      if (!isDateKey(k) || !d || typeof d !== 'object') continue;
      const day = {
        stretched: !!d.stretched,
        stretchMinutes: posNum(d.stretchMinutes),
        notes: typeof d.notes === 'string' ? d.notes.slice(0, 5000) : '',
      };
      if (day.stretched || day.notes || day.stretchMinutes != null) days[k] = day;
    }
  }

  return {
    version: DATA_VERSION,
    setupVersion: SETUP_VERSION,
    exercises,
    entries,
    days,
    lastExport: typeof raw.lastExport === 'string' ? raw.lastExport : null,
  };
}

/** Load data; returns { data, error }. Unreadable data is backed up, never silently dropped. */
export function load() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    return { data: defaultData(), error: 'Storage is unavailable. Your logs will not be saved.' };
  }
  if (!raw) return { data: defaultData(), error: null };
  try {
    return { data: normalize(JSON.parse(raw)), error: null };
  } catch (err) {
    try { localStorage.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, raw); } catch { /* ignore */ }
    return { data: defaultData(), error: 'Saved data could not be read; a copy was kept and the app was reset.' };
  }
}

export function save(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
