const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const tiles = require('../src/world/tiles.js');
const map = require('../src/world/map.js');

const ALLOWED_DEFINITION_KEYS = [
  'id',
  'label',
  'variants',
  'visualCategory',
  'walkable'
];

test('canonical terrain definitions are complete and gameplay-neutral', () => {
  const ids = tiles.CANONICAL_TERRAIN_IDS.slice();

  assert.deepEqual(ids, ['grass', 'dirt', 'water', 'stone', 'sand']);
  assert.equal(ids.length, 5);

  for (const id of ids) {
    const definition = tiles.getTerrainDefinition(id);
    assert.ok(definition, 'missing definition for ' + id);
    assert.equal(definition.id, id);
    assert.deepEqual(Object.keys(definition).sort(), ALLOWED_DEFINITION_KEYS);
    assert.equal(typeof definition.label, 'string');
    assert.equal(typeof definition.walkable, 'boolean');
    assert.equal(typeof definition.visualCategory, 'string');
    assert.equal(definition.variants, tiles.DEFAULT_VARIANTS);
  }

  assert.equal(tiles.getTerrainDefinition('water').walkable, false);
});

test('legacy aliases resolve to canonical terrain without rewriting raw IDs', () => {
  assert.deepEqual(tiles.TERRAIN_ALIASES, { path: 'dirt', pond: 'water' });
  assert.equal(tiles.resolveTerrainType('path'), 'dirt');
  assert.equal(tiles.resolveTerrainType('pond'), 'water');
  assert.equal(tiles.resolveTerrainType('dirt'), 'dirt');
  assert.equal(tiles.resolveTerrainType('water'), 'water');
  assert.equal(tiles.resolveTerrainType('lava'), null);
  assert.equal(tiles.resolveTerrainType(null), null);
  assert.equal(tiles.isAllowedTerrainType('path'), true);
  assert.equal(tiles.isAllowedTerrainType('pond'), true);
  assert.equal(tiles.isAllowedTerrainType('stone'), true);
  assert.equal(tiles.isAllowedTerrainType('lava'), false);

  assert.equal(tiles.getTerrainDefinition('path').id, 'dirt');
  assert.equal(tiles.getTerrainDefinition('pond').id, 'water');
});

test('terrain definition accessors do not expose mutable internals', () => {
  const first = tiles.getTerrainDefinition('dirt');
  first.label = 'Changed';
  first.walkable = false;
  first.variants = 99;

  const second = tiles.getTerrainDefinition('path');
  assert.equal(second.label, 'Dirt');
  assert.equal(second.walkable, true);
  assert.equal(second.variants, 5);
  assert.equal(Object.isFrozen(tiles.TERRAIN_ALIASES), true);
});

test('variant validation accepts aliases and rejects out-of-range values', () => {
  for (const id of tiles.CANONICAL_TERRAIN_IDS) {
    assert.equal(tiles.isValidVariant(id, 0), true);
    assert.equal(tiles.isValidVariant(id, 4), true);
    assert.equal(tiles.isValidVariant(id, 5), false);
    assert.equal(tiles.isValidVariant(id, -1), false);
    assert.equal(tiles.isValidVariant(id, 1.5), false);
    assert.equal(tiles.isValidVariant(id, '1'), false);
  }

  assert.equal(tiles.isValidVariant('path', 3), true);
  assert.equal(tiles.isValidVariant('pond', 3), true);
  assert.equal(tiles.isValidVariant('lava', 0), false);
});

test('variantFor preserves the exact Phase 2.1 formula', () => {
  assert.equal(tiles.variantFor(0, 0, 1), 0);
  assert.equal(tiles.variantFor(1, 0, 1), 2);
  assert.equal(tiles.variantFor(0, 1, 1), 1);
  assert.equal(tiles.variantFor(6, 3, 1), 0);

  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 11; col += 1) {
      const expected = (col * 7 + row * 11 + 1 * 5) % 5;
      assert.equal(tiles.variantFor(col, row, 1), expected);
    }
  }

  assert.throws(() => tiles.variantFor(1.5, 0, 1), TypeError);
  assert.throws(() => tiles.variantFor(1, 0, 1, 0), TypeError);
});

test('sample meadow keeps the exact Phase 2.1 terrain and variant snapshot', () => {
  const world = map.createSampleMeadow();
  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(world))
    .digest('hex');

  assert.equal(fingerprint, 'f68d415ebe11eb414f9f4c2d74c3bbde132afff63606a1748d027e31048f0057');
  assert.deepEqual(map.TILE_TYPES, ['grass', 'path', 'pond']);
  assert.equal(typeof map.createSampleMeadow().tiles[3][6].type, 'string');
  assert.equal(map.createSampleMeadow().tiles[3][6].type, 'path');
  assert.equal(map.createSampleMeadow().tiles[5][8].type, 'pond');
});
