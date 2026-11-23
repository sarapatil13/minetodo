const test = require('node:test');
const assert = require('node:assert/strict');
const tiles = require('../src/world/tiles.js');
const mapData = require('../src/world/map.js');
const grid = require('../src/world/grid.js');
const validation = require('../src/world/mapValidation.js');
const worldApi = require('../src/world/index.js');

function sample() {
  return mapData.createSampleMeadow();
}

test('createGrid builds a validated deterministic terrain grid', () => {
  const world = grid.createGrid(3, 2, { name: 'Test Plot', terrain: 'sand' });

  assert.deepEqual(validation.validateMap(world), []);
  assert.equal(world.name, 'Test Plot');
  assert.equal(world.width, 3);
  assert.equal(world.height, 2);
  assert.deepEqual(world.objects, []);
  assert.equal(world.tiles.length, 2);
  assert.equal(world.tiles[0].length, 3);

  assert.deepEqual(world.tiles[0], [
    { type: 'sand', variant: 0 },
    { type: 'sand', variant: 2 },
    { type: 'sand', variant: 4 }
  ]);
  assert.deepEqual(world.tiles[1], [
    { type: 'sand', variant: 1 },
    { type: 'sand', variant: 3 },
    { type: 'sand', variant: 0 }
  ]);
  assert.deepEqual(grid.createGrid(3, 2, { terrain: 'sand' }).tiles, world.tiles);
});

test('createGrid accepts aliases and custom variant salts', () => {
  const world = grid.createGrid(2, 2, { terrain: 'path', variantSalt: 2 });
  const definition = tiles.getTerrainDefinition('path');

  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      assert.equal(world.tiles[row][col].type, 'path');
      assert.equal(
        world.tiles[row][col].variant,
        tiles.variantFor(col, row, 2, definition.variants)
      );
    }
  }
  assert.deepEqual(validation.validateMap(world), []);
});

test('createGrid rejects invalid dimensions, terrain, salt and name', () => {
  assert.throws(() => grid.createGrid(0, 2), RangeError);
  assert.throws(() => grid.createGrid(2, -1), RangeError);
  assert.throws(() => grid.createGrid(2.5, 2), RangeError);
  assert.throws(() => grid.createGrid(2, 2, { terrain: 'lava' }), TypeError);
  assert.throws(() => grid.createGrid(2, 2, { variantSalt: 1.5 }), TypeError);
  assert.throws(() => grid.createGrid(2, 2, { name: 123 }), TypeError);
});

test('adoptGrid clones nested arrays and objects without changing the source', () => {
  const source = sample();
  source.tiles[0][0].metadata = { tag: 'original', layers: ['a'] };
  const before = JSON.stringify(source);

  const adopted = grid.adoptGrid(source);
  assert.deepEqual(adopted, source);
  assert.notStrictEqual(adopted, source);
  assert.notStrictEqual(adopted.tiles, source.tiles);
  assert.notStrictEqual(adopted.tiles[0], source.tiles[0]);
  assert.notStrictEqual(adopted.tiles[0][0], source.tiles[0][0]);
  assert.notStrictEqual(adopted.tiles[0][0].metadata, source.tiles[0][0].metadata);
  assert.notStrictEqual(adopted.tiles[0][0].metadata.layers, source.tiles[0][0].metadata.layers);
  assert.notStrictEqual(adopted.objects, source.objects);
  assert.notStrictEqual(adopted.objects[0], source.objects[0]);

  adopted.tiles[0][0].type = 'stone';
  adopted.tiles[0][0].metadata.tag = 'changed';
  adopted.tiles[0][0].metadata.layers.push('b');
  adopted.objects[0].id = 'changed-tree';

  assert.equal(source.tiles[0][0].type, 'grass');
  assert.equal(source.tiles[0][0].metadata.tag, 'original');
  assert.deepEqual(source.tiles[0][0].metadata.layers, ['a']);
  assert.equal(source.objects[0].id, 'tree-northwest');
  assert.equal(JSON.stringify(source), before);
});

