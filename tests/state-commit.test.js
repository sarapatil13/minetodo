const test = require('node:test');
const assert = require('node:assert/strict');
const taskStorage = require('../src/storage.js');
const rules = require('../src/rules.js');
const worldState = require('../src/worldState.js');
const world = require('../src/world/index.js');
const stateCommit = require('../src/stateCommit.js');

const NOW = '2026-11-24T12:00:00.000Z';

function fakeStorage(initial = {}, fail = () => null) {
  const data = { ...initial };
  const writes = [];
  return {
    data,
    writes,
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      const text = String(value);
      const error = fail(key, text, writes);
      if (error) throw error;
      writes.push({ type: 'set', key, value: text });
      data[key] = text;
    },
    removeItem: (key) => {
      const error = fail(key, null, writes);
      if (error) throw error;
      writes.push({ type: 'remove', key });
      delete data[key];
    },
    keys: () => Object.keys(data)
  };
}

function taskState(xp = 0) {
  const state = structuredClone(taskStorage.emptyState());
  state.baseline.xp = xp;
  const checked = taskStorage.validateState(state);
  assert.equal(checked.ok, true, checked.issues.join('; '));
  return checked.state;
}

function worldStateWithPlacement() {
  const state = worldState.emptyState();
  state.createdAt = NOW;
  state.updatedAt = NOW;
  state.objects.placed.push({
    id: 'user:desk',
    kind: 'flowers',
    col: 4,
    row: 4,
    salt: 12
  });
  const checked = worldState.validateState(state);
  assert.equal(checked.ok, true, checked.issues.map((issue) => issue.message).join('; '));
  return checked.state;
}

function fixture(options = {}) {
  const initialTask = taskState(options.xp === undefined ? 500 : options.xp);
  const initialWorld = options.worldWithPlacement ? worldStateWithPlacement() : worldState.emptyState();
  const initial = {
    [taskStorage.V2_KEY]: JSON.stringify(initialTask),
    [worldState.KEY]: JSON.stringify(initialWorld)
  };
  const store = fakeStorage(initial, options.fail);
  return { store, initial, initialTask, initialWorld };
}

function commitFixture(store, options = {}) {
  return stateCommit.commit(Object.assign({
    store,
    current: {
      taskState: taskState(options.currentXp === undefined ? 500 : options.currentXp),
      worldState: worldState.emptyState()
    },
    next: {
      taskState: taskState(options.nextXp === undefined ? 500 : options.nextXp),
      worldState: worldStateWithPlacement()
    },
    domains: { task: true, world: true },
    now: NOW
  }, options));
}

test('task-only commit leaves the world key untouched but composes derived content', () => {
  const initialTask = taskState(0);
  const store = fakeStorage({
    [taskStorage.V2_KEY]: JSON.stringify(initialTask)
  });
  const nextTask = taskState(500);

  const result = stateCommit.commit({
    store,
    current: { taskState: initialTask, worldState: worldState.emptyState() },
    next: { taskState: nextTask },
    domains: { task: true, world: false },
    now: NOW
  });

  assert.equal(result.ok, true, result.issues.join('; '));
  assert.equal(result.phase, 'complete');
  assert.deepEqual(result.domains, { task: true, world: false });
  assert.equal(result.xp, 500);
  assert.equal(store.data[taskStorage.V2_KEY], JSON.stringify(taskStorage.validateState(nextTask).state));
  assert.equal(Object.prototype.hasOwnProperty.call(store.data, worldState.KEY), false);
  assert.equal(store.writes.some((write) => write.key === worldState.KEY), false);
  assert.ok(result.composition.map.objects.some((object) => object.id === 'progression-annex-house'));
});

test('world-only commit leaves task bytes untouched and derives XP from the current task state', () => {
  const { store, initial, initialTask } = fixture({ xp: 500 });
  const nextWorld = worldStateWithPlacement();

  const result = stateCommit.commit({
    store,
    current: { taskState: initialTask, worldState: worldState.emptyState() },
    next: { worldState: nextWorld },
    domains: { task: false, world: true },
    now: NOW
  });

  assert.equal(result.ok, true, result.issues.join('; '));
  assert.equal(result.xp, 500);
  assert.equal(store.data[taskStorage.V2_KEY], initial[taskStorage.V2_KEY]);
  assert.deepEqual(
    JSON.parse(store.data[worldState.KEY]).objects.placed,
    worldState.validateState(nextWorld).state.objects.placed
  );
  assert.equal(store.writes.some((write) => write.key === taskStorage.V2_KEY), false);
});

