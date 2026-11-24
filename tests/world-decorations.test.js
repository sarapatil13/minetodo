const test = require('node:test');
const assert = require('node:assert/strict');
const worldState = require('../src/worldState.js');
const decorations = require('../src/world/decorations.js');

const NOW = '2026-11-24T12:00:00.000Z';
const RICH = { xp: 2000, completedTasks: 30, ledgerEntries: 30, now: NOW };
const POOR = { xp: 0, completedTasks: 0, ledgerEntries: 0, now: NOW };

function hasIssue(result, code) {
  return result.issues.some((issue) => issue.code === code);
}

function issuePath(result, code) {
  const issue = result.issues.find((entry) => entry.code === code);
  return issue ? issue.path : null;
}

function acquireDaisy(options) {
  const state = worldState.emptyV2State();
  const result = decorations.acquire(state, 'decor:flower:daisy',
    Object.assign({}, RICH, options));
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result;
}

function placedOwned(catalogId, biomeId, options) {
  const settings = Object.assign({}, RICH, options || {});
  let state = worldState.emptyV2State();
  let result = decorations.acquire(state, catalogId, settings);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  state = result.state;
  const ownedId = result.ownedId;
  if (biomeId && biomeId !== 'meadow') {
    result = decorations.switchBiome(state, biomeId, settings);
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    state = result.state;
  }
  result = decorations.place(state, ownedId, { col: 3, row: 3 }, settings);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return { state: result.state, ownedId, placementId: result.placementId };
}

test('acquire requires an unlocked catalog item and creates an owned instance only', () => {
  const empty = worldState.emptyV2State();
  const locked = decorations.acquire(empty, 'decor:flower:daisy', POOR);
  assert.equal(locked.ok, false);
  assert.equal(hasIssue(locked, decorations.ISSUE_CODES.LOCKED), true);
  assert.equal(locked.state, null);

  const unknown = decorations.acquire(empty, 'decor:missing', RICH);
  assert.equal(unknown.ok, false);
  assert.equal(hasIssue(unknown, decorations.ISSUE_CODES.UNKNOWN_ITEM), true);

  const result = acquireDaisy();
  assert.equal(result.ok, true);
  assert.match(result.ownedId, /^user:item:/);
  assert.deepEqual(result.state.ownership.items, [{
    id: result.ownedId,
    catalogId: 'decor:flower:daisy',
    acquiredAt: NOW,
    source: 'acquired'
  }]);
  assert.equal(result.state.biomes.meadow.objects.placed.length, 0,
    'acquisition must never auto-place an item');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.issues), true);
  assert.equal(empty.ownership.items.length, 0, 'input state must not be mutated');
});

test('acquire preserves explicit grant records and never persists XP unlocks', () => {
  const state = worldState.emptyV2State();
  const grant = {
    id: 'unlock:spring',
    catalogId: 'decor:flower:daisy',
    source: 'event',
    eventId: 'spring',
    grantedAt: NOW
  };
  state.unlocks.push(grant);
  const evaluation = { available: { 'decor:flower:daisy': true } };
  const result = decorations.acquire(state, 'decor:flower:daisy',
    Object.assign({}, POOR, { evaluation }));
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.deepEqual(result.state.unlocks, [grant]);
  assert.equal(result.state.unlocks.length, 1,
    'grants must survive acquisition unchanged and no XP records are added');
  for (const field of ['xp', 'stage', 'unlockedFeatures']) {
    assert.equal(field in result.state, false);
  }
});

test('place requires ownership, unlocks, and the active biome', () => {
  const empty = worldState.emptyV2State();
  const missing = decorations.place(empty, 'user:item:ghost', { col: 1, row: 1 }, RICH);
  assert.equal(missing.ok, false);
  assert.equal(hasIssue(missing, decorations.ISSUE_CODES.NOT_OWNED), true);

  const lockedBiome = decorations.switchBiome(worldState.emptyV2State(), 'forest', POOR);
  assert.equal(lockedBiome.ok, false);
  assert.equal(hasIssue(lockedBiome, decorations.ISSUE_CODES.BIOME_LOCKED), true);

  const acquired = acquireDaisy();
  const lockedItem = decorations.place(acquired.state, acquired.ownedId, { col: 1, row: 1 }, POOR);
  assert.equal(lockedItem.ok, false);
  assert.equal(hasIssue(lockedItem, decorations.ISSUE_CODES.LOCKED), true);

  const badCell = decorations.place(acquired.state, acquired.ownedId, { col: -1, row: 1 }, RICH);
  assert.equal(badCell.ok, false);
  assert.equal(hasIssue(badCell, decorations.ISSUE_CODES.OUT_OF_BOUNDS), true);
  assert.equal(issuePath(badCell, decorations.ISSUE_CODES.OUT_OF_BOUNDS), 'cell');

  const farCell = decorations.place(acquired.state, acquired.ownedId, { col: 11, row: 1 }, RICH);
  assert.equal(farCell.ok, false);
  assert.equal(hasIssue(farCell, decorations.ISSUE_CODES.OUT_OF_BOUNDS), true);

  const noCell = decorations.place(acquired.state, acquired.ownedId, null, RICH);
  assert.equal(noCell.ok, false);
  assert.equal(hasIssue(noCell, decorations.ISSUE_CODES.INVALID_CELL), true);
});