test('adoptGrid rejects invalid maps with structured errors', () => {
  const invalid = sample();
  invalid.tiles[0][0] = { type: 'lava', variant: 0 };

  assert.throws(
    () => grid.adoptGrid(invalid),
    (error) => {
      assert.ok(error instanceof validation.WorldMapError);
      assert.equal(error.code, validation.MAP_ERROR_CODES.INVALID_TERRAIN_ID);
      return true;
    }
  );
});

test('isInBounds and indexOf use zero-based row-major coordinates', () => {
  const world = sample();

  assert.equal(grid.isInBounds(world, 0, 0), true);
  assert.equal(grid.isInBounds(world, 10, 8), true);
  assert.equal(grid.isInBounds(world, 11, 0), false);
  assert.equal(grid.isInBounds(world, 0, 9), false);
  assert.equal(grid.isInBounds(world, -1, 0), false);
  assert.equal(grid.isInBounds(world, 1.5, 0), false);
  assert.equal(grid.isInBounds(null, 0, 0), false);

  assert.equal(grid.indexOf(world, 0, 0), 0);
  assert.equal(grid.indexOf(world, 10, 0), 10);
  assert.equal(grid.indexOf(world, 0, 1), 11);
  assert.equal(grid.indexOf(world, 10, 8), 98);
  assert.equal(grid.indexOf(world, 11, 0), -1);
});

test('getTile returns a copy and null for out-of-bounds coordinates', () => {
  const world = sample();
  world.tiles[0][0].metadata = { depth: 1 };

  const tile = grid.getTile(world, 0, 0);
  assert.deepEqual(tile, { type: 'grass', variant: 0, metadata: { depth: 1 } });
  assert.notStrictEqual(tile, world.tiles[0][0]);
  assert.notStrictEqual(tile.metadata, world.tiles[0][0].metadata);

  tile.type = 'water';
  tile.variant = 99;
  tile.metadata.depth = 2;
  assert.equal(world.tiles[0][0].type, 'grass');
  assert.equal(world.tiles[0][0].variant, 0);
  assert.equal(world.tiles[0][0].metadata.depth, 1);

  assert.equal(grid.getTile(world, -1, 0), null);
  assert.equal(grid.getTile(world, 11, 0), null);
});

test('getNeighbors returns in-bounds cardinal and optional diagonal copies', () => {
  const world = sample();
  const center = grid.getNeighbors(world, 5, 5);

  assert.deepEqual(center.map((entry) => [entry.col, entry.row]), [
    [5, 4],
    [6, 5],
    [5, 6],
    [4, 5]
  ]);

  const corner = grid.getNeighbors(world, 0, 0);
  assert.deepEqual(corner.map((entry) => [entry.col, entry.row]), [
    [1, 0],
    [0, 1]
  ]);

  const diagonal = grid.getNeighbors(world, 0, 0, { diagonal: true });
  assert.deepEqual(diagonal.map((entry) => [entry.col, entry.row]), [
    [1, 0],
    [0, 1],
    [1, 1]
  ]);

  center[0].tile.type = 'stone';
  assert.equal(world.tiles[4][5].type, 'grass');
  assert.deepEqual(grid.getNeighbors(world, -1, 0), []);
});

test('getTilesByType resolves canonical types and matching aliases', () => {
  const world = sample();
  world.tiles[0][0] = { type: 'dirt', variant: 0 };

  const dirt = grid.getTilesByType(world, 'dirt');
  const path = grid.getTilesByType(world, 'path');
  assert.deepEqual(dirt, path);
  assert.equal(dirt.length, 9);
  assert.ok(dirt.some((entry) => (
    entry.col === 0 && entry.row === 0 && entry.tile.type === 'dirt'
  )));
  assert.ok(dirt.some((entry) => (
    entry.col === 3 && entry.row === 7 && entry.tile.type === 'path'
  )));

  const water = grid.getTilesByType(world, 'water');
  const pond = grid.getTilesByType(world, 'pond');
  assert.deepEqual(water, pond);
  assert.deepEqual(water.map((entry) => [entry.col, entry.row]), [
    [8, 5],
    [9, 5],
    [8, 6],
    [9, 6]
  ]);

  assert.equal(grid.getTilesByType(world, 'grass').length, 86);
  assert.equal(grid.getTilesByType(world, 'stone').length, 0);
  assert.throws(() => grid.getTilesByType(world, 'lava'), TypeError);

  water[0].tile.type = 'stone';
  assert.equal(world.tiles[5][8].type, 'pond');
});

