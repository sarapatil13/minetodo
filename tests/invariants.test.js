const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/rules.js');

function emptyState() {
  return {
    schemaVersion: 2,
    baseline: { xp: 0, coins: 0, resources: { wood: 0, stone: 0, iron: 0 } },
    tasks: [],
    ledger: []
  };
}

function add(state, id, priority = { tier: 'medium', urgent: false, important: false }) {
  const created = rules.createTask({ title: 'Task ' + id, priority }, { id: 't' + id });
  assert.equal(created.ok, true);
  const next = structuredClone(state);
  next.tasks.unshift(created.task);
  return next;
}

function assertHealthy(state) {
  const result = rules.assertInvariants(state);
  assert.deepEqual(result.issues, []);
  assert.equal(result.ok, true);
  const totals = rules.computeTotals(state);
  assert.ok(totals.xp >= 0 && totals.coins >= 0);
  for (const resource of rules.RESOURCES) assert.ok(totals.resources[resource] >= 0);
  assert.equal(rules.countCompleted(state), state.tasks.filter((task) => task.done).length);
}

test('complete/reopen/recomplete cycles never earn twice', () => {
  let state = add(emptyState(), 1, { tier: 'high', urgent: true, important: true });
  state = rules.completeTask(state, 't1', { entryId: 'e1' }).state;
  const expected = rules.computeTotals(state);
  for (let i = 0; i < 30; i++) {
    state = rules.reopenTask(state, 't1').state;
    assertHealthy(state);
    state = rules.completeTask(state, 't1', { entryId: 'e' + i }).state;
    assertHealthy(state);
    assert.deepEqual(rules.computeTotals(state), expected);
    assert.equal(state.ledger.length, 1);
  }
  assert.equal(state.tasks[0].done, true);
  assert.equal(state.tasks[0].rewardClaimed, true);
});

test('deleting rewarded tasks never reduces earned totals', () => {
  let state = emptyState();
  for (let i = 0; i < 50; i++) {
    state = add(state, i, { tier: rules.TIERS[i % 3], urgent: i % 2 === 0, important: i % 3 === 0 });
    state = rules.completeTask(state, 't' + i, { entryId: 'e' + i }).state;
  }
  const earned = rules.computeTotals(state);
  for (let i = 0; i < 50; i++) {
    state = rules.deleteTask(state, 't' + i).state;
    assertHealthy(state);
    assert.deepEqual(rules.computeTotals(state), earned);
  }
  assert.equal(state.tasks.length, 0);
  assert.equal(state.ledger.length, 50);
  assert.equal(rules.countCompleted(state), 0);
});

test('mixed lifecycle sequence keeps the ledger and completed count consistent', () => {
  let state = emptyState();
  for (let i = 0; i < 20; i++) {
    state = add(state, i);
    if (i % 2 === 0) state = rules.completeTask(state, 't' + i, { entryId: 'e' + i }).state;
    assertHealthy(state);
  }
  for (let i = 0; i < 20; i += 4) {
    if (state.tasks.some((task) => task.id === 't' + i && task.done)) {
      state = rules.reopenTask(state, 't' + i).state;
    }
    assertHealthy(state);
  }
  for (let i = 1; i < 20; i += 3) {
    state = rules.deleteTask(state, 't' + i).state;
    assertHealthy(state);
  }
  assert.equal(state.ledger.length, 10);
  assert.equal(rules.countCompleted(state), state.tasks.filter((task) => task.done).length);
});

test('invariant checker rejects forged ledger rewards and orphan claims', () => {
  const state = add(emptyState(), 1, { tier: 'low', urgent: false, important: false });
  const done = rules.completeTask(state, 't1', { entryId: 'e1' }).state;

  const forged = structuredClone(done);
  forged.ledger[0].reward.xp = 9999;
  const forgedCheck = rules.assertInvariants(forged);
  assert.equal(forgedCheck.ok, false);
  assert.ok(forgedCheck.issues.some((issue) => issue.includes('does not match')));

  const orphan = structuredClone(done);
  orphan.tasks[0].rewardClaimed = false;
  const orphanCheck = rules.assertInvariants(orphan);
  assert.equal(orphanCheck.ok, false);
  assert.ok(orphanCheck.issues.some((issue) => issue.includes('without claimed flag')));

  const duplicate = structuredClone(done);
  duplicate.ledger.push(structuredClone(duplicate.ledger[0]));
  assert.equal(rules.assertInvariants(duplicate).ok, false);
});

test('1000-task stress run preserves all invariants', () => {
  let state = emptyState();
  for (let i = 0; i < 1000; i++) {
    state = add(state, i, { tier: rules.TIERS[i % 3], urgent: i % 2 === 0, important: i % 5 === 0 });
  }
  for (let i = 0; i < 1000; i += 2) {
    state = rules.completeTask(state, 't' + i, { entryId: 'e' + i }).state;
  }
  assertHealthy(state);
  assert.equal(state.ledger.length, 500);
  assert.equal(rules.countCompleted(state), 500);
  const totals = rules.computeTotals(state);
  assert.ok(totals.xp > 0 && totals.coins > 0);
  assert.ok(totals.resources.wood > 0 && totals.resources.stone > 0 && totals.resources.iron >= 0);
});
