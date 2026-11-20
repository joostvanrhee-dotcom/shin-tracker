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
  { id: 'tibialis-raises', name: 'Tibialis raises', howto: 'Back against a wall, heels a foot out: lift your toes high, lower slowly.', type: 'reps', weighted: true },
  { id: 'heel-walks', name: 'Heel walks', howto: 'Walk on your heels with your toes pulled up high.', type: 'time' },
  { id: 'toe-walks', name: 'Toe walks', howto: 'Walk tall on the balls of your feet, heels lifted.', type: 'time' },
  { id: 'band-dorsiflexion', name: 'Resistance band dorsiflexion', howto: 'Band over the top of your foot: pull your toes toward your shin.', type: 'reps' },
  { id: 'eccentric-calf-raises', name: 'Eccentric calf raises', howto: 'Rise up, then lower slowly over 3–4 seconds.', type: 'reps', weighted: true },
  { id: 'soleus-calf-raises', name: 'Bent-knee (soleus) calf raises', howto: 'Knees bent, rise onto your toes and lower with control.', type: 'reps', weighted: true },
  { id: 'single-leg-calf-raises', name: 'Single-leg calf raises', howto: 'On one foot: full range up, all the way down.', type: 'reps' },
  { id: 'ankle-circles', name: 'Ankle circles / alphabet', howto: 'Trace circles or the alphabet with your toes, each foot.', type: 'reps' },
  { id: 'foam-rolling-calves', name: 'Foam rolling calves', howto: 'Roll slowly from ankle to knee, pause on tight spots.', type: 'duration' },
].map((e) => ({ weighted: false, archived: false, ...e }));

export function defaultData() {
  return {
    version: DATA_VERSION,
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

  const exercises = [];
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
