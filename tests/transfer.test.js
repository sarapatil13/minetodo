const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/rules.js');
const storage = require('../src/storage.js');
const transfer = require('../src/transfer.js');

const NOW = '2026-11-24T12:00:00.000Z';

function populatedState() {
  const state = storage.emptyState();
  state.baseline = { xp: 4, coins: 1, resources: { wood: 2, stone: 0, iron: 0 } };
  const made = rules.createTask({ title: 'Finish report', type: 'Project', date: '2026-11-30', priority: { tier: 'high', urgent: true, important: true } }, { id: 't1', now: NOW });
  state.tasks.push(made.task);
  const done = rules.completeTask(state, 't1', { entryId: 'e1', now: NOW });
  return done.state;
}

test('exportState writes the expected envelope and valid JSON', () => {
  const state = populatedState();
  const text = transfer.exportState(state, { now: NOW });
  const payload = JSON.parse(text);
  assert.equal(payload.app, 'CozyQuest');
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.exportedAt, NOW);
  assert.deepEqual(payload.state, state);
});

test('exportState refuses an invalid state', () => {
  const state = populatedState();
  state.ledger[0].reward.xp = 999;
  assert.throws(() => transfer.exportState(state), /Cannot export invalid state/);
});

test('parseImport round-trips a valid export with an accurate summary', () => {
  const state = populatedState();
  const text = transfer.exportState(state, { now: NOW });
  const result = transfer.parseImport(text, { now: NOW });
  assert.equal(result.ok, true);
  assert.deepEqual(result.state, state);
  assert.deepEqual(result.summary, {
    taskCount: 1,
    doneCount: 1,
    ledgerCount: 1,
    xp: 54,
    coins: 16,
    resources: { wood: 2, stone: 0, iron: 1 },
    exportedAt: NOW
  });
});

test('parseImport rejects malformed, foreign and oversized payloads', () => {
  const valid = transfer.exportState(storage.emptyState(), { now: NOW });
  const payload = JSON.parse(valid);

  const cases = [
    ['not json', '{broken'],
    ['wrong app', JSON.stringify({ ...payload, app: 'Other' })],
    ['future schema', JSON.stringify({ ...payload, schemaVersion: 3 })],
    ['missing state', JSON.stringify({ app: 'CozyQuest', schemaVersion: 2 })],
    ['array payload', '[]'],
    ['null payload', 'null'],
    ['bad timestamp', JSON.stringify({ ...payload, exportedAt: 'yesterday' })],
    ['oversized', 'x'.repeat(200)]
  ];
  const options = { maxBytes: 100 };
  for (const [name, text] of cases) {
    const result = transfer.parseImport(text, options);
    assert.equal(result.ok, false, name);
    assert.ok(typeof result.error === 'string' && result.error.length > 0, name);
  }
});

test('parseImport rejects forged ledger rewards and invalid stored totals', () => {
  const state = populatedState();
  const payload = JSON.parse(transfer.exportState(state, { now: NOW }));
  payload.state.ledger[0].reward.xp = 9999;
  const forged = transfer.parseImport(JSON.stringify(payload));
  assert.equal(forged.ok, false);
  assert.match(forged.error, /Invalid backup contents/);

  const totalsPayload = JSON.parse(transfer.exportState(state, { now: NOW }));
  totalsPayload.state.xp = 9999;
  totalsPayload.state.completed = 99;
  const withTotals = transfer.parseImport(JSON.stringify(totalsPayload));
  assert.equal(withTotals.ok, true);
  assert.deepEqual(rules.computeTotals(withTotals.state), rules.computeTotals(state));
  assert.equal('xp' in withTotals.state, false);
  assert.equal('completed' in withTotals.state, false);
});

test('parseImport accepts a ledger entry for a deleted task', () => {
  const state = populatedState();
  state.tasks = [];
  const text = transfer.exportState(state, { now: NOW });
  const result = transfer.parseImport(text);
  assert.equal(result.ok, true);
  assert.equal(result.summary.taskCount, 0);
  assert.equal(result.summary.ledgerCount, 1);
  assert.equal(result.summary.xp, 54);
});

test('export and import normalize task titles without mutating the source state', () => {
  const state = populatedState();
  state.tasks[0].title = '  Padded title  ';
  const text = transfer.exportState(state, { now: NOW });
  assert.equal(JSON.parse(text).state.tasks[0].title, 'Padded title');
  const result = transfer.parseImport(text);
  assert.equal(result.ok, true);
  assert.equal(result.state.tasks[0].title, 'Padded title');
  assert.equal(state.tasks[0].title, '  Padded title  ');
});

test('byteLength counts UTF-8 bytes', () => {
  assert.equal(transfer.byteLength('abc'), 3);
  assert.equal(transfer.byteLength('🌿'), 4);
});