test('one owned instance can be placed at most once across all biomes', () => {
  const first = placedOwned('decor:flower:daisy', 'meadow', { ownedId: 'user:item:daisy' });
  const second = decorations.place(first.state, first.ownedId, { col: 4, row: 4 },
    Object.assign({}, RICH, { placementId: 'user:placement:second' }));
  assert.equal(second.ok, false);
  assert.equal(hasIssue(second, decorations.ISSUE_CODES.ALREADY_PLACED), true);
  assert.equal(issuePath(second, decorations.ISSUE_CODES.ALREADY_PLACED), 'ownedId');

  const switched = decorations.switchBiome(first.state, 'forest', RICH);
  assert.equal(switched.ok, true, JSON.stringify(switched.issues));
  const otherBiome = decorations.place(switched.state, first.ownedId, { col: 2, row: 2 }, RICH);
  assert.equal(otherBiome.ok, false);
  assert.equal(hasIssue(otherBiome, decorations.ISSUE_CODES.ALREADY_PLACED), true);
});

test('placement ids must be unique and cells cannot be double-occupied', () => {
  const state = worldState.emptyV2State();
  let result = decorations.acquire(state, 'decor:flower:daisy',
    Object.assign({}, RICH, { ownedId: 'user:item:daisy' }));
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  const firstState = result.state;

  result = decorations.acquire(firstState, 'decor:shrub:lavender',
    Object.assign({}, RICH, { ownedId: 'user:item:lavender' }));
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  const bothOwned = result.state;

  result = decorations.place(bothOwned, 'user:item:daisy', { col: 3, row: 3 },
    Object.assign({}, RICH, { placementId: 'user:placement:p1' }));
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  const placedOne = result.state;

  const duplicateId = decorations.place(placedOne, 'user:item:lavender', { col: 5, row: 5 },
    Object.assign({}, RICH, { placementId: 'user:placement:p1' }));
  assert.equal(duplicateId.ok, false);
  assert.equal(hasIssue(duplicateId, decorations.ISSUE_CODES.ALREADY_PLACED), true);

  const occupied = decorations.place(placedOne, 'user:item:lavender', { col: 3, row: 3 },
    Object.assign({}, RICH, { placementId: 'user:placement:p2' }));
  assert.equal(occupied.ok, false);
  assert.equal(hasIssue(occupied, decorations.ISSUE_CODES.OCCUPIED_CELL), true);
});

test('move preserves placement and owned identity while updating cell and salt', () => {
  const seeded = placedOwned('decor:flower:daisy', 'meadow', {
    ownedId: 'user:item:daisy',
    placementId: 'user:placement:daisy'
  });
  const before = seeded.state.biomes.meadow.objects.placed[0];
  const result = decorations.move(seeded.state, seeded.placementId, { col: 7, row: 6 }, RICH);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.ownedId, seeded.ownedId);
  const after = result.state.biomes.meadow.objects.placed[0];
  assert.equal(after.id, before.id);
  assert.equal(after.ownedId, before.ownedId);
  assert.equal(after.kind, before.kind);
  assert.deepEqual({ col: after.col, row: after.row }, { col: 7, row: 6 });
  assert.notEqual(after.salt, before.salt, 'moving must re-roll the deterministic salt');

  const occupied = decorations.move(result.state, seeded.placementId, { col: 7, row: 6 }, RICH);
  assert.equal(occupied.ok, true, 'moving to the same cell is allowed');

  const unknown = decorations.move(result.state, 'user:placement:ghost', { col: 1, row: 1 }, RICH);
  assert.equal(unknown.ok, false);
  assert.equal(hasIssue(unknown, decorations.ISSUE_CODES.UNKNOWN_PLACEMENT), true);
});

test('remove deletes only the placement and preserves ownership for reuse', () => {
  const seeded = placedOwned('decor:flower:daisy', 'meadow', {
    ownedId: 'user:item:daisy',
    placementId: 'user:placement:daisy'
  });
  const result = decorations.remove(seeded.state, seeded.placementId, RICH);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.ownedId, seeded.ownedId);
  assert.equal(result.state.biomes.meadow.objects.placed.length, 0);
  assert.deepEqual(result.state.ownership.items, seeded.state.ownership.items);

  const replanted = decorations.place(result.state, seeded.ownedId, { col: 6, row: 6 },
    Object.assign({}, RICH, { placementId: 'user:placement:again' }));
  assert.equal(replanted.ok, true, JSON.stringify(replanted.issues));
  assert.equal(replanted.placementId, 'user:placement:again');
});