test('invalid task or world state is rejected before any write', () => {
  const { store, initial, initialTask, initialWorld } = fixture();

  const badTask = stateCommit.commit({
    store,
    current: { taskState: initialTask, worldState: initialWorld },
    next: { taskState: { ...initialTask, schemaVersion: 99 } },
    domains: { task: true, world: false },
    now: NOW
  });
  assert.equal(badTask.ok, false);
  assert.equal(badTask.phase, 'validate-task');
  assert.deepEqual(store.data, initial);

  const badWorld = stateCommit.commit({
    store,
    current: { taskState: initialTask, worldState: initialWorld },
    next: { worldState: { ...initialWorld, schemaVersion: 99 } },
    domains: { task: false, world: true },
    now: NOW
  });
  assert.equal(badWorld.ok, false);
  assert.equal(badWorld.phase, 'validate-world');
  assert.deepEqual(store.data, initial);
});

test('task-state write failure aborts before the world key is written', () => {
  const { store, initial, initialTask, initialWorld } = fixture({
    fail: (key) => key === taskStorage.V2_KEY ? new Error('task key blocked') : null
  });

  const result = stateCommit.commit({
    store,
    current: { taskState: initialTask, worldState: initialWorld },
    next: { taskState: taskState(900), worldState: worldStateWithPlacement() },
    domains: { task: true, world: true },
    now: NOW
  });

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'write-task');
  assert.match(result.issues[0], /task key blocked/);
  assert.deepEqual(store.data, initial);
  assert.equal(Object.prototype.hasOwnProperty.call(store.data, stateCommit.RECOVERY_KEY), false);
});

test('world-state write failure rolls the task key back to its previous bytes', () => {
  const { store, initial, initialTask, initialWorld } = fixture({
    fail: (key) => key === worldState.KEY ? new Error('world key blocked') : null
  });

  const result = stateCommit.commit({
    store,
    current: { taskState: initialTask, worldState: initialWorld },
    next: { taskState: taskState(900), worldState: worldStateWithPlacement() },
    domains: { task: true, world: true },
    now: NOW
  });

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'write-world');
  assert.equal(result.rollback.ok, true);
  assert.deepEqual(result.rollback.restored, ['task']);
  assert.equal(result.recoveryRequired, false);
  assert.equal(store.data[taskStorage.V2_KEY], initial[taskStorage.V2_KEY]);
  assert.equal(store.data[worldState.KEY], initial[worldState.KEY]);
  assert.equal(Object.prototype.hasOwnProperty.call(store.data, stateCommit.RECOVERY_KEY), false);
});

test('task rollback failure writes a recovery marker that startup can replay', () => {
  let taskWrites = 0;
  let blockTaskWrites = true;
  const { store, initial, initialTask, initialWorld } = fixture({
    fail: (key) => {
      if (key === taskStorage.V2_KEY) {
        taskWrites += 1;
        return blockTaskWrites && taskWrites > 1
          ? new Error('task rollback blocked')
          : null;
      }
      if (key === worldState.KEY) return new Error('world key blocked');
      return null;
    }
  });

  const result = stateCommit.commit({
    store,
    current: { taskState: initialTask, worldState: initialWorld },
    next: { taskState: taskState(900), worldState: worldStateWithPlacement() },
    domains: { task: true, world: true },
    now: NOW
  });

  assert.equal(result.ok, false);
  assert.equal(result.recoveryRequired, true);
  assert.equal(result.recoveryKey, stateCommit.RECOVERY_KEY);
  assert.equal(result.rollback.ok, false);
  assert.ok(result.issues.some((issue) => /task rollback failed/.test(issue)));

  const marker = JSON.parse(store.data[stateCommit.RECOVERY_KEY]);
  assert.deepEqual(marker.domains, { task: true, world: false });
  assert.equal(marker.values.task, initial[taskStorage.V2_KEY]);

  blockTaskWrites = false;
  const recovered = stateCommit.recover(store);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.recovered, true);
  assert.deepEqual(recovered.restored, ['task']);
  assert.equal(store.data[taskStorage.V2_KEY], initial[taskStorage.V2_KEY]);
  assert.equal(Object.prototype.hasOwnProperty.call(store.data, stateCommit.RECOVERY_KEY), false);
});

