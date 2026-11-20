// Pure date, streak and statistics helpers. No DOM, no storage, no globals.
// Days are always local calendar days stored as "YYYY-MM-DD" strings.

export const MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar day of a Date as "YYYY-MM-DD" (never UTC). */
export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const { y, m, d } = parseDateKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

/** A local Date at noon on that day (noon is never skipped or repeated by DST). */
export function dateFromKey(key) {
  const { y, m, d } = parseDateKey(key);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Shift a day key by n calendar days. DST-safe: works on calendar components. */
export function addDays(key, n) {
  const { y, m, d } = parseDateKey(key);
  return toDateKey(new Date(y, m - 1, d + n, 12, 0, 0, 0));
}

/** Integer day index independent of time zone and DST. */
export function dayNumber(key) {
  const { y, m, d } = parseDateKey(key);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function daysBetween(fromKey, toKey) {
  return dayNumber(toKey) - dayNumber(fromKey);
}

/** Monday of the week containing key. */
export function startOfWeek(key) {
  const dow = dateFromKey(key).getDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

export function startOfMonth(key) {
  return key.slice(0, 8) + '01';
}

/** Number of days in month m (1-12) of year y. */
export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ---------- Day sets ----------

/** Days with at least one exercise entry. */
export function trainingDays(data) {
  const set = new Set();
  for (const e of data?.entries ?? []) if (isDateKey(e.date)) set.add(e.date);
  return set;
}

/** Days marked as stretched. */
export function stretchDays(data) {
  const set = new Set();
  for (const [key, day] of Object.entries(data?.days ?? {})) {
    if (day && day.stretched && isDateKey(key)) set.add(key);
  }
  return set;
}

// ---------- Streaks ----------

/** Consecutive days in `set` ending at (and including) `endKey`. */
export function streakEndingAt(set, endKey) {
  let count = 0;
  let key = endKey;
  while (set.has(key)) {
    count++;
    key = addDays(key, -1);
  }
  return count;
}

/**
 * Current streak. If today is not logged yet, the streak ending yesterday is
 * still alive (it only breaks after a full day with nothing logged).
 */
export function currentStreak(set, todayKey) {
  if (set.has(todayKey)) {
    return { count: streakEndingAt(set, todayKey), loggedToday: true };
  }
  return { count: streakEndingAt(set, addDays(todayKey, -1)), loggedToday: false };
}

/** Longest run of consecutive days anywhere in the set. */
export function bestStreak(set) {
  const nums = [...set].map(dayNumber).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const n of nums) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = n;
  }
  return best;
}

/** Count of keys in set between start and end (inclusive). */
export function countInRange(set, startKey, endKey) {
  let c = 0;
  for (const k of set) if (k >= startKey && k <= endKey) c++;
  return c;
}

// ---------- Milestones ----------

export function milestoneStatus(best, current) {
  const earned = MILESTONES.filter((m) => best >= m);
  const next = MILESTONES.find((m) => best < m) ?? null;
  return {
    earned,
    next,
    progress: next ? Math.min(current, next) / next : 1,
  };
}

/** Highest milestone crossed when the current streak goes from `before` to `after`. */
export function reachedMilestone(before, after) {
  let hit = null;
  for (const m of MILESTONES) if (before < m && after >= m) hit = m;
  return hit;
}

// ---------- Overall stats ----------

export function computeStats(data, todayKey) {
  const train = trainingDays(data);
  const stretch = stretchDays(data);
  const cur = currentStreak(train, todayKey);
  const best = bestStreak(train);
  return {
    currentStreak: cur.count,
    loggedToday: cur.loggedToday,
    bestStreak: best,
    stretchStreak: currentStreak(stretch, todayKey).count,
    stretchedToday: stretch.has(todayKey),
    bestStretchStreak: bestStreak(stretch),
    totalTrainingDays: train.size,
    daysThisWeek: countInRange(train, startOfWeek(todayKey), todayKey),
    daysThisMonth: countInRange(train, startOfMonth(todayKey), todayKey),
    milestones: milestoneStatus(best, cur.count),
  };
}

// ---------- Per exercise ----------

/** Volume of one entry: reps for "reps", seconds for "time", minutes for "duration". */
export function entryVolume(entry, type) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  if (type === 'reps') return n(entry.sets) * n(entry.reps);
  if (type === 'time') return n(entry.sets) * n(entry.seconds);
  if (type === 'duration') return n(entry.minutes);
  return 0;
}

export function exerciseStats(data, todayKey) {
  const weekStart = startOfWeek(todayKey);
  const lastWeekStart = addDays(weekStart, -7);
  const lastWeekEnd = addDays(weekStart, -1);
  return (data?.exercises ?? []).map((ex) => {
    let lastDone = null;
    let thisWeek = 0;
    let lastWeek = 0;
    let count = 0;
    for (const e of data.entries ?? []) {
      if (e.exerciseId !== ex.id) continue;
      count++;
      if (!lastDone || e.date > lastDone) lastDone = e.date;
      const v = entryVolume(e, ex.type);
      if (e.date >= weekStart && e.date <= todayKey) thisWeek += v;
      else if (e.date >= lastWeekStart && e.date <= lastWeekEnd) lastWeek += v;
    }
    return { exercise: ex, lastDone, thisWeek, lastWeek, entryCount: count };
  });
}

/** Most recent entry for an exercise (by date, then creation time). */
export function lastEntryFor(data, exerciseId) {
  let best = null;
  for (const e of data?.entries ?? []) {
    if (e.exerciseId !== exerciseId) continue;
    if (!best || e.date > best.date || (e.date === best.date && (e.createdAt ?? 0) > (best.createdAt ?? 0))) best = e;
  }
  return best;
}

// ---------- Formatting ----------

const num = (v) => {
  const x = Number(v);
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100);
};

/** Short summary like "3 × 15 @ 5 kg", "3 × 30 s" or "10 min". */
export function formatEntry(entry, exercise) {
  const type = exercise?.type;
  if (type === 'reps') {
    const w = entry.weight !== null && entry.weight !== undefined && entry.weight !== '' && Number(entry.weight) > 0
      ? ` @ ${num(entry.weight)} kg` : '';
    return `${num(entry.sets)} × ${num(entry.reps)}${w}`;
  }
  if (type === 'time') return `${num(entry.sets)} × ${num(entry.seconds)} s`;
  if (type === 'duration') return `${num(entry.minutes)} min`;
  return '';
}

/** Weekly volume label for an exercise type. */
export function formatVolume(value, type) {
  if (type === 'reps') return `${num(value)} reps`;
  if (type === 'time') return `${num(Math.round((value / 60) * 10) / 10)} min`;
  return `${num(value)} min`;
}
