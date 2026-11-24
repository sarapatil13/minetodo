const test = require('node:test');
const assert = require('node:assert/strict');
const coords = require('../src/world/coords.js');
const mapData = require('../src/world/map.js');
const sceneData = require('../src/world/scene.js');
const content = require('../src/world/content.js');
const contentCatalog = require('../src/world/contentCatalog.js');
const biomeCatalog = require('../src/world/biomeCatalog.js');

const BIOME_IDS = ['meadow', 'forest', 'lakeside', 'autumn', 'snowy'];

function anchors(map) {
  return map.objects
    .map((object) => ({ id: object.id, kind: object.kind, col: object.col, row: object.row }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

test('biome catalog exposes five deterministic, frozen definitions', () => {
  const all = biomeCatalog.all();
  assert.equal(Object.isFrozen(all), true);
  assert.deepEqual(all.map((biome) => biome.id), BIOME_IDS);
  assert.equal(new Set(BIOME_IDS).size, BIOME_IDS.length);
  for (const biome of all) {
    assert.equal(Object.isFrozen(biome), true);
    assert.equal(biome.baseMapId.length > 0, true);
    assert.equal(biomeCatalog.getBiome(biome.id), biome);
  }
  assert.equal(biomeCatalog.getBiome('unknown'), null);
  assert.throws(() => biomeCatalog.createBaseMap('unknown'), /Unknown biome id/);
});

test('meadow base map is the exact Phase 2.1 map and other biomes keep object anchors', () => {
  const baseline = mapData.createSampleMeadow();
  const baselineAnchors = anchors(baseline);
  const baselineBounds = coords.sceneBounds(baseline);
  const before = JSON.stringify(baseline);

  assert.deepEqual(biomeCatalog.createBaseMap('meadow'), baseline);

  for (const id of BIOME_IDS.slice(1)) {
    const map = biomeCatalog.createBaseMap(id);
    assert.equal(map.width, mapData.WIDTH);
    assert.equal(map.height, mapData.HEIGHT);
    assert.deepEqual(anchors(map), baselineAnchors);
    assert.deepEqual(coords.sceneBounds(map), baselineBounds);
    assert.deepEqual(sceneData.createScene(map).bounds, sceneData.createScene(baseline).bounds);
  }

  assert.equal(JSON.stringify(baseline), before, 'base factories must not mutate the source map');
});

test('biome terrain uses existing terrain IDs and deterministic variants', () => {
  for (const id of BIOME_IDS) {
    const first = biomeCatalog.createBaseMap(id);
    const second = biomeCatalog.createBaseMap(id);
    assert.deepEqual(first.tiles, second.tiles, id);
    for (const row of first.tiles) {
      for (const tile of row) {
        assert.ok(mapData.TILE_TYPES.indexOf(tile.type) !== -1, id + ' used an unknown terrain id');
        assert.ok(Number.isInteger(tile.variant) && tile.variant >= 0);
      }
    }
  }
  assert.notDeepEqual(
    biomeCatalog.createBaseMap('forest').tiles,
    biomeCatalog.createBaseMap('lakeside').tiles
  );
});

test('palettes are partial, cloned, and never mutate catalog definitions', () => {
  assert.equal(biomeCatalog.paletteFor('meadow'), null);
  const first = biomeCatalog.paletteFor('forest');
  assert.ok(first.grass.length > 0);
  assert.equal(Object.isFrozen(biomeCatalog.getBiome('forest').palette), true);

  first.grass[0] = '#000000';
  first.skyTop = '#000000';
  const second = biomeCatalog.paletteFor('forest');
  assert.notEqual(second.grass[0], '#000000');
  assert.notEqual(second.skyTop, '#000000');
  assert.equal(second.grass[0], biomeCatalog.getBiome('forest').palette.grass[0]);
});

test('biome unlocks reuse the existing thresholds and achievements', () => {
  const start = biomeCatalog.evaluateUnlocks({ xp: 0, completedTasks: 0, ledgerEntries: 0 });
  assert.equal(Object.isFrozen(start), true);
  assert.equal(start.available.meadow, true);
  assert.equal(start.available.forest, false);
  assert.equal(start.available.lakeside, false);
  assert.equal(start.available.autumn, false);
  assert.equal(start.available.snowy, false);

  const tasks = biomeCatalog.evaluateUnlocks({ xp: 0, completedTasks: 10 });
  assert.equal(tasks.available.forest, true);

  const xp500 = biomeCatalog.evaluateUnlocks({ xp: 500 });
  assert.equal(xp500.available.lakeside, true);
  assert.equal(xp500.available.autumn, false);

  const xp900 = biomeCatalog.evaluateUnlocks({ xp: 900 });
  assert.equal(xp900.available.autumn, true);

  const rewards = biomeCatalog.evaluateUnlocks({ xp: 0, ledgerEntries: 20 });
  assert.equal(rewards.available.snowy, true);
});

test('catalog items declare biome compatibility without implicit ownership', () => {
  assert.equal(biomeCatalog.supportsItem('snowy', 'decor:flower:snowdrop'), true);
  assert.equal(biomeCatalog.supportsItem('forest', 'decor:flower:snowdrop'), false);
  assert.equal(biomeCatalog.supportsItem('snowy', 'decor:fence:picket'), true);
  assert.equal(biomeCatalog.supportsItem('unknown', 'decor:fence:picket'), false);
  assert.equal(contentCatalog.supportsBiome('decor:flower:snowdrop', 'snowy'), true);
});

test('content composition carries a palette into the scene', () => {
  const palette = biomeCatalog.paletteFor('autumn');
  const result = content.compose({
    baseMap: biomeCatalog.createBaseMap('autumn'),
    xp: 0,
    state: content.emptyModifications(),
    palette
  });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.scene.palette, palette);
  assert.deepEqual(result.scene.bounds, coords.sceneBounds(biomeCatalog.createBaseMap('autumn')));
});
