const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/progressionConfig.js');
const progression = require('../src/world/progression.js');
const mapData = require('../src/world/map.js');
const tiles = require('../src/world/tiles.js');
const coords = require('../src/world/coords.js');
const validation = require('../src/world/mapValidation.js');
const sceneData = require('../src/world/scene.js');

const STAGE_THRESHOLDS = [0, 100, 500, 1400];
const FEATURE_THRESHOLDS = [100, 250, 500, 900, 1400];

test('progression config preserves the approved cosmetic level ladder', () => {
  assert.deepEqual(config.LEVELS.map((entry) => [entry[0], entry[1]]), [
    ['Seedling', 0],
    ['Sprout', 100],
    ['Sapling', 250],
    ['Bloom', 500],
    ['Grove Keeper', 900],
    ['Forest Guardian', 1400]
  ]);
  assert.deepEqual(config.WORLD_STAGES.map((stage) => stage.minXp), STAGE_THRESHOLDS);
  assert.deepEqual(config.WORLD_MILESTONES.map((milestone) => milestone.minXp), [250, 900]);
});

test('progression features use only the four stages and two milestones', () => {
  assert.deepEqual(progression.FEATURES.map((feature) => feature.minXp), FEATURE_THRESHOLDS);
  assert.deepEqual(progression.FEATURES.map((feature) => feature.id), [
    'meadow-wildflowers',
    'meadow-path-accent',
    'village-annex',
    'village-garden',
    'thriving-canopy'
  ]);
  assert.deepEqual(
    progression.FEATURES.map((feature) => feature.stageId),
    ['growing-meadow', 'growing-meadow', 'developed-village', 'developed-village', 'thriving-village']
  );
});

test('normalizeXp handles valid, fractional and invalid values safely', () => {
  assert.equal(progression.normalizeXp(0), 0);
  assert.equal(progression.normalizeXp(1400), 1400);
  assert.equal(progression.normalizeXp(2500), 2500);
  assert.equal(progression.normalizeXp(19.9), 19);
  for (const invalid of [-1, -0.5, NaN, Infinity, -Infinity, undefined, null, '100', {}, []]) {
    assert.equal(progression.normalizeXp(invalid), 0);
  }
});

test('stageForXp maps exact thresholds and just-below values correctly', () => {
  const expected = [
    [0, 'starting-meadow'],
    [99, 'starting-meadow'],
    [100, 'growing-meadow'],
    [249, 'growing-meadow'],
    [250, 'growing-meadow'],
    [499, 'growing-meadow'],
    [500, 'developed-village'],
    [899, 'developed-village'],
    [900, 'developed-village'],
    [1399, 'developed-village'],
    [1400, 'thriving-village'],
    [9999, 'thriving-village']
  ];
  for (const [xp, id] of expected) {
    assert.equal(progression.stageForXp(xp).id, id, xp + ' XP');
  }
});

test('worldProgress reports exact stage spans, remaining XP and percentage', () => {
  const cases = [
    [0, 0, 100, 100, 'starting-meadow', 'growing-meadow'],
    [50, 50, 100, 50, 'starting-meadow', 'growing-meadow'],
    [100, 0, 400, 400, 'growing-meadow', 'developed-village'],
    [250, 150, 400, 250, 'growing-meadow', 'developed-village'],
    [500, 0, 900, 900, 'developed-village', 'thriving-village'],
    [900, 400, 900, 500, 'developed-village', 'thriving-village'],
    [1400, 0, 0, 0, 'thriving-village', null],
    [2500, 1100, 0, 0, 'thriving-village', null]
  ];

  for (const [xp, earned, expectedSpan, remaining, stageId, nextId] of cases) {
    const result = progression.worldProgress(xp);
    assert.equal(result.xp, xp);
    assert.equal(result.stage.id, stageId, xp + ' stage');
    assert.equal(result.earned, earned, xp + ' earned');
    assert.equal(result.span, expectedSpan, xp + ' span');
    assert.equal(result.remainingXp, remaining, xp + ' remaining');
    assert.equal(result.next && result.next.id, nextId, xp + ' next');
    assert.ok(result.percent >= 0 && result.percent <= 100);
  }
});

test('worldProgress never exceeds 100 percent', () => {
  for (const xp of [0, 99, 100, 249, 250, 499, 500, 899, 900, 1399, 1400, 5000, 1e9]) {
    const result = progression.worldProgress(xp);
    assert.ok(result.percent >= 0 && result.percent <= 100, xp + ' percent');
  }
});

test('features are monotonic and remain unlocked at every higher milestone', () => {
  let previous = [];
  for (const xp of FEATURE_THRESHOLDS) {
    const ids = Array.from(progression.featureIdsForXp(xp));
    for (const id of previous) assert.ok(ids.includes(id), id + ' remains at ' + xp);
    assert.equal(ids.length, FEATURE_THRESHOLDS.indexOf(xp) + 1);
    previous = ids;
  }
  assert.deepEqual(Array.from(progression.featureIdsForXp(9999)), previous);
  assert.deepEqual(Array.from(progression.featureIdsForXp(0)), []);
});

