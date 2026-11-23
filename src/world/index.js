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
  const mapData = isNode ? require('./map.js') : root.CQ.worldMap;
  const renderer = isNode ? require('./renderer.js') : root.CQ.worldRenderer;
  const sceneData = isNode ? require('./scene.js') : root.CQ.worldScene;
  const controller = isNode ? require('./controller.js') : root.CQ.worldController;

  function mount(canvas, options) {
    if (!canvas) return null;
    const settings = options || {};
    const previous = canvas.__cozyQuestWorldHandle;
    if (previous && typeof previous.destroy === 'function') previous.destroy();

    const scene = settings.scene || sceneData.createScene(
      settings.map || mapData.createSampleMeadow(),
      { origin: settings.origin, tile: settings.tile }
    );
    const controllerOptions = Object.assign({}, settings, { scene });
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
    map: mapData,
    renderer,
    scene: sceneData,
    controller,
    mount,
    createSampleMeadow: mapData.createSampleMeadow,
    worldBounds: coords.sceneBounds
  };
});
