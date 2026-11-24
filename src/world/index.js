(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    const cq = (root.CQ = root.CQ || {});
    const world = (cq.world = cq.world || {});
    Object.keys(api).forEach((key) => {
      world[key] = api[key];
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const isNode = typeof module === 'object' && module.exports;
  const coords = isNode ? require('./coords.js') : root.CQ.worldCoords;
  const tiles = isNode ? require('./tiles.js') : root.CQ.worldTiles;
  const mapData = isNode ? require('./map.js') : root.CQ.worldMap;
  const validation = isNode ? require('./mapValidation.js') : root.CQ.worldMapValidation;
  const grid = isNode ? require('./grid.js') : root.CQ.worldGrid;
  const renderer = isNode ? require('./renderer.js') : root.CQ.worldRenderer;
  const sceneData = isNode ? require('./scene.js') : root.CQ.worldScene;
  const camera = isNode ? require('./camera.js') : root.CQ.worldCamera;
  const hitTest = isNode ? require('./hitTest.js') : root.CQ.worldHitTest;
  const selectableTargets = isNode
    ? require('./selectableTargets.js')
    : root.CQ.worldSelectableTargets;
  const interactionState = isNode
    ? require('./interactionState.js')
    : root.CQ.worldInteractionState;
  const infoPanel = isNode ? require('./infoPanel.js') : root.CQ.worldInfoPanel;
  const interaction = isNode ? require('./interaction.js') : root.CQ.worldInteraction;
  const progression = isNode ? require('./progression.js') : root.CQ.worldProgression;
  const contentCatalog = isNode ? require('./contentCatalog.js') : root.CQ.worldContentCatalog;
  const unlocks = isNode ? require('./unlocks.js') : root.CQ.worldUnlocks;
  const biomeCatalog = isNode ? require('./biomeCatalog.js') : root.CQ.worldBiomeCatalog;
  const content = isNode ? require('./content.js') : root.CQ.worldContent;
  const progressionConfig = isNode
    ? require('../progressionConfig.js')
    : root.CQ.progressionConfig;
  const controller = isNode ? require('./controller.js') : root.CQ.worldController;

  function mount(canvas, options) {
    if (!canvas) return null;
    const settings = options || {};
    const previous = canvas.__cozyQuestWorldHandle;
    if (previous && typeof previous.destroy === 'function') previous.destroy();

    const baseMap = settings.map || mapData.createSampleMeadow();
    const xp = progression.normalizeXp(settings.xp);
    // Zero XP keeps the exact Phase 2.1 meadow; later stages compose from the
    // same immutable base map without mutating it.
    const scene = settings.scene || (xp > 0
      ? progression.createProgressionScene(baseMap, xp, { origin: settings.origin, tile: settings.tile })
      : sceneData.createScene(baseMap, { origin: settings.origin, tile: settings.tile }));
    const controllerOptions = Object.assign({}, settings, { scene, xp });
    const handle = controller.createController(canvas, controllerOptions);
    if (!handle) return null;

    canvas.__cozyQuestWorldHandle = handle;
    const destroy = handle.destroy;
    handle.destroy = function () {
      const result = destroy();
      if (canvas.__cozyQuestWorldHandle === handle) {
        delete canvas.__cozyQuestWorldHandle;
      }
      return result;
    };

    return handle;
  }

  return {
    coords,
    tiles,
    grid,
    map: mapData,
    renderer,
    scene: sceneData,
    camera,
    hitTest,
    selectableTargets,
    interactionState,
    infoPanel,
    interaction,
    progression,
    contentCatalog,
    unlocks,
    biomeCatalog,
    content,
    progressionConfig,
    controller,
    mount,
    createSampleMeadow: mapData.createSampleMeadow,
    worldBounds: coords.sceneBounds,
    validateMap: validation.validateMap,
    assertValidMap: validation.assertValidMap,
    WorldMapError: validation.WorldMapError
  };
});
