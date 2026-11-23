const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../src/storage.js');
const rules = require('../src/rules.js');

const NOW = '2026-11-24T12:00:00.000Z';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
    keys: () => Object.keys(data)
  };
}

function v1State(overrides = {}) {
  return {
    tasks: [
      {
        id: 'a',
        title: 'Low task',
        type: 'Quick task',
        date: '',
        priority: 'low',
        done: true,
        createdAt: NOW,
        rewardGranted: true,
        grantedReward: { xp: 10, coins: 3, resource: 'wood', amount: 1, label: 'Wood' }
      },
      {
        id: 'b',
        title: 'Open task',
        type: 'Project',
        date: '',
        priority: 'high',
        done: false,
        createdAt: NOW
      }
    ],
    xp: 10,
    coins: 3,
    resources: { wood: 1, stone: 0, iron: 0 },
    completed: 1,
    ...overrides
  };
}

test('emptyState is valid and has no legacy totals fields', () => {
  const state = storage.emptyState();
  assert.deepEqual(state, {
    schemaVersion: 2,
    baseline: { xp: 0, coins: 0, resources: { wood: 0, stone: 0, iron: 0 } },
    tasks: [],
    ledger: []
  });
  assert.equal(storage.validateState(state).ok, true);
  assert.equal('xp' in state, false);
  assert.equal('completed' in state, false);
});

test('loadState returns an empty state when nothing is stored', () => {
  const store = fakeStorage();
  const loaded = storage.loadState(store, { now: NOW });
  assert.equal(loaded.source, 'empty');
  assert.equal(loaded.migrated, false);
  assert.deepEqual(loaded.state, storage.emptyState());
  assert.deepEqual(store.keys(), []);
});

test('saveState writes only the v2 key and round-trips', () => {
  const store = fakeStorage();
  const state = storage.emptyState();
  state.baseline = { xp: 5, coins: 2, resources: { wood: 1, stone: 0, iron: 0 } };
  const saved = storage.saveState(store, state);
  assert.equal(saved.ok, true);
  assert.deepEqual(store.keys(), [storage.V2_KEY]);
  const loaded = storage.loadState(store, { now: NOW });
  assert.equal(loaded.source, 'v2');
  assert.deepEqual(loaded.state, state);
});

test('saveState rejects invalid state without writing', () => {
  const store = fakeStorage();
  const bad = storage.emptyState();
  bad.baseline.xp = -1;
  const saved = storage.saveState(store, bad);
  assert.equal(saved.ok, false);
  assert.deepEqual(store.keys(), []);
});

test('v1 migration maps priorities, keeps rewards and derives completed count', () => {
  const store = fakeStorage({ [storage.V1_KEY]: JSON.stringify(v1State()) });
  const loaded = storage.loadState(store, { now: NOW });
  assert.equal(loaded.source, 'v1');
  assert.equal(loaded.migrated, true);
  assert.equal(loaded.state.tasks[0].priority.tier, 'low');
  assert.equal(loaded.state.tasks[1].priority.tier, 'high');
  assert.equal(loaded.state.ledger.length, 1);
  assert.deepEqual(rules.computeTotals(loaded.state), { xp: 10, coins: 3, resources: { wood: 1, stone: 0, iron: 0 } });
  assert.equal(rules.countCompleted(loaded.state), 1);
  assert.equal(store.getItem(storage.V1_KEY), JSON.stringify(v1State()));
  assert.ok(store.getItem(storage.V2_KEY));
});

test('legacy critical maps to high + urgent + important during migration', () => {
  const legacy = v1State();
  legacy.tasks[0].priority = 'critical';
  legacy.tasks[0].grantedReward = { xp: 50, coins: 15, resource: 'iron', amount: 1 };
  legacy.xp = 50;
  legacy.coins = 15;
  legacy.resources = { wood: 0, stone: 0, iron: 1 };
  const loaded = storage.loadState(fakeStorage({ [storage.V1_KEY]: JSON.stringify(legacy) }), { now: NOW });
  assert.deepEqual(loaded.state.tasks[0].priority, { tier: 'high', urgent: true, important: true });
  assert.deepEqual(rules.computeTotals(loaded.state), { xp: 50, coins: 15, resources: { wood: 0, stone: 0, iron: 1 } });
  assert.equal(rules.assertInvariants(loaded.state).ok, true);
});

test('migration preserves progress from rewards whose tasks were deleted in v1', () => {
  const legacy = v1State({ xp: 20, coins: 6, resources: { wood: 2, stone: 0, iron: 0 }, completed: 5 });
  const loaded = storage.loadState(fakeStorage({ [storage.V1_KEY]: JSON.stringify(legacy) }), { now: NOW });
  assert.deepEqual(rules.computeTotals(loaded.state), { xp: 20, coins: 6, resources: { wood: 2, stone: 0, iron: 0 } });
  assert.equal(loaded.state.baseline.xp, 10);
  assert.equal(rules.countCompleted(loaded.state), 1);
});

