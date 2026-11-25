const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const taskStorage = require('../src/storage.js');
const worldState = require('../src/worldState.js');
const stateCommit = require('../src/stateCommit.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const NOW = '2026-11-24T12:00:00.000Z';

function functionSource(name) {
  const match = app.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(match, name + ' is missing from app.js');
  return match[0];
}

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
    keys: () => Object.keys(data)
  };
}

test('backup import migrates a v1 world block before committing it', () => {
  const calls = [];
  const worldStateModule = {
    SCHEMA_VERSION_V2: 2,
    migrateV1State: (raw, options) => {
      calls.push({ raw, options });
      return { ok: true, state: { schemaVersion: 2, migrated: true }, issues: [] };
    }
  };
  const normalize = vm.runInNewContext(
    functionSource('normalizeImportedWorld') + '\nnormalizeImportedWorld;',
    { worldStateModule }
  );

  const v1 = { schemaVersion: 1, marker: 'legacy' };
  const migrated = normalize(v1, NOW);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.state, { schemaVersion: 2, migrated: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].raw, v1);
  assert.equal(calls[0].options.now, NOW);

  const v2 = { schemaVersion: 2, marker: 'current' };
  const unchanged = normalize(v2, NOW);
  assert.equal(unchanged.ok, true);
  assert.equal(unchanged.state, v2);
  assert.equal(unchanged.issues.length, 0);
  assert.equal(calls.length, 1, 'v2 blocks must not be migrated again');

  assert.match(app, /normalizeImportedWorld\(result\.worldState, importedAt\)/);
  assert.match(app, /worldState: importedWorld/);
});

test('a migrated v1 world replaces an existing v2 world on load', () => {
  const v1 = worldState.emptyState();
  v1.createdAt = NOW;
  v1.updatedAt = NOW;

  const oldV2 = worldState.emptyV2State();
  oldV2.createdAt = NOW;
  oldV2.updatedAt = NOW;
  oldV2.ownership.items.push({
    id: 'user:item:old', catalogId: 'decor:flower:daisy', acquiredAt: NOW, source: 'migration'
  });

  const store = fakeStorage({
    [taskStorage.V2_KEY]: JSON.stringify(taskStorage.emptyState()),
    [worldState.KEY]: JSON.stringify(v1),
    [worldState.KEY_V2]: JSON.stringify(oldV2)
  });

  const migrated = worldState.migrateV1State(v1, { now: NOW });
  assert.equal(migrated.ok, true, migrated.issues.join('; '));
  const committed = stateCommit.commit({
    store,
    now: NOW,
    current: { taskState: taskStorage.emptyState(), worldState: oldV2 },
    next: { taskState: taskStorage.emptyState(), worldState: migrated.state },
    domains: { task: false, world: true }
  });
  assert.equal(committed.ok, true, committed.issues.join('; '));

  const loaded = worldState.loadAnyState(store);
  assert.equal(loaded.source, 'v2');
  assert.equal(loaded.state.ownership.items.length, 0, 'old v2 world must not survive the import');
  assert.deepEqual(loaded.state, migrated.state);
});
