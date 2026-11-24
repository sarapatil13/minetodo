(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).progressionConfig = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Exact values already shipped by app.js levelInfo(). Phase 2.5 reads the
  // same ladder instead of introducing a second progression table.
  const LEVELS = Object.freeze([
    Object.freeze(['Seedling', 0]),
    Object.freeze(['Sprout', 100]),
    Object.freeze(['Sapling', 250]),
    Object.freeze(['Bloom', 500]),
    Object.freeze(['Grove Keeper', 900]),
    Object.freeze(['Forest Guardian', 1400])
  ]);

  const WORLD_STAGES = Object.freeze([
    Object.freeze({ id: 'starting-meadow', name: 'Starting Meadow', minXp: 0 }),
    Object.freeze({ id: 'growing-meadow', name: 'Growing Meadow', minXp: 100 }),
    Object.freeze({ id: 'developed-village', name: 'Developed Village', minXp: 500 }),
    Object.freeze({ id: 'thriving-village', name: 'Thriving Village', minXp: 1400 })
  ]);

  const WORLD_MILESTONES = Object.freeze([
    Object.freeze({ id: 'growing-meadow-accent', minXp: 250 }),
    Object.freeze({ id: 'developed-village-accent', minXp: 900 })
  ]);

  return Object.freeze({
    LEVELS,
    WORLD_STAGES,
    WORLD_MILESTONES
  });
});
