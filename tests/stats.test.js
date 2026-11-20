import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDateKey, addDays, daysBetween, startOfWeek, isDateKey, daysInMonth,
  trainingDays, stretchDays, currentStreak, bestStreak, computeStats,
  reachedMilestone, milestoneStatus, exerciseStats, formatEntry, lastEntryFor,
} from '../js/stats.js';

const EX = [
  { id: 'tib', name: 'Tibialis raises', type: 'reps', weighted: true },
  { id: 'heel', name: 'Heel walks', type: 'time' },
  { id: 'roll', name: 'Foam rolling', type: 'duration' },
];

let seq = 0;
function dataWith(dates, { stretched = [] } = {}) {
  return {
    version: 1,
    exercises: EX,
    entries: dates.map((date) => ({ id: `e${seq++}`, date, exerciseId: 'tib', sets: 3, reps: 15, createdAt: seq })),
    days: Object.fromEntries(stretched.map((d) => [d, { stretched: true }])),
  };
}

function withTZ(tz, fn) {
  const prev = process.env.TZ;
  before(() => { process.env.TZ = tz; });
  after(() => { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; });
  fn();
}

describe('empty data', () => {
  test('all stats are zero', () => {
    const s = computeStats({ exercises: [], entries: [], days: {} }, '2026-11-20');
    assert.equal(s.currentStreak, 0);
    assert.equal(s.bestStreak, 0);
    assert.equal(s.stretchStreak, 0);
    assert.equal(s.totalTrainingDays, 0);
    assert.equal(s.daysThisWeek, 0);
    assert.equal(s.daysThisMonth, 0);
    assert.equal(s.loggedToday, false);
    assert.deepEqual(s.milestones.earned, []);
    assert.equal(s.milestones.next, 3);
  });
  test('handles missing fields', () => {
    const s = computeStats({}, '2026-11-20');
    assert.equal(s.currentStreak, 0);
  });
});

