const test = require('node:test');
const assert = require('node:assert/strict');
const worldState = require('../src/worldState.js');

const NOW = '2026-11-24T12:00:00.000Z';
const BIOMES = ['autumn', 'forest', 'lakeside', 'meadow', 'snowy'];

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

function legacyState() {
  const state = worldState.emptyState();
  state.createdAt = NOW;
  state.updatedAt = NOW;
  state.objects.placed.push(
    { id: 'user:z', kind: 'flowers', col: 4, row: 4, salt: 31 },
    { id: 'user:a', kind: 'bush', col: 2, row: 4, salt: 9 }
  );
  state.objects.moved.push({ id: 'tree-northwest', col: 2, row: 3, salt: 8 });
  state.objects.removed.push('flowers-west');
  state.terrain.push({ col: 2, row: 5, type: 'path', salt: 17 });
  return state;
}

test('v2 state has one ownership envelope and five empty biome deltas', () => {
  const state = worldState.emptyV2State();
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.activeBiome, 'meadow');
  assert.deepEqual(state.unlocks, []);
  assert.deepEqual(state.ownership, { items: [] });
  assert.deepEqual(Object.keys(state.biomes).sort(), BIOMES);
  for (const id of BIOMES) {
    assert.deepEqual(state.biomes[id], {
      objects: { placed: [], moved: [], removed: [] },
      terrain: []
    });
  }
  for (const field of ['xp', 'stage', 'unlockedFeatures', 'commands', 'bounds', 'camera']) {
    assert.equal(field in state, false);
  }
  const checked = worldState.validateV2State(state);
  assert.equal(checked.ok, true, checked.issues.map((issue) => issue.path).join('; '));
  assert.deepEqual(checked.issues, []);
});

test('key dispatch keeps the v1 key and strict v1 validator intact', () => {
  assert.equal(worldState.KEY, 'cozyquest.world-state.v1');
  assert.equal(worldState.KEY_V2, 'cozyquest.world-state.v2');
  assert.equal(worldState.keyForState(worldState.emptyState()), worldState.KEY);
  assert.equal(worldState.keyForState(worldState.emptyV2State()), worldState.KEY_V2);
  assert.equal(worldState.validateAnyState(worldState.emptyState()).ok, true);
  assert.equal(worldState.validateAnyState(worldState.emptyV2State()).ok, true);
  assert.equal(worldState.validateState(worldState.emptyV2State()).ok, false);
});

test('v1 migration is deterministic and preserves identity, deltas and salts', () => {
  const source = legacyState();
  const before = JSON.stringify(source);
  const first = worldState.migrateV1State(source, { now: NOW });
  const second = worldState.migrateV1State(source, { now: NOW });

  assert.equal(first.ok, true, first.issues.map((issue) => issue.path).join('; '));
  assert.deepEqual(first.state, second.state);
  assert.equal(JSON.stringify(source), before);

  const state = first.state;
  assert.equal(state.worldId, source.worldId);
  assert.equal(state.baseMapId, source.baseMapId);
  assert.equal(state.name, source.name);
  assert.equal(state.createdAt, NOW);
  assert.equal(state.updatedAt, NOW);
  assert.equal(state.activeBiome, 'meadow');
  assert.deepEqual(state.unlocks, [], 'XP and achievement unlocks must not be persisted');

  assert.deepEqual(state.ownership.items.map((item) => item.id), ['user:item:a', 'user:item:z']);
  assert.deepEqual(state.ownership.items.map((item) => item.catalogId),
    ['decor:shrub:lavender', 'decor:flower:daisy']);
  assert.equal(state.ownership.items.every((item) => item.acquiredAt === NOW), true);
  assert.equal(state.ownership.items.every((item) => item.source === 'migration'), true);

  const meadow = state.biomes.meadow;
  assert.deepEqual(meadow.objects.placed.map((record) => [record.id, record.ownedId, record.kind, record.col, record.row, record.salt]), [
    ['user:a', 'user:item:a', 'bush', 2, 4, 9],
    ['user:z', 'user:item:z', 'flowers', 4, 4, 31]
  ]);
  assert.deepEqual(meadow.objects.moved, [{ id: 'tree-northwest', col: 2, row: 3, salt: 8 }]);
  assert.deepEqual(meadow.objects.removed, ['flowers-west']);
  assert.deepEqual(meadow.terrain, [{ col: 2, row: 5, type: 'path', salt: 17 }]);
  for (const id of BIOMES.filter((biome) => biome !== 'meadow')) {
    assert.deepEqual(state.biomes[id], worldState.emptyV2State().biomes[id]);
  }
});