test('world rollback failure writes a recovery marker that startup can replay', () => {
  let blockWorldWrite = false;
  const { store, initial, initialTask, initialWorld } = fixture({
    fail: (key) => {
      if (key === worldState.KEY && blockWorldWrite) return new Error('world rollback blocked');
      return null;
    }
  });

  const result = stateCommit.commit({
    store,
    current: { taskState: initialTask, worldState: initialWorld },
    next: { taskState: taskState(900), worldState: worldStateWithPlacement() },
    domains: { task: true, world: true },
    now: NOW
  });
  assert.equal(result.ok, true, result.issues.join('; '));

  blockWorldWrite = true;
  const undone = result.rollback();

  assert.equal(undone.ok, false);
  assert.equal(undone.recoveryRequired, true);
  assert.equal(undone.recoveryKey, stateCommit.RECOVERY_KEY);
  assert.deepEqual(undone.restored, ['task']);
  assert.ok(undone.issues.some((issue) => /world rollback failed/.test(issue)));

  const marker = JSON.parse(store.data[stateCommit.RECOVERY_KEY]);
  assert.deepEqual(marker.domains, { task: true, world: true });
  assert.equal(marker.values.world, initial[worldState.KEY]);

  blockWorldWrite = false;
  const recovered = stateCommit.recover(store);
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.restored, ['task', 'world']);
  assert.equal(store.data[taskStorage.V2_KEY], initial[taskStorage.V2_KEY]);
  assert.equal(store.data[worldState.KEY], initial[worldState.KEY]);
  assert.equal(Object.prototype.hasOwnProperty.call(store.data, stateCommit.RECOVERY_KEY), false);
});

test('backup write failure aborts before any primary key is written', () => {
  const { store, initial, initialTask, initialWorld } = fixture({
    fail: (key) => key.startsWith(taskStorage.BACKUP_PREFIX) ? new Error('backup blocked') : null
  });

  const result = stateCommit.commit({
    store,
    current: { taskState: initialTask, worldState: initialWorld },
    next: { taskState: taskState(900), worldState: worldStateWithPlacement() },
    domains: { task: true, world: true },
    backup: true,
    now: NOW
  });

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'backup');
  assert.match(result.issues[0], /backup blocked/);
  assert.deepEqual(store.data, initial);
  assert.equal(store.writes.some((write) => write.key === taskStorage.V2_KEY), false);
  assert.equal(store.writes.some((write) => write.key === worldState.KEY), false);
});

test('backup writes are limited to the domains being committed', () => {
  const { store, initialTask, initialWorld } = fixture();

  const result = stateCommit.commit({
    store,
    current: { taskState: initialTask, worldState: initialWorld },
    next: { taskState: taskState(900) },
    domains: { task: true, world: false },
    backup: true,
    now: NOW
  });

  assert.equal(result.ok, true, result.issues.join('; '));
  assert.deepEqual(Object.keys(result.backupKeys), ['task']);
  assert.equal(store.keys().filter((key) => key.startsWith(taskStorage.BACKUP_PREFIX)).length, 1);
  assert.equal(store.keys().filter((key) => key.startsWith(worldState.BACKUP_PREFIX)).length, 0);
});

test('an invalid recovery marker is reported without touching stored state', () => {
  const { store, initial } = fixture();
  store.data[stateCommit.RECOVERY_KEY] = '{broken';
  const before = { ...store.data };

  const recovered = stateCommit.recover(store);

  assert.equal(recovered.ok, false);
  assert.match(recovered.issues[0], /not valid JSON/);
  assert.deepEqual(store.data, before);
});

test('classic script loading exposes stateCommit after worldState', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const context = vm.createContext({});
  const scripts = [
    'src/rules.js',
    'src/storage.js',
    'src/transfer.js',
    'src/progressionConfig.js',
    'src/world/coords.js',
    'src/world/tiles.js',
    'src/world/map.js',
    'src/world/contentCatalog.js',
    'src/world/unlocks.js',
    'src/world/biomeCatalog.js',
    'src/world/mapValidation.js',
    'src/world/grid.js',
    'src/world/scene.js',
    'src/world/progression.js',
    'src/world/camera.js',
    'src/world/hitTest.js',
    'src/world/renderer.js',
    'src/world/selectableTargets.js',
    'src/world/content.js',
    'src/world/interactionState.js',
    'src/world/infoPanel.js',
    'src/world/cameraInput.js',
    'src/world/interaction.js',
    'src/world/controller.js',
    'src/world/index.js',
    'src/worldState.js',
    'src/world/decorations.js',
    'src/stateCommit.js'
  ];

  scripts.forEach((file) => {
    const absolute = path.join(__dirname, '..', file);
    vm.runInContext(fs.readFileSync(absolute, 'utf8'), context, { filename: absolute });
  });

  assert.equal(typeof context.CQ.stateCommit.commit, 'function');
  assert.equal(typeof context.CQ.stateCommit.recover, 'function');
  assert.equal(context.localStorage, undefined);
});

