const test = require('node:test');
const assert = require('node:assert/strict');
const mapData = require('../src/world/map.js');
const validation = require('../src/world/mapValidation.js');

const {
  MAP_ERROR_CODES,
  WorldMapError,
  validateMap,
  assertValidMap
} = validation;

function codes(errors) {
  return errors.map((error) => error.code);
}

function sample() {
  return mapData.createSampleMeadow();
}

test('validateMap accepts the sample meadow without mutating it', () => {
  const world = sample();
  const before = JSON.stringify(world);

  assert.deepEqual(validateMap(world), []);
  assert.strictEqual(assertValidMap(world), world);
  assert.equal(JSON.stringify(world), before);
});

test('validateMap accepts harmless future metadata fields', () => {
  const world = sample();
  world.biome = 'temperate-meadow';
  world.tiles[0][0].decoration = 'pebbles';
  world.objects[0].extent = {
    left: -35,
    top: -85,
    right: 35,
    bottom: 6
  };

  assert.deepEqual(validateMap(world), []);
});

test('validateMap accepts canonical terrain types and legacy aliases', () => {
  const world = sample();
  world.tiles[0][0] = { type: 'stone', variant: 4 };
  world.tiles[0][1] = { type: 'sand', variant: 3 };
  world.tiles[0][2] = { type: 'water', variant: 2 };
  world.tiles[0][3] = { type: 'dirt', variant: 1 };
  world.tiles[0][4] = { type: 'path', variant: 0 };
  world.tiles[0][5] = { type: 'pond', variant: 4 };

  assert.deepEqual(validateMap(world), []);
});

test('validateMap rejects a missing or malformed map root', () => {
  assert.deepEqual(codes(validateMap(null)), [MAP_ERROR_CODES.INVALID_MAP]);
  assert.deepEqual(codes(validateMap([])), [MAP_ERROR_CODES.INVALID_MAP]);

  const errors = validateMap('world');
  assert.equal(errors[0].path, 'map');
  assert.equal(errors[0].details.actual, JSON.stringify('world'));
});

test('validateMap rejects missing or malformed dimensions', () => {
  const missingWidth = sample();
  delete missingWidth.width;
  assert.ok(codes(validateMap(missingWidth)).includes(MAP_ERROR_CODES.INVALID_WIDTH));

  const zeroHeight = sample();
  zeroHeight.height = 0;
  assert.ok(codes(validateMap(zeroHeight)).includes(MAP_ERROR_CODES.INVALID_HEIGHT));

  const fractionalWidth = sample();
  fractionalWidth.width = 11.5;
  assert.ok(codes(validateMap(fractionalWidth)).includes(MAP_ERROR_CODES.INVALID_WIDTH));
});

test('validateMap rejects wrong tile structure and wrong row sizes', () => {
  const missingTiles = sample();
  missingTiles.tiles = null;
  assert.ok(codes(validateMap(missingTiles)).includes(MAP_ERROR_CODES.INVALID_TILES));

  const shortGrid = sample();
  shortGrid.tiles.pop();
  assert.ok(codes(validateMap(shortGrid)).includes(MAP_ERROR_CODES.INVALID_TILES));

  const badRow = sample();
  badRow.tiles[2] = {};
  assert.ok(codes(validateMap(badRow)).includes(MAP_ERROR_CODES.INVALID_TILE_ROW));

  const narrowRow = sample();
  narrowRow.tiles[2] = narrowRow.tiles[2].slice(0, 10);
  const narrowErrors = validateMap(narrowRow);
  assert.ok(codes(narrowErrors).includes(MAP_ERROR_CODES.INVALID_TILE_ROW));
  assert.ok(narrowErrors.some((error) => error.path === 'tiles[2]'));
});

test('validateMap rejects malformed tiles with precise paths', () => {
  const world = sample();
  world.tiles[4][6] = null;

  const errors = validateMap(world);
  assert.ok(codes(errors).includes(MAP_ERROR_CODES.INVALID_TILE));
  assert.ok(errors.some((error) => error.path === 'tiles[4][6]'));
});