test('switchBiome changes one active biome and leaves other buckets untouched', () => {
  const seeded = placedOwned('decor:flower:daisy', 'meadow', {
    ownedId: 'user:item:daisy',
    placementId: 'user:placement:daisy'
  });
  const before = JSON.stringify(seeded.state.biomes.meadow);
  const result = decorations.switchBiome(seeded.state, 'forest', RICH);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.state.activeBiome, 'forest');
  assert.equal(JSON.stringify(result.state.biomes.meadow), before);
  assert.deepEqual(result.state.biomes.forest, worldState.emptyV2State().biomes.forest);

  const unknown = decorations.switchBiome(result.state, 'desert', RICH);
  assert.equal(unknown.ok, false);
  assert.equal(hasIssue(unknown, decorations.ISSUE_CODES.UNKNOWN_BIOME), true);
});

test('activeModifications yields the v1 delta shape for the active biome only', () => {
  const seeded = placedOwned('decor:flower:daisy', 'meadow', {
    ownedId: 'user:item:daisy',
    placementId: 'user:placement:daisy'
  });
  const result = decorations.activeModifications(seeded.state, RICH);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.biomeId, 'meadow');
  assert.deepEqual(result.modifications.objects.placed, [{
    id: seeded.placementId,
    kind: 'flowers',
    col: 3,
    row: 3,
    salt: seeded.state.biomes.meadow.objects.placed[0].salt
  }]);
  assert.deepEqual(result.modifications.objects.moved, []);
  assert.deepEqual(result.modifications.objects.removed, []);
  assert.deepEqual(result.modifications.terrain, []);
  assert.deepEqual(result.skipped, []);
  assert.equal(Object.isFrozen(result.modifications), true);
});

test('activeModifications skips incompatible and locked placements without deleting them', () => {
  const state = worldState.emptyV2State();
  state.ownership.items.push({
    id: 'user:item:snowdrop',
    catalogId: 'decor:flower:snowdrop',
    acquiredAt: NOW,
    source: 'migration'
  });
  state.biomes.forest.objects.placed.push({
    id: 'user:placement:snowdrop',
    ownedId: 'user:item:snowdrop',
    kind: 'flowers',
    col: 2,
    row: 2,
    salt: 7
  });
  state.activeBiome = 'forest';

  const incompatible = decorations.activeModifications(state, RICH);
  assert.equal(incompatible.ok, true);
  assert.equal(incompatible.modifications.objects.placed.length, 0);
  assert.deepEqual(incompatible.skipped, ['user:placement:snowdrop']);
  assert.equal(hasIssue(incompatible, decorations.ISSUE_CODES.INCOMPATIBLE_BIOME), true);
  assert.equal(state.biomes.forest.objects.placed.length, 1,
    'skipping at composition time must not mutate persisted state');

  const meadow = decorations.activeModifications(state, POOR);
  assert.equal(meadow.ok, true);
  const movedState = worldState.emptyV2State();
  movedState.activeBiome = 'meadow';
  movedState.ownership.items.push({
    id: 'user:item:snowdrop',
    catalogId: 'decor:flower:snowdrop',
    acquiredAt: NOW,
    source: 'migration'
  });
  movedState.biomes.meadow.objects.placed.push({
    id: 'user:placement:snowdrop',
    ownedId: 'user:item:snowdrop',
    kind: 'flowers',
    col: 2,
    row: 2,
    salt: 7
  });
  const locked = decorations.activeModifications(movedState, POOR);
  assert.equal(locked.ok, true);
  assert.equal(locked.modifications.objects.placed.length, 0);
  assert.equal(hasIssue(locked, decorations.ISSUE_CODES.LOCKED), true);

  const forced = decorations.activeModifications(movedState,
    Object.assign({}, POOR, { enforceUnlocks: false }));
  assert.equal(forced.ok, true);
  assert.equal(forced.modifications.objects.placed.length, 1,
    'enforceUnlocks:false must skip the unlock gate but keep biome compatibility');
});

test('syncAutoGrants does not grant anything for the current catalog', () => {
  const state = worldState.emptyV2State();
  const result = decorations.syncAutoGrants(state, RICH);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.state, state);
});

test('every operation rejects invalid v2 state without mutating it', () => {
  const invalid = { schemaVersion: 2 };
  const before = JSON.stringify(invalid);
  const operations = [
    () => decorations.acquire(invalid, 'decor:flower:daisy', RICH),
    () => decorations.place(invalid, 'user:item:x', { col: 1, row: 1 }, RICH),
    () => decorations.move(invalid, 'user:placement:x', { col: 1, row: 1 }, RICH),
    () => decorations.remove(invalid, 'user:placement:x', RICH),
    () => decorations.switchBiome(invalid, 'forest', RICH),
    () => decorations.syncAutoGrants(invalid, RICH),
    () => decorations.activeModifications(invalid, RICH)
  ];
  for (const operation of operations) {
    const result = operation();
    assert.equal(result.ok, false);
    assert.equal(result.state, null);
    assert.equal(hasIssue(result, decorations.ISSUE_CODES.INVALID_STATE) ||
      result.issues.length > 0, true);
  }
  assert.equal(JSON.stringify(invalid), before);
});
