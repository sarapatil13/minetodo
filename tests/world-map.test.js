const test = require('node:test');
const assert = require('node:assert/strict');
const map = require('../src/world/map.js');

test('createSampleMeadow is deterministic', () => {
  const first = map.createSampleMeadow();
  const second = map.createSampleMeadow();
  assert.deepEqual(first, second);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.tiles, second.tiles);
  assert.notStrictEqual(first.objects, second.objects);
});

test('sample meadow is an 11 by 9 grid of known tile types', () => {
  const world = map.createSampleMeadow();
  assert.equal(world.width, 11);
  assert.equal(world.height, 9);
  assert.equal(world.tiles.length, 9);

  const seenTypes = new Set();
  for (const row of world.tiles) {
    assert.equal(row.length, 11);
    for (const tile of row) {
      assert.ok(map.TILE_TYPES.includes(tile.type));
      assert.ok(Number.isInteger(tile.variant));
      seenTypes.add(tile.type);
    }
  }

  assert.deepEqual([...seenTypes].sort(), ['grass', 'path', 'pond']);
});

test('sample meadow contains the required terrain', () => {
  const world = map.createSampleMeadow();
  const pathTiles = [];
  const pondTiles = [];

  world.tiles.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      if (tile.type === 'path') pathTiles.push([colIndex, rowIndex]);
      if (tile.type === 'pond') pondTiles.push([colIndex, rowIndex]);
    });
  });

  assert.ok(pathTiles.length >= 6);
  assert.ok(pondTiles.length >= 3);
  assert.deepEqual(pathTiles, [[6, 3], [6, 4], [5, 5], [6, 5], [4, 6], [5, 6], [3, 7], [4, 7]]);
  assert.deepEqual(pondTiles, [[8, 5], [9, 5], [8, 6], [9, 6]]);
});

test('sample meadow contains one house and several trees and flowers', () => {
  const world = map.createSampleMeadow();
  const byKind = (kind) => world.objects.filter((object) => object.kind === kind);

  assert.equal(byKind('house').length, 1);
  assert.deepEqual(byKind('house')[0], {
    id: 'starter-house', kind: 'house', col: 7, row: 3, variant: 2
  });
  assert.ok(byKind('tree').length >= 3);
  assert.ok(byKind('flowers').length >= 3);
  assert.ok(byKind('reeds').length >= 1);
});

test('all objects are in bounds, known kinds and uniquely identified', () => {
  const world = map.createSampleMeadow();
  const ids = new Set();

  for (const object of world.objects) {
    assert.ok(map.OBJECT_KINDS.includes(object.kind));
    assert.ok(object.col >= 0 && object.col < world.width);
    assert.ok(object.row >= 0 && object.row < world.height);
    assert.ok(Number.isInteger(object.variant));
    assert.equal(ids.has(object.id), false);
    ids.add(object.id);
  }

  assert.equal(ids.size, world.objects.length);
});
