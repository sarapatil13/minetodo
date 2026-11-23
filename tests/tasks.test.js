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

function withTask(priority = { tier: 'medium', urgent: false, important: false }, id = 't1') {
  const state = emptyState();
  const result = rules.createTask({ title: 'Study', type: 'Project', date: '', priority }, { id, now: '2026-11-24T10:00:00.000Z' });
  assert.equal(result.ok, true);
  return { ...state, tasks: [result.task] };
}

test('createTask validates input and sets defaults', () => {
  const ok = rules.createTask({ title: '  Read a chapter  ', type: 'Self-care', date: '2026-11-30', priority: { tier: 'high', urgent: true, important: false } }, { id: 'x', now: 'now' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.task, {
    id: 'x',
    title: 'Read a chapter',
    type: 'Self-care',
    date: '2026-11-30',
    priority: { tier: 'high', urgent: true, important: false },
    done: false,
    createdAt: 'now',
    rewardClaimed: false
  });

  assert.equal(rules.createTask({ title: '  ', priority: { tier: 'low', urgent: false, important: false } }).ok, false);
  assert.equal(rules.createTask({ title: 'x'.repeat(91), priority: { tier: 'low', urgent: false, important: false } }).ok, false);
  assert.equal(rules.createTask({ title: 'x', priority: 'low' }).ok, false);
  assert.equal(rules.createTask({ title: 'x', priority: { tier: 'low', urgent: false, important: false }, date: '24-11-2026' }).ok, false);
});

test('completing a task grants exactly one permanent ledger entry', () => {
  const state = withTask({ tier: 'high', urgent: true, important: true });
  const result = rules.completeTask(state, 't1', { entryId: 'e1', now: '2026-11-24T11:00:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(result.entry.id, 'e1');
  assert.equal(result.state.tasks[0].done, true);
  assert.equal(result.state.tasks[0].rewardClaimed, true);
  assert.equal(result.state.ledger.length, 1);
  assert.deepEqual(rules.computeTotals(result.state), { xp: 50, coins: 15, resources: { wood: 0, stone: 0, iron: 1 } });
});

test('a second completion while done is rejected and adds no reward', () => {
  const once = rules.completeTask(withTask(), 't1', { entryId: 'e1' }).state;
  const again = rules.completeTask(once, 't1', { entryId: 'e2' });
  assert.equal(again.ok, false);
  assert.equal(again.state.ledger.length, 1);
  assert.deepEqual(again.state, once);
});

test('reopening keeps the claimed status and the reward', () => {
  const done = rules.completeTask(withTask(), 't1', { entryId: 'e1' }).state;
  const reopened = rules.reopenTask(done, 't1');
  assert.equal(reopened.ok, true);
  assert.equal(reopened.state.tasks[0].done, false);
  assert.equal(reopened.state.tasks[0].rewardClaimed, true);
  assert.equal(reopened.state.ledger.length, 1);
  assert.deepEqual(rules.computeTotals(reopened.state), rules.computeTotals(done));
});

test('completing a reopened task does not grant rewards again', () => {
  const done = rules.completeTask(withTask(), 't1', { entryId: 'e1' }).state;
  const reopened = rules.reopenTask(done, 't1').state;
  const again = rules.completeTask(reopened, 't1', { entryId: 'e2' });
  assert.equal(again.ok, true);
  assert.equal(again.reason, 'reward-already-claimed');
  assert.equal(again.entry, null);
  assert.equal(again.state.tasks[0].done, true);
  assert.equal(again.state.ledger.length, 1);
  assert.deepEqual(rules.computeTotals(again.state), rules.computeTotals(done));
});

test('deleting a completed task keeps earned rewards but removes it from completed count', () => {
  const done = rules.completeTask(withTask(), 't1', { entryId: 'e1' }).state;
  assert.equal(rules.countCompleted(done), 1);
  const deleted = rules.deleteTask(done, 't1');
  assert.equal(deleted.ok, true);
  assert.equal(deleted.state.tasks.length, 0);
  assert.equal(deleted.state.ledger.length, 1);
  assert.equal(rules.countCompleted(deleted.state), 0);
  assert.deepEqual(rules.computeTotals(deleted.state), rules.computeTotals(done));
});

test('deleting an open task creates no reward', () => {
  const deleted = rules.deleteTask(withTask(), 't1');
  assert.equal(deleted.ok, true);
  assert.equal(deleted.state.ledger.length, 0);
  assert.deepEqual(rules.computeTotals(deleted.state), { xp: 0, coins: 0, resources: { wood: 0, stone: 0, iron: 0 } });
});

test('priority is locked while a task is completed, but title and date remain editable', () => {
  const done = rules.completeTask(withTask(), 't1', { entryId: 'e1' }).state;
  const blocked = rules.editTask(done, 't1', { priority: { tier: 'low', urgent: false, important: false } });
  assert.equal(blocked.ok, false);
  assert.match(blocked.issues[0], /priority locked/);
  assert.deepEqual(blocked.state, done);

  const edited = rules.editTask(done, 't1', { title: 'Renamed', date: '2026-12-01' });
  assert.equal(edited.ok, true);
  assert.equal(edited.state.tasks[0].title, 'Renamed');
  assert.equal(edited.state.tasks[0].date, '2026-12-01');
  assert.deepEqual(rules.computeTotals(edited.state), rules.computeTotals(done));
});

test('priority can change after reopening without changing earned rewards', () => {
  const done = rules.completeTask(withTask(), 't1', { entryId: 'e1' }).state;
  const reopened = rules.reopenTask(done, 't1').state;
  const changed = rules.editTask(reopened, 't1', { priority: { tier: 'low', urgent: true, important: true } });
  assert.equal(changed.ok, true);
  assert.deepEqual(changed.state.tasks[0].priority, { tier: 'low', urgent: true, important: true });
  assert.equal(changed.state.ledger.length, 1);
  assert.deepEqual(rules.computeTotals(changed.state), rules.computeTotals(done));
});

test('totals are baseline plus ledger entries', () => {
  const state = emptyState();
  state.baseline = { xp: 7, coins: 2, resources: { wood: 4, stone: 1, iron: 0 } };
  const created = rules.createTask({ title: 'Claim', priority: { tier: 'medium', urgent: false, important: false } }, { id: 'b1' });
  state.tasks.push(created.task);
  const completed = rules.completeTask(state, 'b1', { entryId: 'e1' });
  assert.deepEqual(rules.computeTotals(completed.state), { xp: 27, coins: 8, resources: { wood: 6, stone: 1, iron: 0 } });
});

test('invalid ids and missing tasks are handled without mutation', () => {
  const state = withTask();
  for (const result of [rules.completeTask(state, 'missing'), rules.reopenTask(state, 'missing'), rules.editTask(state, 'missing', { title: 'x' }), rules.deleteTask(state, 'missing')]) {
    assert.equal(result.ok, false);
    assert.deepEqual(result.state, state);
  }
});

test('reopening an open task is rejected', () => {
  const state = withTask();
  const result = rules.reopenTask(state, 't1');
  assert.equal(result.ok, false);
  assert.deepEqual(result.state, state);
});