test('v2 validation rejects derived fields and malformed explicit grants', () => {
  const derived = { ...worldState.emptyV2State(), xp: 500 };
  const derivedCheck = worldState.validateV2State(derived);
  assert.equal(derivedCheck.ok, false);
  assert.ok(derivedCheck.issues.some((issue) => issue.code === 'UNEXPECTED_FIELD'));

  const xpGrant = worldState.emptyV2State();
  xpGrant.unlocks.push({
    id: 'unlock:xp', catalogId: 'decor:flower:daisy', source: 'xp', minXp: 100, grantedAt: ''
  });
  const grantCheck = worldState.validateV2State(xpGrant);
  assert.equal(grantCheck.ok, true);
  assert.deepEqual(grantCheck.state.unlocks, []);
  assert.ok(grantCheck.issues.some((issue) => issue.code === 'INVALID_RECORD'));

  const eventGrant = worldState.emptyV2State();
  eventGrant.unlocks.push({
    id: 'unlock:spring', catalogId: 'decor:tree:oak', source: 'event', eventId: 'spring', grantedAt: NOW
  });
  const accepted = worldState.validateV2State(eventGrant);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.state.unlocks, [eventGrant.unlocks[0]]);

  const badCatalog = worldState.emptyV2State();
  badCatalog.ownership.items.push({
    id: 'user:item:unknown', catalogId: 'decor:missing', acquiredAt: NOW, source: 'migration'
  });
  const catalogCheck = worldState.validateV2State(badCatalog);
  assert.ok(catalogCheck.issues.some((issue) => issue.code === 'UNKNOWN_CATALOG_ID'));
  assert.equal(catalogCheck.state.ownership.items.length, 0);
});

test('v2 validation keeps owned items and placements distinct and non-duplicated', () => {
  const state = worldState.emptyV2State();
  state.ownership.items.push(
    { id: 'user:item:daisy', catalogId: 'decor:flower:daisy', acquiredAt: NOW, source: 'migration' },
    { id: 'user:item:snowdrop', catalogId: 'decor:flower:snowdrop', acquiredAt: NOW, source: 'migration' }
  );
  state.biomes.meadow.objects.placed.push({
    id: 'user:placement:daisy', ownedId: 'user:item:daisy', kind: 'flowers', col: 1, row: 1, salt: 4
  });
  state.biomes.forest.objects.placed.push({
    id: 'user:placement:copy', ownedId: 'user:item:daisy', kind: 'flowers', col: 2, row: 2, salt: 5
  });
  state.biomes.forest.objects.placed.push({
    id: 'user:placement:snow', ownedId: 'user:item:snowdrop', kind: 'flowers', col: 3, row: 3, salt: 6
  });
  state.biomes.lakeside.objects.placed.push({
    id: 'user:placement:wrong-kind', ownedId: 'user:item:daisy', kind: 'bush', col: 4, row: 4, salt: 7
  });

  const checked = worldState.validateV2State(state);
  assert.equal(checked.ok, true);
  assert.equal(checked.state.biomes.meadow.objects.placed.length, 1);
  assert.equal(checked.state.biomes.forest.objects.placed.length, 0);
  assert.equal(checked.state.biomes.lakeside.objects.placed.length, 0);
  assert.equal(checked.state.ownership.items.length, 2, 'skipped placements must preserve ownership');
  assert.ok(checked.issues.some((issue) => issue.code === 'DUPLICATE_PLACEMENT'));
  assert.ok(checked.issues.some((issue) => issue.code === 'INCOMPATIBLE_ITEM'));
  assert.ok(checked.issues.some((issue) => issue.code === 'INVALID_OWNER'));
});

test('unknown biome buckets and active biomes are rejected', () => {
  const state = worldState.emptyV2State();
  state.activeBiome = 'desert';
  state.biomes.desert = { objects: { placed: [], moved: [], removed: [] }, terrain: [] };
  const checked = worldState.validateV2State(state);
  assert.equal(checked.ok, false);
  assert.equal(checked.issues.filter((issue) => issue.code === 'UNKNOWN_BIOME').length, 2);
});

test('loadAnyState migrates v1 without writing or deleting the v1 key', () => {
  const raw = JSON.stringify(legacyState());
  const store = fakeStorage({ [worldState.KEY]: raw });
  const loaded = worldState.loadAnyState(store, { now: NOW });

  assert.equal(loaded.source, 'v1-migrated');
  assert.equal(loaded.state.schemaVersion, 2);
  assert.equal(store.getItem(worldState.KEY), raw);
  assert.equal(store.getItem(worldState.KEY_V2), null);

  const saved = worldState.saveAnyState(store, loaded.state);
  assert.equal(saved.ok, true);
  assert.equal(saved.key, worldState.KEY_V2);
  assert.equal(store.getItem(worldState.KEY), raw, 'v1 key must remain untouched after saving v2');
});

test('v2 save and load round-trip through the v2 key', () => {
  const store = fakeStorage();
  const state = worldState.emptyV2State();
  state.name = 'Amber Hollow';
  state.activeBiome = 'autumn';
  state.unlocks.push({
    id: 'unlock:spring', catalogId: 'decor:tree:oak', source: 'event', eventId: 'spring', grantedAt: NOW
  });

  const saved = worldState.saveAnyState(store, state);
  assert.equal(saved.ok, true);
  assert.deepEqual(store.keys(), [worldState.KEY_V2]);
  const loaded = worldState.loadAnyState(store, { now: NOW });
  assert.equal(loaded.source, 'v2');
  assert.deepEqual(loaded.state, worldState.validateV2State(state).state);
});

test('new owned and placement ids use their own deterministic namespaces', () => {
  assert.match(worldState.createOwnedId(), /^user:item:.+/);
  assert.match(worldState.createPlacementId(), /^user:placement:.+/);
  assert.notEqual(worldState.createOwnedId(), worldState.createPlacementId());
});
