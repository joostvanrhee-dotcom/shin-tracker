import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, defaultData, DEFAULT_EXERCISES, SETUP_VERSION } from '../js/store.js';

const ids = (d) => d.exercises.map((e) => e.id);

test('fresh data has only the three daily exercises', () => {
  const d = defaultData();
  assert.deepEqual(ids(d), ['standing-calf-raises', 'soleus-calf-raises', 'band-ankle-eversion']);
  assert.equal(d.setupVersion, SETUP_VERSION);
});

test('old default list migrates: unused removed, used archived, custom kept, history intact', () => {
  const old = {
    version: 1,
    exercises: [
      { id: 'tibialis-raises', name: 'Tibialis raises', type: 'reps', weighted: true },
      { id: 'heel-walks', name: 'Heel walks', type: 'time' },
      { id: 'soleus-calf-raises', name: 'Bent-knee (soleus) calf raises', type: 'reps', weighted: true },
      { id: 'my-own', name: 'My own', type: 'reps' },
    ],
    entries: [
      { id: 'a', date: '2026-11-20', exerciseId: 'tibialis-raises', sets: 3, reps: 15 },
      { id: 'b', date: '2026-11-20', exerciseId: 'soleus-calf-raises', sets: 3, reps: 12 },
    ],
    days: { '2026-11-20': { stretched: true } },
  };
  const d = normalize(old);
  assert.deepEqual(ids(d), ['standing-calf-raises', 'soleus-calf-raises', 'band-ankle-eversion', 'tibialis-raises', 'my-own']);
  assert.equal(d.exercises.find((e) => e.id === 'tibialis-raises').archived, true);
  assert.equal(d.exercises.find((e) => e.id === 'soleus-calf-raises').name, 'Bent-knee calf raises');
  assert.equal(d.exercises.find((e) => e.id === 'my-own').archived, false);
  assert.equal(d.entries.length, 2);
  assert.equal(d.days['2026-11-20'].stretched, true);
});

test('migrated data is not migrated again (user edits survive)', () => {
  const d = normalize(defaultData());
  d.exercises.reverse();
  d.exercises[0].archived = true;
  const again = normalize(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(ids(again), ids(d));
  assert.equal(again.exercises[0].archived, true);
  assert.equal(DEFAULT_EXERCISES.length, 3);
});