describe('current streak', () => {
  test('today logged counts today', () => {
    const s = computeStats(dataWith(['2026-11-18', '2026-11-19', '2026-11-20']), '2026-11-20');
    assert.equal(s.currentStreak, 3);
    assert.equal(s.loggedToday, true);
  });

  test('today not yet logged keeps streak ending yesterday', () => {
    const s = computeStats(dataWith(['2026-11-17', '2026-11-18', '2026-11-19']), '2026-11-20');
    assert.equal(s.currentStreak, 3);
    assert.equal(s.loggedToday, false);
  });

  test('a full missed day breaks the streak', () => {
    const s = computeStats(dataWith(['2026-11-17', '2026-11-18']), '2026-11-20');
    assert.equal(s.currentStreak, 0);
    assert.equal(s.bestStreak, 2);
  });

  test('a gap in the middle breaks the streak', () => {
    const s = computeStats(dataWith(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-18', '2026-11-19', '2026-11-20']), '2026-11-20');
    assert.equal(s.currentStreak, 3);
    assert.equal(s.bestStreak, 3);
  });

  test('backfilling the gap joins both runs', () => {
    const data = dataWith(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-18', '2026-11-19', '2026-11-20']);
    data.entries.push({ id: 'fill', date: '2026-11-17', exerciseId: 'heel', sets: 2, seconds: 30, createdAt: 999 });
    const s = computeStats(data, '2026-11-20');
    assert.equal(s.currentStreak, 7);
    assert.equal(s.bestStreak, 7);
    assert.equal(s.totalTrainingDays, 7);
  });

  test('multiple entries on one day count once', () => {
    const s = computeStats(dataWith(['2026-11-20', '2026-11-20', '2026-11-20']), '2026-11-20');
    assert.equal(s.currentStreak, 1);
    assert.equal(s.totalTrainingDays, 1);
  });

  test('deleting a past entry lowers the best streak (recalculated, not stored)', () => {
    const data = dataWith(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
    assert.equal(bestStreak(trainingDays(data)), 4);
    data.entries = data.entries.filter((e) => e.date !== '2026-11-03');
    assert.equal(bestStreak(trainingDays(data)), 2);
  });
});

describe('stretch streak is separate', () => {
  test('stretching alone does not count toward the main streak', () => {
    const data = dataWith([], { stretched: ['2026-11-18', '2026-11-19', '2026-11-20'] });
    const s = computeStats(data, '2026-11-20');
    assert.equal(s.currentStreak, 0);
    assert.equal(s.stretchStreak, 3);
    assert.equal(s.stretchedToday, true);
  });
  test('unticked stretch days are ignored', () => {
    const data = { entries: [], days: { '2026-11-20': { stretched: false, notes: 'x' } } };
    assert.equal(stretchDays(data).size, 0);
  });
});

describe('month and year boundaries', () => {
  test('streak across month end', () => {
    const s = computeStats(dataWith(['2026-10-30', '2026-10-31', '2026-11-01']), '2026-11-01');
    assert.equal(s.currentStreak, 3);
    assert.equal(s.daysThisMonth, 1);
  });
  test('streak across February in a leap year', () => {
    const s = computeStats(dataWith(['2028-02-28', '2028-02-29', '2028-03-01']), '2028-03-01');
    assert.equal(s.currentStreak, 3);
    assert.equal(addDays('2027-02-28', 1), '2027-03-01');
    assert.equal(daysInMonth(2028, 2), 29);
    assert.equal(daysInMonth(2027, 2), 28);
  });
  test('streak across year end', () => {
    const s = computeStats(dataWith(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']), '2027-01-02');
    assert.equal(s.currentStreak, 4);
    assert.equal(s.bestStreak, 4);
    assert.equal(s.daysThisMonth, 2);
    assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  });
  test('yesterday-rule across year end', () => {
    const s = computeStats(dataWith(['2026-12-30', '2026-12-31']), '2027-01-01');
    assert.equal(s.currentStreak, 2);
    assert.equal(s.loggedToday, false);
  });
  test('week starts on Monday and spans months', () => {
    assert.equal(startOfWeek('2026-11-20'), '2026-11-16'); // Friday -> Monday
    assert.equal(startOfWeek('2026-11-16'), '2026-11-16');
    assert.equal(startOfWeek('2026-11-22'), '2026-11-16'); // Sunday
    assert.equal(startOfWeek('2027-01-01'), '2026-12-28');
    const s = computeStats(dataWith(['2026-12-28', '2026-12-31', '2027-01-01']), '2027-01-01');
    assert.equal(s.daysThisWeek, 3);
  });
});

describe('date keys', () => {
  test('toDateKey uses local date, not UTC', () => {
    const d = new Date(2026, 0, 1, 0, 30); // 00:30 local on Jan 1
    assert.equal(toDateKey(d), '2026-01-01');
  });
  test('isDateKey validates', () => {
    assert.ok(isDateKey('2026-02-28'));
    assert.ok(!isDateKey('2026-02-30'));
    assert.ok(!isDateKey('2026-2-3'));
    assert.ok(!isDateKey(null));
  });
});

for (const tz of ['Europe/Amsterdam', 'America/New_York', 'America/Santiago', 'Australia/Lord_Howe']) {
  describe(`daylight-saving changes (${tz})`, () => {
    withTZ(tz, () => {
      test('time zone is active', () => {
        assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, tz);
      });
      test('addDays and daysBetween across spring-forward and fall-back', () => {
        // Europe: 2026-03-29 / 2026-10-25. US: 2026-03-08 / 2026-11-01.
        // Chile: 2026-04-05 / 2026-09-06 (midnight changes). Lord Howe: 30-minute shift.
        for (const day of ['2026-03-08', '2026-03-29', '2026-04-05', '2026-09-06', '2026-10-04', '2026-10-25', '2026-11-01']) {
          const next = addDays(day, 1);
          const prev = addDays(day, -1);
          assert.equal(daysBetween(prev, day), 1, `${prev} -> ${day}`);
          assert.equal(daysBetween(day, next), 1, `${day} -> ${next}`);
          assert.equal(addDays(next, -1), day);
          assert.equal(addDays(prev, 1), day);
        }
        assert.equal(addDays('2026-03-28', 2), '2026-03-30');
        assert.equal(addDays('2026-10-24', 2), '2026-10-26');
        assert.equal(addDays('2026-09-05', 1), '2026-09-06');
      });
      test('streak spans DST transitions', () => {
        const spring = computeStats(dataWith(['2026-03-28', '2026-03-29', '2026-03-30']), '2026-03-30');
        assert.equal(spring.currentStreak, 3);
        const fall = computeStats(dataWith(['2026-10-24', '2026-10-25', '2026-10-26']), '2026-10-26');
        assert.equal(fall.currentStreak, 3);
        const chile = computeStats(dataWith(['2026-09-05', '2026-09-06', '2026-09-07']), '2026-09-07');
        assert.equal(chile.currentStreak, 3);
        const us = computeStats(dataWith(['2026-03-07', '2026-03-08', '2026-03-09', '2026-10-31', '2026-11-01', '2026-11-02']), '2026-11-02');
        assert.equal(us.currentStreak, 3);
        assert.equal(us.bestStreak, 3);
      });
      test('late-evening timestamps keep their local day', () => {
        assert.equal(toDateKey(new Date(2026, 2, 29, 23, 59)), '2026-03-29');
        assert.equal(toDateKey(new Date(2026, 9, 25, 0, 1)), '2026-10-25');
        assert.equal(toDateKey(new Date(2026, 8, 6, 12)), '2026-09-06');
      });
      test('week counts across DST', () => {
        assert.equal(startOfWeek('2026-03-29'), '2026-03-23');
        assert.equal(startOfWeek('2026-10-26'), '2026-10-26');
      });
    });
  });
}

describe('milestones', () => {
  test('earned and next', () => {
    const m = milestoneStatus(8, 5);
    assert.deepEqual(m.earned, [3, 7]);
    assert.equal(m.next, 14);
    assert.equal(m.progress, 5 / 14);
    const all = milestoneStatus(400, 400);
    assert.equal(all.next, null);
    assert.equal(all.progress, 1);
  });
  test('reachedMilestone', () => {
    assert.equal(reachedMilestone(2, 3), 3);
    assert.equal(reachedMilestone(3, 4), null);
    assert.equal(reachedMilestone(5, 15), 14); // backfill can jump past several
    assert.equal(reachedMilestone(0, 1), null);
  });
});

describe('per exercise stats', () => {
  test('this week vs last week and last done', () => {
    const data = {
      exercises: EX,
      entries: [
        { id: 'a', date: '2026-11-20', exerciseId: 'tib', sets: 3, reps: 15 },
        { id: 'b', date: '2026-11-16', exerciseId: 'tib', sets: 2, reps: 10 },
        { id: 'c', date: '2026-11-15', exerciseId: 'tib', sets: 3, reps: 10 },
        { id: 'd', date: '2026-11-09', exerciseId: 'tib', sets: 1, reps: 10 },
        { id: 'e', date: '2026-11-08', exerciseId: 'tib', sets: 9, reps: 9 }, // two weeks ago
        { id: 'f', date: '2026-11-19', exerciseId: 'heel', sets: 3, seconds: 30 },
        { id: 'g', date: '2026-11-12', exerciseId: 'roll', minutes: 10 },
      ],
      days: {},
    };
    const [tib, heel, roll] = exerciseStats(data, '2026-11-20');
    assert.equal(tib.lastDone, '2026-11-20');
    assert.equal(tib.thisWeek, 65);
    assert.equal(tib.lastWeek, 40);
    assert.equal(heel.thisWeek, 90);
    assert.equal(roll.thisWeek, 0);
    assert.equal(roll.lastWeek, 10);
    assert.equal(roll.lastDone, '2026-11-12');
  });
  test('lastEntryFor picks newest date then newest creation', () => {
    const data = {
      entries: [
        { id: '1', date: '2026-11-19', exerciseId: 'tib', createdAt: 5 },
        { id: '2', date: '2026-11-20', exerciseId: 'tib', createdAt: 1 },
        { id: '3', date: '2026-11-20', exerciseId: 'tib', createdAt: 2 },
      ],
    };
    assert.equal(lastEntryFor(data, 'tib').id, '3');
    assert.equal(lastEntryFor(data, 'nope'), null);
  });
  test('formatEntry', () => {
    assert.equal(formatEntry({ sets: 3, reps: 15, weight: 5 }, EX[0]), '3 × 15 @ 5 kg');
    assert.equal(formatEntry({ sets: 3, reps: 15, weight: null }, EX[0]), '3 × 15');
    assert.equal(formatEntry({ sets: 3, reps: 12, weight: 2.5 }, EX[0]), '3 × 12 @ 2.5 kg');
    assert.equal(formatEntry({ sets: 2, seconds: 45 }, EX[1]), '2 × 45 s');
    assert.equal(formatEntry({ minutes: 8 }, EX[2]), '8 min');
  });
});