test('nextFeatureAfter surfaces the intermediate milestones', () => {
  assert.equal(progression.nextFeatureAfter(0).id, 'meadow-wildflowers');
  assert.equal(progression.nextFeatureAfter(100).id, 'meadow-path-accent');
  assert.equal(progression.nextFeatureAfter(250).id, 'village-annex');
  assert.equal(progression.nextFeatureAfter(500).id, 'village-garden');
  assert.equal(progression.nextFeatureAfter(900).id, 'thriving-canopy');
  assert.equal(progression.nextFeatureAfter(1400), null);
  assert.equal(progression.nextFeatureAfter(-5).id, 'meadow-wildflowers');
});

test('crossing multiple milestones at once reports every unlocked feature', () => {
  const result = progression.worldProgress(1400);
  assert.deepEqual(Array.from(result.unlockedFeatures), [
    'meadow-wildflowers',
    'meadow-path-accent',
    'village-annex',
    'village-garden',
    'thriving-canopy'
  ]);
  assert.equal(result.stage.id, 'thriving-village');
  assert.equal(result.nextUnlock, null);
});

test('composing at zero XP preserves the exact base meadow', () => {
  const base = mapData.createSampleMeadow();
  const before = JSON.stringify(base);
  const composed = progression.composeProgressionMap(base, 0);
  assert.equal(JSON.stringify(composed), before);
  assert.equal(JSON.stringify(base), before);
});

test('every stage and milestone produces a valid deterministic map', () => {
  for (const xp of [0, 100, 250, 500, 900, 1400, 5000, -5, NaN]) {
    const base = mapData.createSampleMeadow();
    const before = JSON.stringify(base);
    const first = progression.composeProgressionMap(base, xp);
    const second = progression.composeProgressionMap(base, xp);

    assert.deepEqual(validation.validateMap(first), [], xp + ' valid');
    assert.equal(JSON.stringify(first), JSON.stringify(second), xp + ' deterministic');
    assert.equal(JSON.stringify(base), before, xp + ' base unchanged');
  }
});

test('generated IDs are stable, unique and namespaced at the highest stage', () => {
  const base = mapData.createSampleMeadow();
  const composed = progression.composeProgressionMap(base, 1400);
  const generated = composed.objects.filter((object) => object.id.indexOf('progression-') === 0);
  const ids = composed.objects.map((object) => object.id);

  assert.equal(generated.length, 15);
  assert.equal(new Set(ids).size, ids.length);
  for (const object of generated) {
    assert.ok(object.id.indexOf('progression-') === 0);
    assert.ok(['tree', 'house', 'flowers', 'bush', 'reeds', 'fence'].includes(object.kind));
    assert.equal(object.metadata.source, 'progression');
    assert.equal(object.metadata.minXp > 0, true);
  }
  for (const baseObject of base.objects) {
    const match = composed.objects.find((object) => object.id === baseObject.id);
    assert.deepEqual(match, baseObject);
  }
});

test('generated objects never share an anchor with a base or generated object', () => {
  const composed = progression.composeProgressionMap(mapData.createSampleMeadow(), 1400);
  const cells = new Set();
  for (const object of composed.objects) {
    const key = object.col + ',' + object.row;
    assert.equal(cells.has(key), false, key + ' is unique');
    cells.add(key);
  }
  assert.equal(cells.size, composed.objects.length);
});

test('progression tile patches only convert grass to deterministic path tiles', () => {
  const base = mapData.createSampleMeadow();
  const composed = progression.composeProgressionMap(base, 1400);
  const changed = [];
  for (let row = 0; row < base.height; row += 1) {
    for (let col = 0; col < base.width; col += 1) {
      const before = base.tiles[row][col];
      const after = composed.tiles[row][col];
      if (before.type !== after.type || before.variant !== after.variant) {
        changed.push(col + ',' + row);
        assert.equal(before.type, 'grass');
        assert.equal(after.type, 'path');
        assert.equal(
          after.variant,
          tiles.variantFor(col, row, 3, tiles.getTerrainDefinition('path').variants)
        );
      }
    }
  }
  assert.deepEqual(changed, ['7,4', '6,6', '8,7']);
});

test('scene bounds remain identical across all stages and milestones', () => {
  const base = mapData.createSampleMeadow();
  const baseBounds = coords.sceneBounds(base);
  for (const xp of [0, 100, 250, 500, 900, 1400, 5000]) {
    const scene = progression.createProgressionScene(base, xp);
    assert.deepEqual(scene.bounds, baseBounds, xp + ' bounds');
  }
});

test('progression scenes preserve base command IDs and add generated object IDs', () => {
  const base = mapData.createSampleMeadow();
  const baseScene = sceneData.createScene(base);
  const fullScene = progression.createProgressionScene(base, 1400);
  const baseIds = baseScene.commands.map((command) => command.id);
  const fullIds = fullScene.commands.map((command) => command.id);

  for (const id of baseIds) assert.ok(fullIds.includes(id), id + ' preserved');
  assert.ok(fullIds.includes('object:progression-annex-house'));
  assert.ok(fullIds.includes('object:progression-canopy-tree'));
  assert.equal(new Set(fullIds).size, fullIds.length);
});

test('composing from an invalid base map fails without returning a partial map', () => {
  const invalid = mapData.createSampleMeadow();
  invalid.objects[0].id = '';
  assert.throws(() => progression.composeProgressionMap(invalid, 1400), /Invalid base map/);
});
