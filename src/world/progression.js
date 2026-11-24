(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const config = isNode
    ? require('../progressionConfig.js')
    : root.CQ.progressionConfig;
  const tiles = isNode ? require('./tiles.js') : root.CQ.worldTiles;
  const validation = isNode ? require('./mapValidation.js') : root.CQ.worldMapValidation;
  const sceneData = isNode ? require('./scene.js') : root.CQ.worldScene;
  const api = factory(config, tiles, validation, sceneData);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldProgression = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config, tiles, validation, sceneData) {
  'use strict';

  const STAGES = config.WORLD_STAGES;
  const MILESTONES = config.WORLD_MILESTONES;
  const TILE_PATCH_SALT = 3;

  // Each entry is a distinct, permanent visual unlock. Major stage entries use
  // the same threshold as their stage; accent entries use the two approved
  // intermediate milestones.
  const FEATURES = Object.freeze([
    Object.freeze({
      id: 'meadow-wildflowers',
      minXp: 100,
      stageId: 'growing-meadow',
      label: 'wildflowers appear'
    }),
    Object.freeze({
      id: 'meadow-path-accent',
      minXp: 250,
      stageId: 'growing-meadow',
      label: 'a meadow path and fence appear'
    }),
    Object.freeze({
      id: 'village-annex',
      minXp: 500,
      stageId: 'developed-village',
      label: 'a village annex appears'
    }),
    Object.freeze({
      id: 'village-garden',
      minXp: 900,
      stageId: 'developed-village',
      label: 'a garden grove appears'
    }),
    Object.freeze({
      id: 'thriving-canopy',
      minXp: 1400,
      stageId: 'thriving-village',
      label: 'the thriving canopy appears'
    })
  ]);

  // Fixed interior anchors. They deliberately avoid base objects, pond/path
  // tiles and the outer bounds so sceneBounds() is identical at every stage.
  const FEATURE_CONTENT = Object.freeze({
    'meadow-wildflowers': Object.freeze({
      tiles: Object.freeze([]),
      objects: Object.freeze([
        Object.freeze({ id: 'progression-wildflowers-a', kind: 'flowers', col: 6, row: 2, salt: 11 }),
        Object.freeze({ id: 'progression-wildflowers-b', kind: 'flowers', col: 8, row: 2, salt: 12 }),
        Object.freeze({ id: 'progression-meadow-bush', kind: 'bush', col: 5, row: 4, salt: 13 })
      ])
    }),
    'meadow-path-accent': Object.freeze({
      tiles: Object.freeze([
        Object.freeze({ col: 6, row: 6 }),
        Object.freeze({ col: 7, row: 4 })
      ]),
      objects: Object.freeze([
        Object.freeze({ id: 'progression-path-fence', kind: 'fence', col: 2, row: 8, salt: 14 }),
        Object.freeze({ id: 'progression-path-flowers', kind: 'flowers', col: 5, row: 7, salt: 15 })
      ])
    }),
    'village-annex': Object.freeze({
      tiles: Object.freeze([]),
      objects: Object.freeze([
        Object.freeze({ id: 'progression-annex-house', kind: 'house', col: 8, row: 1, salt: 16 }),
        Object.freeze({ id: 'progression-annex-fence-a', kind: 'fence', col: 9, row: 1, salt: 17 }),
        Object.freeze({ id: 'progression-annex-fence-b', kind: 'fence', col: 10, row: 1, salt: 18 }),
        Object.freeze({ id: 'progression-annex-flowers', kind: 'flowers', col: 7, row: 1, salt: 19 })
      ])
    }),
    'village-garden': Object.freeze({
      tiles: Object.freeze([Object.freeze({ col: 8, row: 7 })]),
      objects: Object.freeze([
        Object.freeze({ id: 'progression-grove-tree', kind: 'tree', col: 4, row: 3, salt: 20 }),
        Object.freeze({ id: 'progression-grove-bush', kind: 'bush', col: 5, row: 1, salt: 21 })
      ])
    }),
    'thriving-canopy': Object.freeze({
      tiles: Object.freeze([]),
      objects: Object.freeze([
        Object.freeze({ id: 'progression-canopy-tree', kind: 'tree', col: 5, row: 0, salt: 22 }),
        Object.freeze({ id: 'progression-canopy-house', kind: 'house', col: 9, row: 2, salt: 23 }),
        Object.freeze({ id: 'progression-canopy-flowers-a', kind: 'flowers', col: 10, row: 2, salt: 24 }),
        Object.freeze({ id: 'progression-canopy-flowers-b', kind: 'flowers', col: 9, row: 0, salt: 25 })
      ])
    })
  });

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value !== null && typeof value === 'object') {
      const clone = {};
      const keys = Object.keys(value);
      for (let index = 0; index < keys.length; index += 1) {
        clone[keys[index]] = cloneValue(value[keys[index]]);
      }
      return clone;
    }
    return value;
  }

  function cellKey(col, row) {
    return col + ',' + row;
  }

  function describeErrors(prefix, errors) {
    return prefix + errors.map((error) => error.path + ': ' + error.message).join('; ');
  }

  function composeProgressionMap(baseMap, rawXp) {
    const baseErrors = validation.validateMap(baseMap);
    if (baseErrors.length) throw new Error(describeErrors('Invalid base map: ', baseErrors));

    const xp = normalizeXp(rawXp);
    const map = cloneValue(baseMap);
    const usedIds = new Set(map.objects.map((object) => object.id));
    const usedCells = new Set(map.objects.map((object) => cellKey(object.col, object.row)));

    for (let featureIndex = 0; featureIndex < FEATURES.length; featureIndex += 1) {
      const feature = FEATURES[featureIndex];
      if (feature.minXp > xp) continue;

      const content = FEATURE_CONTENT[feature.id];
      for (let tileIndex = 0; tileIndex < content.tiles.length; tileIndex += 1) {
        const patch = content.tiles[tileIndex];
        const tile = map.tiles[patch.row] && map.tiles[patch.row][patch.col];
        if (!tile || tile.type !== 'grass' || usedCells.has(cellKey(patch.col, patch.row))) continue;
        tile.type = 'path';
        tile.variant = tiles.variantFor(
          patch.col,
          patch.row,
          TILE_PATCH_SALT,
          tiles.getTerrainDefinition('path').variants
        );
      }

      for (let objectIndex = 0; objectIndex < content.objects.length; objectIndex += 1) {
        const spec = content.objects[objectIndex];
        const key = cellKey(spec.col, spec.row);
        if (usedIds.has(spec.id) || usedCells.has(key)) continue;
        usedIds.add(spec.id);
        usedCells.add(key);
        map.objects.push({
          id: spec.id,
          kind: spec.kind,
          col: spec.col,
          row: spec.row,
          variant: tiles.variantFor(spec.col, spec.row, spec.salt, tiles.DEFAULT_VARIANTS),
          metadata: {
            source: 'progression',
            featureId: feature.id,
            minXp: feature.minXp
          }
        });
      }
    }

    const composedErrors = validation.validateMap(map);
    if (composedErrors.length) throw new Error(describeErrors('Invalid composed map: ', composedErrors));
    return map;
  }

  function createProgressionScene(baseMap, rawXp, options) {
    return sceneData.createScene(composeProgressionMap(baseMap, rawXp), options);
  }

  function normalizeXp(value) {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.floor(value);
  }

  function stageForXp(rawXp) {
    const xp = normalizeXp(rawXp);
    let current = STAGES[0];
    for (let index = 0; index < STAGES.length; index += 1) {
      if (xp >= STAGES[index].minXp) current = STAGES[index];
    }
    return current;
  }

  function featuresForXp(rawXp) {
    const xp = normalizeXp(rawXp);
    return Object.freeze(FEATURES.filter((feature) => feature.minXp <= xp));
  }

  function featureIdsForXp(rawXp) {
    return Object.freeze(featuresForXp(rawXp).map((feature) => feature.id));
  }

  function nextFeatureAfter(rawXp) {
    const xp = normalizeXp(rawXp);
    for (let index = 0; index < FEATURES.length; index += 1) {
      if (FEATURES[index].minXp > xp) return FEATURES[index];
    }
    return null;
  }

  function worldProgress(rawXp) {
    const xp = normalizeXp(rawXp);
    let index = 0;
    for (let candidate = 0; candidate < STAGES.length; candidate += 1) {
      if (xp >= STAGES[candidate].minXp) index = candidate;
    }

    const stage = STAGES[index];
    const next = STAGES[index + 1] || null;
    const unlockedFeatures = featureIdsForXp(xp);
    const nextUnlock = nextFeatureAfter(xp);

    if (!next) {
      return Object.freeze({
        xp,
        stage,
        stageIndex: index,
        earned: xp - stage.minXp,
        span: 0,
        remainingXp: 0,
        percent: 100,
        next,
        unlockedFeatures,
        nextUnlock
      });
    }

    const span = next.minXp - stage.minXp;
    const earned = Math.min(span, xp - stage.minXp);

    return Object.freeze({
      xp,
      stage,
      stageIndex: index,
      earned,
      span,
      remainingXp: next.minXp - xp,
      percent: Math.min(100, (earned / span) * 100),
      next,
      unlockedFeatures,
      nextUnlock
    });
  }

  return Object.freeze({
    STAGES,
    MILESTONES,
    FEATURES,
    FEATURE_CONTENT,
    normalizeXp,
    stageForXp,
    featuresForXp,
    featureIdsForXp,
    nextFeatureAfter,
    worldProgress,
    composeProgressionMap,
    createProgressionScene
  });
});