test('a valid v2 state takes precedence over v1', () => {
  const v2 = storage.emptyState();
  v2.baseline.xp = 99;
  const store = fakeStorage({
    [storage.V2_KEY]: JSON.stringify(v2),
    [storage.V1_KEY]: JSON.stringify(v1State())
  });
  const loaded = storage.loadState(store, { now: NOW });
  assert.equal(loaded.source, 'v2');
  assert.equal(rules.computeTotals(loaded.state).xp, 99);
});

test('malformed v2 JSON is quarantined and v1 is used as fallback', () => {
  const store = fakeStorage({
    [storage.V2_KEY]: '{broken',
    [storage.V1_KEY]: JSON.stringify(v1State())
  });
  const loaded = storage.loadState(store, { now: NOW });
  assert.equal(loaded.source, 'v1');
  const quarantined = store.keys().filter((key) => key.startsWith(storage.INVALID_PREFIX));
  assert.equal(quarantined.length, 1);
  assert.equal(store.getItem(quarantined[0]), '{broken');
  assert.equal(storage.validateState(JSON.parse(store.getItem(storage.V2_KEY))).ok, true);
});

test('validateState rejects forged ledger rewards and unsupported schema', () => {
  const state = storage.emptyState();
  const created = rules.createTask({ title: 'A', priority: { tier: 'low', urgent: false, important: false } }, { id: 'a' });
  state.tasks.push(created.task);
  const done = rules.completeTask(state, 'a', { entryId: 'e1' }).state;

  const forged = structuredClone(done);
  forged.ledger[0].reward.xp = 999;
  const forgedCheck = storage.validateState(forged);
  assert.equal(forgedCheck.ok, false);
  assert.ok(forgedCheck.issues.some((issue) => issue.includes('does not match')));

  const future = structuredClone(done);
  future.schemaVersion = 3;
  assert.equal(storage.validateState(future).ok, false);
});

test('validateState rejects malformed tasks, resources, ids and flags', () => {
  const base = storage.emptyState();
  const cases = [
    (s) => { s.baseline.resources.gold = 5; },
    (s) => { s.baseline.xp = -1; },
    (s) => { s.tasks.push({ id: 'x', title: '', priority: { tier: 'low', urgent: false, important: false }, type: 'Quick task', date: '', done: false, createdAt: NOW, rewardClaimed: false }); },
    (s) => { s.tasks.push({ id: 'x', title: 'X', priority: 'low', type: 'Quick task', date: '', done: false, createdAt: NOW, rewardClaimed: false }); },
    (s) => { s.tasks.push({ id: 'x', title: 'X', priority: { tier: 'low', urgent: false, important: false }, type: 'Quick task', date: 'yesterday', done: false, createdAt: NOW, rewardClaimed: false }); }
  ];
  for (const mutate of cases) {
    const state = structuredClone(base);
    mutate(state);
    assert.equal(storage.validateState(state).ok, false);
  }
});

test('validateState accepts a ledger entry whose task was deleted', () => {
  const state = storage.emptyState();
  const created = rules.createTask({ title: 'A', priority: { tier: 'medium', urgent: false, important: false } }, { id: 'a' });
  state.tasks.push(created.task);
  const done = rules.completeTask(state, 'a', { entryId: 'e1' }).state;
  done.tasks = [];
  const checked = storage.validateState(done);
  assert.equal(checked.ok, true);
  assert.equal(checked.state.ledger.length, 1);
  assert.deepEqual(rules.computeTotals(checked.state), { xp: 20, coins: 6, resources: { wood: 2, stone: 0, iron: 0 } });
});

test('backupState writes a backup and prunes to the last three', () => {
  const store = fakeStorage();
  const state = storage.emptyState();
  for (let i = 1; i <= 5; i++) {
    const result = storage.backupState(store, state, { now: '2026-11-2' + i + 'T00:00:00.000Z' });
    assert.equal(result.ok, true);
  }
  const keys = store.keys().filter((key) => key.startsWith(storage.BACKUP_PREFIX)).sort();
  assert.equal(keys.length, storage.MAX_BACKUPS);
  assert.ok(keys[0].includes('2026-11-23'));
});

test('migrateV1 tolerates unknown priorities and malformed tasks', () => {
  const legacy = {
    tasks: [
      { id: 'ok', title: 'Known', priority: 'low', done: false, createdAt: NOW },
      { id: 'weird', title: 'Unknown', priority: 'epic', done: false, createdAt: NOW },
      { title: 'No id', priority: 'low', done: false }
    ],
    xp: 0,
    coins: 0,
    resources: { wood: 0, stone: 0, iron: 0 }
  };
  const result = storage.migrateV1(legacy, { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.state.tasks.length, 2);
  assert.deepEqual(result.state.tasks[1].priority, { tier: 'medium', urgent: false, important: false });
  assert.ok(result.issues.some((issue) => issue.includes('unknown priority')));
});