function v2World(biomeId = 'meadow') {
  const state = worldState.emptyV2State();
  state.createdAt = NOW;
  state.updatedAt = NOW;
  state.activeBiome = biomeId;
  state.ownership.items.push({
    id: 'user:item:daisy',
    catalogId: 'decor:flower:daisy',
    acquiredAt: NOW,
    source: 'migration'
  });
  state.biomes[biomeId].objects.placed.push({
    id: 'user:placement:daisy',
    ownedId: 'user:item:daisy',
    kind: 'flowers',
    col: 4,
    row: 4,
    salt: 12
  });
  const checked = worldState.validateV2State(state);
  assert.equal(checked.ok, true, checked.issues.map((issue) => issue.message).join('; '));
  return checked.state;
}

test('v2 world commit writes KEY_V2 and leaves the legacy v1 key untouched', () => {
  const legacy = JSON.stringify(worldState.emptyState());
  const store = fakeStorage({
    [taskStorage.V2_KEY]: JSON.stringify(taskState(500)),
    [worldState.KEY]: legacy
  });
  const nextWorld = v2World();

  const result = stateCommit.commit({
    store,
    current: { taskState: taskState(500), worldState: worldState.emptyState() },
    next: { worldState: nextWorld },
    domains: { task: false, world: true },
    now: NOW
  });

  assert.equal(result.ok, true, result.issues.join('; '));
  assert.equal(result.worldState.schemaVersion, 2);
  assert.equal(store.data[worldState.KEY], legacy, 'v1 key must never be rewritten');
  assert.equal(store.writes.some((write) => write.key === worldState.KEY), false);
  assert.equal(JSON.parse(store.data[worldState.KEY_V2]).activeBiome, 'meadow');
  assert.deepEqual(store.keys().sort(), [taskStorage.V2_KEY, worldState.KEY, worldState.KEY_V2].sort());
  assert.ok(result.composition.map.objects.some((object) => object.id === 'user:placement:daisy'));
});

test('v2 commit composes the active biome and retains incompatible placements', () => {
  const nextWorld = v2World('forest');
  nextWorld.ownership.items.push({
    id: 'user:item:snowdrop',
    catalogId: 'decor:flower:snowdrop',
    acquiredAt: NOW,
    source: 'migration'
  });
  nextWorld.biomes.forest.objects.placed.push({
    id: 'user:placement:snowdrop',
    ownedId: 'user:item:snowdrop',
    kind: 'flowers',
    col: 5,
    row: 5,
    salt: 7
  });
  const store = fakeStorage({ [taskStorage.V2_KEY]: JSON.stringify(taskState(500)) });

  const result = stateCommit.commit({
    store,
    current: { taskState: taskState(500), worldState: worldState.emptyState() },
    next: { worldState: nextWorld },
    domains: { task: false, world: true },
    now: NOW
  });

  assert.equal(result.ok, true, result.issues.join('; '));
  assert.equal(result.composition.scene.palette !== undefined, true);
  assert.ok(result.issues.some((issue) => /incompatible/i.test(issue)));
  assert.equal(JSON.parse(store.data[worldState.KEY_V2]).biomes.forest.objects.placed.length, 2,
    'skipping a placement at composition time must not delete it from storage');
  assert.equal(result.composition.map.objects.some((object) => object.id === 'user:placement:snowdrop'), false);
});

test('v2 backup writes a v2 envelope and rollback restores the v2 key', () => {
  let blockWorldWrite = false;
  const store = fakeStorage({
    [taskStorage.V2_KEY]: JSON.stringify(taskState(500)),
    [worldState.KEY_V2]: JSON.stringify(worldState.emptyV2State())
  }, (key) => (key === worldState.KEY_V2 && blockWorldWrite ? new Error('v2 blocked') : null));

  const result = stateCommit.commit({
    store,
    current: { taskState: taskState(500), worldState: worldState.emptyV2State() },
    next: { worldState: v2World() },
    domains: { task: false, world: true },
    backup: true,
    now: NOW
  });

  assert.equal(result.ok, true, result.issues.join('; '));
  assert.equal(JSON.parse(store.data[result.backupKeys.world]).schemaVersion, 2);

  blockWorldWrite = true;
  const undone = result.rollback();
  assert.equal(undone.ok, false);
  assert.equal(undone.recoveryRequired, true);
  const marker = JSON.parse(store.data[stateCommit.RECOVERY_KEY]);
  assert.equal(marker.keys.world, worldState.KEY_V2);

  blockWorldWrite = false;
  const recovered = stateCommit.recover(store);
  assert.equal(recovered.ok, true);
  assert.deepEqual(recovered.restored, ['world']);
  assert.equal(JSON.parse(store.data[worldState.KEY_V2]).schemaVersion, 2);
});
