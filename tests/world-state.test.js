const test = require('node:test');
const assert = require('node:assert/strict');
const worldState = require('../src/worldState.js');

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

function populated() {
  const state = worldState.emptyState();
  state.createdAt = NOW;
  state.updatedAt = NOW;
  state.objects.placed.push({
    id: 'user:z',
    kind: 'flowers',
    col: 4,
    row: 4,
    salt: 31
  });
  state.objects.placed.push({
    id: 'user:a',
    kind: 'bush',
    col: 2,
    row: 4,
    salt: 9
  });
  state.objects.moved.push({ id: 'tree-northwest', col: 2, row: 3, salt: 8 });
  state.objects.removed.push('flowers-west');
  state.terrain.push({ col: 2, row: 5, type: 'path', salt: 17 });
  return state;
}

test('emptyState is valid and has no derived fields', () => {
  const state = worldState.emptyState();
  const checked = worldState.validateState(state);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.issues, []);
  assert.deepEqual(state, {
    schemaVersion: 1,
    worldId: 'meadow-haven',
    baseMapId: 'sample-meadow-v1',
    name: 'Meadow Haven',
    createdAt: '',
    updatedAt: '',
    objects: { placed: [], moved: [], removed: [] },
    terrain: []
  });
  for (const field of ['xp', 'stage', 'unlockedFeatures', 'commands', 'bounds', 'camera']) {
    assert.equal(field in state, false);
  }
});

test('validateState rejects derived fields and unsupported schema versions', () => {
  const derived = { ...worldState.emptyState(), xp: 500 };
  const derivedCheck = worldState.validateState(derived);
  assert.equal(derivedCheck.ok, false);
  assert.equal(derivedCheck.structural, true);
  assert.ok(derivedCheck.issues.some((issue) => issue.code === 'UNEXPECTED_FIELD'));

  const future = { ...worldState.emptyState(), schemaVersion: 2 };
  const futureCheck = worldState.validateState(future);
  assert.equal(futureCheck.ok, false);
  assert.equal(futureCheck.structural, true);
  assert.match(futureCheck.issues[0], /unsupported world schemaVersion/);
});

test('validateState skips invalid individual records with explicit issues', () => {
  const state = worldState.emptyState();
  state.objects.placed.push(
    { id: 'user:ok', kind: 'flowers', col: 4, row: 4, salt: 1 },
    { id: 'tree-north', kind: 'tree', col: 1, row: 1, salt: 1 },
    { id: 'user:bad-kind', kind: 'dragon', col: 1, row: 1, salt: 1 },
    { id: 'user:bad-cell', kind: 'tree', col: 99, row: 1, salt: 1 }
  );
  state.terrain.push({ col: 1, row: 1, type: 'stone', salt: 1 });

  const checked = worldState.validateState(state);
  assert.equal(checked.ok, true);
  assert.equal(checked.state.objects.placed.length, 1);
  assert.equal(checked.state.objects.placed[0].id, 'user:ok');
  assert.equal(checked.state.terrain.length, 0);
  assert.ok(checked.issues.some((issue) => issue.code === 'RESERVED_ID'));
  assert.ok(checked.issues.some((issue) => issue.code === 'UNSUPPORTED_KIND'));
  assert.ok(checked.issues.some((issue) => issue.code === 'OUT_OF_BOUNDS'));
  assert.ok(checked.issues.some((issue) => issue.code === 'UNSUPPORTED_TERRAIN'));
});

test('validateState skips all duplicate records without choosing one', () => {
  const state = worldState.emptyState();
  state.objects.placed.push(
    { id: 'user:dup', kind: 'tree', col: 1, row: 1, salt: 1 },
    { id: 'user:dup', kind: 'bush', col: 2, row: 2, salt: 2 }
  );
  state.terrain.push(
    { col: 3, row: 3, type: 'grass', salt: 1 },
    { col: 3, row: 3, type: 'path', salt: 2 }
  );

  const checked = worldState.validateState(state);
  assert.equal(checked.ok, true);
  assert.equal(checked.state.objects.placed.length, 0);
  assert.equal(checked.state.terrain.length, 0);
  assert.equal(checked.issues.filter((issue) => issue.code === 'DUPLICATE_RECORD').length, 2);
});

test('validateState resolves conflicting record lists by skipping the id', () => {
  const state = worldState.emptyState();
  state.objects.placed.push({ id: 'user:conflict', kind: 'tree', col: 1, row: 1, salt: 1 });
  state.objects.removed.push('user:conflict');

  const checked = worldState.validateState(state);
  assert.equal(checked.ok, true);
  assert.equal(checked.state.objects.placed.length, 0);
  assert.deepEqual(checked.state.objects.removed, []);
  assert.ok(checked.issues.some((issue) => issue.code === 'CONFLICTING_RECORD'));
});

test('validateState canonicalizes record order', () => {
  const checked = worldState.validateState(populated());
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.state.objects.placed.map((record) => record.id), ['user:a', 'user:z']);
  assert.deepEqual(checked.state.terrain, [{ col: 2, row: 5, type: 'path', salt: 17 }]);
});

test('loadState returns empty state and creates no key when nothing is stored', () => {
  const store = fakeStorage();
  const loaded = worldState.loadState(store, { now: NOW });
  assert.equal(loaded.source, 'empty');
  assert.deepEqual(loaded.state, worldState.emptyState());
  assert.deepEqual(store.keys(), []);
});

test('saveState and loadState round-trip world state', () => {
  const store = fakeStorage();
  const state = populated();
  const saved = worldState.saveState(store, state);
  assert.equal(saved.ok, true);
  assert.deepEqual(store.keys(), [worldState.KEY]);

  const loaded = worldState.loadState(store, { now: NOW });
  assert.equal(loaded.source, 'v1');
  assert.deepEqual(loaded.state, worldState.validateState(state).state);
});

test('loadState quarantines malformed world data without touching task keys', () => {
  const store = fakeStorage({
    'cozyquest.task-engine.v2': 'task-data',
    [worldState.KEY]: '{broken'
  });
  const loaded = worldState.loadState(store, { now: NOW });
  assert.equal(loaded.source, 'invalid');
  assert.deepEqual(loaded.state, worldState.emptyState());
  assert.equal(loaded.quarantinedKey, worldState.INVALID_PREFIX + NOW);
  assert.equal(store.getItem('cozyquest.task-engine.v2'), 'task-data');
  assert.equal(store.getItem(worldState.KEY), '{broken');
});

test('loadState quarantines unsupported schema versions', () => {
  const raw = JSON.stringify({ ...worldState.emptyState(), schemaVersion: 99 });
  const store = fakeStorage({ [worldState.KEY]: raw });
  const loaded = worldState.loadState(store, { now: NOW });
  assert.equal(loaded.source, 'invalid');
  assert.equal(loaded.quarantinedKey, worldState.INVALID_PREFIX + NOW);
});

test('backupState writes a backup and prunes to the last three', () => {
  const store = fakeStorage();
  for (let i = 0; i < 4; i += 1) {
    const result = worldState.backupState(store, populated(), {
      now: '2026-11-2' + i + 'T00:00:00.000Z'
    });
    assert.equal(result.ok, true);
  }
  const keys = store.keys().filter((key) => key.indexOf(worldState.BACKUP_PREFIX) === 0).sort().reverse();
  assert.equal(keys.length, 3);
  assert.equal(keys[0], worldState.BACKUP_PREFIX + '2026-11-23T00:00:00.000Z');
});

test('createId returns a user-namespaced id', () => {
  const id = worldState.createId();
  assert.match(id, /^user:/);
  assert.ok(id.length > 'user:'.length);
});
