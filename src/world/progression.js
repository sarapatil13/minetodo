(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const config = isNode
    ? require('../progressionConfig.js')
    : root.CQ.progressionConfig;
  const api = factory(config);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldProgression = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config) {
  'use strict';

  const STAGES = config.WORLD_STAGES;
  const MILESTONES = config.WORLD_MILESTONES;

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
    normalizeXp,
    stageForXp,
    featuresForXp,
    featureIdsForXp,
    nextFeatureAfter,
    worldProgress
  });
});
