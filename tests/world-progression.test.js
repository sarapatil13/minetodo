const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/progressionConfig.js');
const progression = require('../src/world/progression.js');

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
