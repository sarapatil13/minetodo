const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/rules.js');
const storage = require('../src/storage.js');
const catalog = require('../src/world/contentCatalog.js');
const unlocks = require('../src/world/unlocks.js');

function taskState(xp, doneCount = 0, ledgerCount = 0) {
  const state = storage.emptyState();
  state.baseline.xp = xp;
  for (let i = 0; i < doneCount; i += 1) {
    state.tasks.push({ id: 'task-' + i, title: 'Task ' + i, type: 'Quick task', date: '',
      priority: { tier: 'medium', urgent: false, important: false }, done: true,
      createdAt: '2026-11-24T00:00:00.000Z', rewardClaimed: true });
  }
  for (let i = 0; i < ledgerCount; i += 1) {
    state.ledger.push({ id: 'entry-' + i, taskId: 'task-' + i,
      prioritySnapshot: { tier: 'medium', urgent: false, important: false },
      reward: { xp: 20, coins: 6, amount: 2, label: 'wood' },
      createdAt: '2026-11-24T00:00:00.000Z' });
  }
  const checked = storage.validateState(state);
  assert.equal(checked.ok, true, checked.issues.join('; '));
  return checked.state;
}

test('XP unlocks are derived from computeTotals and use exact Phase 2.5 thresholds', () => {
  const lower = unlocks.evaluate({ taskState: taskState(99) });
  assert.equal(unlocks.isUnlocked('decor:flower:daisy', lower), false);

  const exact = unlocks.evaluate({ taskState: taskState(100) });
  assert.equal(unlocks.isUnlocked('decor:flower:daisy', exact), true);
  assert.equal(unlocks.isUnlocked('decor:shrub:lavender', exact), false);

  const high = unlocks.evaluate({ taskState: taskState(1400) });
  for (const item of catalog.all()) {
    if (item.unlock.type === 'xp') {
      assert.equal(unlocks.isUnlocked(item.id, high), true, item.id);
    }
  }
});

test('multiple unlocks appear together and output is frozen', () => {
  const result = unlocks.evaluate({ xp: 1400, completedTasks: 10, ledgerEntries: 20 });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.available), true);
  assert.equal(Object.isFrozen(result.issues), true);
  assert.equal(result.available['decor:flower:daisy'], true);
  assert.equal(result.available['decor:structure:cottage'], true);
  assert.equal(result.available['decor:flower:snowdrop'], true);
  assert.equal(rules.computeTotals(taskState(1400)).xp, 1400);
});

test('achievement unlocks are derived from reconstructible task state', () => {
  const nine = unlocks.evaluate({ xp: 0, completedTasks: 9 });
  assert.equal(unlocks.isUnlocked('decor:structure:cottage', nine), false);
  const ten = unlocks.evaluate({ xp: 0, completedTasks: 10 });
  assert.equal(unlocks.isUnlocked('decor:structure:cottage', ten), true);

  const nineteen = unlocks.evaluate({ xp: 0, ledgerEntries: 19 });
  assert.equal(unlocks.isUnlocked('decor:flower:snowdrop', nineteen), false);
  const twenty = unlocks.evaluate({ xp: 0, ledgerEntries: 20 });
  assert.equal(unlocks.isUnlocked('decor:flower:snowdrop', twenty), true);
});

test('explicit grants support events and purchases without XP records', () => {
  const locked = unlocks.evaluate({ xp: 0 });
  assert.equal(unlocks.isUnlocked('decor:tree:oak', locked), false);

  const worldState = { unlocks: [
    { id: 'unlock:event', catalogId: 'decor:tree:oak', source: 'event', eventId: 'spring', grantedAt: '' },
    { id: 'unlock:purchase', catalogId: 'decor:fence:picket', source: 'purchase', sku: 'fence-pack', grantedAt: '' }
  ] };
  const granted = unlocks.evaluate({ xp: 0, worldState });
  assert.equal(unlocks.isUnlocked('decor:tree:oak', granted), false, 'generic grant does not match a specific event requirement');
  assert.equal(unlocks.isUnlocked('decor:fence:picket', granted), false, 'generic grant does not match a specific purchase requirement');

  const entries = [
    { id: 'decor:tree:oak', unlock: { type: 'event', eventId: 'spring' } },
    { id: 'decor:fence:picket', unlock: { type: 'purchase', sku: 'fence-pack' } }
  ];
  const specific = unlocks.evaluateEntries(entries, { xp: 0, worldState });
  assert.equal(specific.available['decor:tree:oak'], true);
  assert.equal(specific.available['decor:fence:picket'], true);
});

test('unknown and malformed definitions are rejected without interpretation', () => {
  const issues = [];
  assert.equal(unlocks.validateRequirement({ type: 'xp', minXp: 100 }, issues, 'test'), true);
  assert.equal(unlocks.validateRequirement({ type: 'all', requirements: [{ type: 'always' }] }, issues, 'test'), true);
  assert.equal(unlocks.validateRequirement({ type: 'return true' }, issues, 'test'), false);
  assert.equal(unlocks.validateRequirement({ type: 'xp', minXp: -1 }, issues, 'test'), false);
  assert.equal(unlocks.validateRequirement({ type: 'achievement', achievementId: 'nope' }, issues, 'test'), false);
  assert.ok(issues.some((issue) => issue.code === 'UNKNOWN_REQUIREMENT_TYPE'));
  assert.ok(issues.some((issue) => issue.code === 'UNKNOWN_ACHIEVEMENT'));

  const result = unlocks.evaluateEntries([
    { id: 'missing:item', unlock: { type: 'always' } },
    { id: 'decor:flower:daisy', unlock: { type: 'xp', minXp: 100 } }
  ], { xp: 200, catalog });
  assert.equal(result.available['missing:item'], false);
  assert.equal(result.available['decor:flower:daisy'], true);
  assert.ok(result.issues.some((issue) => issue.code === 'UNKNOWN_CATALOG_ID'));
});

test('catalog definitions keep XP unlocks available but never auto-grant ownership', () => {
  for (const item of catalog.all()) {
    assert.equal(item.autoGrant, false, item.id);
  }
  assert.deepEqual(catalog.catalogIdForKind('flowers'), 'decor:flower:daisy');
  assert.equal(catalog.validateDefinition(catalog.getItem('decor:flower:daisy')), true);
  assert.equal(catalog.validateDefinition({ id: 'decor:flower:daisy' }), false);
});