test('updateTile returns a new validated map and preserves the original', () => {
  const world = sample();
  const before = JSON.stringify(world);

  const updated = grid.updateTile(world, 0, 0, { type: 'water', variant: 3 });

  assert.equal(JSON.stringify(world), before);
  assert.notStrictEqual(updated, world);
  assert.deepEqual(updated.tiles[0][0], { type: 'water', variant: 3 });
  assert.deepEqual(validation.validateMap(updated), []);
  assert.deepEqual(updated.tiles[0][1], world.tiles[0][1]);
  assert.notStrictEqual(updated.tiles[0][1], world.tiles[0][1]);
  assert.deepEqual(updated.objects, world.objects);
  assert.notStrictEqual(updated.objects[0], world.objects[0]);
});

test('updateTile accepts aliases, preserves metadata, and rejects invalid patches', () => {
  const world = sample();
  world.tiles[1][1].metadata = { note: 'keep me' };

  const aliased = grid.updateTile(world, 1, 1, { type: 'pond' });
  assert.equal(aliased.tiles[1][1].type, 'pond');
  assert.deepEqual(aliased.tiles[1][1].metadata, { note: 'keep me' });

  const metadata = grid.updateTile(world, 1, 1, { metadata: { note: 'new' } });
  assert.equal(metadata.tiles[1][1].type, 'grass');
  assert.deepEqual(metadata.tiles[1][1].metadata, { note: 'new' });
  assert.deepEqual(world.tiles[1][1].metadata, { note: 'keep me' });

  assert.throws(
    () => grid.updateTile(world, 0, 0, { type: 'lava' }),
    validation.WorldMapError
  );
  assert.throws(
    () => grid.updateTile(world, 0, 0, { variant: 5 }),
    validation.WorldMapError
  );
  assert.throws(() => grid.updateTile(world, 11, 0, { type: 'grass' }), RangeError);
  assert.throws(() => grid.updateTile(world, 0, 0, null), TypeError);
  assert.equal(JSON.stringify(world.tiles[0][0]), JSON.stringify({ type: 'grass', variant: 0 }));
});

test('sample meadow can be adopted and queried without changing its data', () => {
  const world = sample();
  const before = JSON.stringify(world);
  const adopted = grid.adoptGrid(world);

  assert.deepEqual(adopted, world);
  assert.equal(grid.getTilesByType(adopted, 'grass').length, 87);
  assert.equal(grid.getTilesByType(adopted, 'dirt').length, 8);
  assert.equal(grid.getTilesByType(adopted, 'water').length, 4);
  assert.equal(JSON.stringify(world), before);
});

test('public adapter exposes Phase 2.2 APIs without changing mount', () => {
  assert.equal(typeof worldApi.mount, 'function');
  assert.strictEqual(worldApi.tiles, tiles);
  assert.strictEqual(worldApi.grid, grid);
  assert.strictEqual(worldApi.validateMap, validation.validateMap);
  assert.strictEqual(worldApi.assertValidMap, validation.assertValidMap);
  assert.strictEqual(worldApi.WorldMapError, validation.WorldMapError);
  assert.equal(Object.prototype.hasOwnProperty.call(worldApi, 'MAP_ERROR_CODES'), false);

  const world = worldApi.createSampleMeadow();
  assert.equal(world.tiles.length, 9);
  assert.deepEqual(worldApi.validateMap(world), []);
  assert.equal(worldApi.grid.indexOf(world, 6, 3), 39);
});
