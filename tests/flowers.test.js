const test = require('node:test');
const assert = require('node:assert/strict');
const flowers = require('../src/flowers.js');

test('exposes eight distinct, frozen flower varieties', () => {
  assert.equal(flowers.VARIETIES.length, 8);
  assert.equal(new Set(flowers.VARIETIES.map((v) => v.id)).size, 8);
  assert.equal(new Set(flowers.VARIETIES.map((v) => v.glyph)).size, 8);
  assert.ok(Object.isFrozen(flowers.VARIETIES));
  for (const variety of flowers.VARIETIES) {
    assert.ok(Object.isFrozen(variety), variety.id + ' should be frozen');
    assert.match(variety.id, /^[a-z]+$/);
    assert.ok(variety.name.length > 0);
    assert.ok(variety.glyph.length > 0);
  }
});

test('assignment is deterministic and stable for the same task id', () => {
  const task = { id: 'flower-stable-42', title: 'Read a chapter', done: true };
  const first = flowers.flowerForTask(task);
  const second = flowers.flowerForTask({ ...task, title: 'Renamed', type: 'Project' });

  assert.deepEqual(first, second);
  assert.strictEqual(first, second);
  assert.strictEqual(first, flowers.flowerForId('flower-stable-42'));
  assert.strictEqual(flowers.flowerForTask(task), first);
});

test('ordinary task ids distribute across every flower variety', () => {
  const seen = new Set();
  for (let i = 0; i < 256; i++) {
    const flower = flowers.flowerForId('task-' + i);
    assert.ok(flower, 'task-' + i + ' should receive a flower');
    seen.add(flower.id);
  }

  assert.equal(seen.size, flowers.VARIETIES.length);
  for (const variety of flowers.VARIETIES) {
    assert.ok(seen.has(variety.id), variety.id + ' never appeared');
  }
});

test('invalid or missing task ids produce no flower', () => {
  for (const id of [undefined, null, '', '   ', 0, 123, true, [], {}]) {
    assert.equal(flowers.flowerForId(id), null);
  }

  for (const task of [
    null, undefined, {}, 'task-1',
    { id: '' }, { id: '   ' }, { id: 0 }, { id: 123 },
    { id: null }, { id: true }, { id: [] }, { id: {} }
  ]) {
    assert.equal(flowers.flowerForTask(task), null);
  }
});

test('flower lookup never mutates task data or the returned variety', () => {
  const task = Object.freeze({
    id: 'no-mutation',
    title: 'Water the plants',
    type: 'Daily habit',
    date: '2026-11-25',
    done: false
  });
  const before = JSON.stringify(task);
  const keys = Object.keys(task);

  const flower = flowers.flowerForTask(task);

  assert.equal(JSON.stringify(task), before);
  assert.deepEqual(Object.keys(task), keys);
  assert.equal(task.flower, undefined);
  assert.ok(Object.isFrozen(flower));
});