test('validateMap rejects unknown terrain ids but accepts aliases', () => {
  const world = sample();
  world.tiles[1][1] = { type: 'lava', variant: 2 };

  const errors = validateMap(world);
  assert.ok(codes(errors).includes(MAP_ERROR_CODES.INVALID_TERRAIN_ID));
  assert.ok(errors.some((error) => (
    error.path === 'tiles[1][1].type' &&
    error.details.actual === JSON.stringify('lava')
  )));

  world.tiles[1][1] = { type: 'path', variant: 2 };
  world.tiles[1][2] = { type: 'pond', variant: 2 };
  assert.deepEqual(validateMap(world), []);
});

test('validateMap rejects invalid tile variants including alias variants', () => {
  const world = sample();
  world.tiles[0][0] = { type: 'grass', variant: 5 };
  world.tiles[0][1] = { type: 'path', variant: -1 };
  world.tiles[0][2] = { type: 'pond', variant: 1.5 };

  const errors = validateMap(world);
  const variantErrors = errors.filter((error) => (
    error.code === MAP_ERROR_CODES.INVALID_VARIANT
  ));
  assert.equal(variantErrors.length, 3);
  assert.deepEqual(variantErrors.map((error) => error.path), [
    'tiles[0][0].variant',
    'tiles[0][1].variant',
    'tiles[0][2].variant'
  ]);
  assert.equal(variantErrors[0].details.expected, 'integer from 0 to 4');
});

test('validateMap rejects invalid object ids, kinds, anchors and variants', () => {
  const world = sample();
  world.objects = [
    { id: '', kind: 'tree', col: 0, row: 0, variant: 0 },
    { id: 'tree-north', kind: 'dragon', col: 1, row: 1, variant: 1 },
    { id: 'out-of-bounds', kind: 'bush', col: 11, row: 8, variant: 2 },
    { id: 'bad-variant', kind: 'fence', col: 2, row: 2, variant: 5 },
    { id: 'tree-north', kind: 'flowers', col: 4, row: 4, variant: 0 },
    { id: 'tree-northwest', kind: 'tree', col: 3, row: 3, variant: 0 }
  ];

  const found = codes(validateMap(world));
  assert.ok(found.includes(MAP_ERROR_CODES.INVALID_OBJECT_ID));
  assert.ok(found.includes(MAP_ERROR_CODES.INVALID_OBJECT_KIND));
  assert.ok(found.includes(MAP_ERROR_CODES.OBJECT_OUT_OF_BOUNDS));
  assert.ok(found.includes(MAP_ERROR_CODES.INVALID_VARIANT));
  assert.ok(found.includes(MAP_ERROR_CODES.DUPLICATE_OBJECT_ID));
});

test('validateMap rejects a missing objects array', () => {
  const world = sample();
  delete world.objects;

  assert.ok(codes(validateMap(world)).includes(MAP_ERROR_CODES.INVALID_OBJECTS));
});

test('validation errors are structured and actionable', () => {
  const world = sample();
  world.tiles[2][3] = { type: 'magma', variant: 99 };

  const errors = validateMap(world);
  assert.equal(errors.length, 2);

  for (const error of errors) {
    assert.deepEqual(Object.keys(error).sort(), ['code', 'details', 'message', 'path']);
    assert.equal(typeof error.code, 'string');
    assert.equal(typeof error.path, 'string');
    assert.equal(typeof error.message, 'string');
    assert.equal(typeof error.details, 'object');
    assert.ok(error.message.length > 10);
  }

  assert.deepEqual(errors.map((error) => error.path), [
    'tiles[2][3].type',
    'tiles[2][3].variant'
  ]);
});

test('assertValidMap throws a WorldMapError with all collected errors', () => {
  const world = sample();
  delete world.width;
  world.height = 0;

  assert.throws(
    () => assertValidMap(world),
    (error) => {
      assert.ok(error instanceof WorldMapError);
      assert.ok(error instanceof Error);
      assert.equal(error.name, 'WorldMapError');
      assert.equal(error.code, MAP_ERROR_CODES.INVALID_WIDTH);
      assert.equal(error.errors.length, 2);
      assert.match(error.message, /Invalid world map \(2 errors\)/);
      assert.match(error.message, /width:/);
      assert.match(error.message, /height:/);
      return true;
    }
  );
});
