(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const coords = isNode ? require('./coords.js') : root.CQ.worldCoords;
  const api = factory(coords);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldScene = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (coords) {
  'use strict';

  const GROUND_PHASE = 0;
  const OBJECT_PHASE = 1;
  const OBJECT_DEPTH_OFFSET = 0.5;

  function compareText(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  // Terrain and objects share one painter's-order queue. An object is placed
  // half a depth step after its own tile, so the tile behind it is drawn first
  // and the next foreground tile can still occlude its base.
  function compareDrawCommands(a, b) {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.phase !== b.phase) return a.phase - b.phase;
    if (a.row !== b.row) return a.row - b.row;
    if (a.col !== b.col) return a.col - b.col;
    return compareText(String(a.id), String(b.id));
  }

  function buildDrawCommands(map, options) {
    const settings = options || {};
    const origin = coords.normalizeOrigin(settings.origin);
    const tile = coords.normalizeTile(settings.tile);
    const commands = [];

    for (let row = 0; row < map.height; row += 1) {
      for (let col = 0; col < map.width; col += 1) {
        const source = (map.tiles && map.tiles[row] && map.tiles[row][col]) || {};
        const center = coords.gridToScreen(col, row, origin, tile);
        commands.push({
          id: 'tile:' + col + ':' + row,
          layer: 'ground',
          command: 'tile',
          type: source.type || 'grass',
          variant: Number.isInteger(source.variant) ? source.variant : 0,
          col,
          row,
          x: center.x,
          y: center.y,
          diamond: coords.tileDiamond(center.x, center.y, tile),
          depth: col + row,
          phase: GROUND_PHASE
        });
      }
    }

    for (const object of map.objects || []) {
      const center = coords.gridToScreen(object.col, object.row, origin, tile);
      commands.push({
        id: 'object:' + object.id,
        layer: 'object',
        command: 'object',
        kind: object.kind,
        object,
        variant: Number.isInteger(object.variant) ? object.variant : 0,
        col: object.col,
        row: object.row,
        x: center.x,
        y: center.y,
        depth: object.col + object.row + OBJECT_DEPTH_OFFSET,
        phase: OBJECT_PHASE
      });
    }

    return commands.sort(compareDrawCommands);
  }

  function normalizePalette(palette) {
    if (!palette || typeof palette !== 'object' || Array.isArray(palette)) return null;
    const result = {};
    Object.keys(palette).forEach((key) => {
      const value = palette[key];
      result[key] = Array.isArray(value) ? value.slice() : value;
    });
    return result;
  }

  function createScene(map, options) {
    const settings = options || {};
    const origin = coords.normalizeOrigin(settings.origin);
    const tile = coords.normalizeTile(settings.tile);
    const palette = normalizePalette(settings.palette);
    const scene = {
      name: map.name || 'World',
      map,
      origin,
      tile,
      bounds: coords.sceneBounds(map, origin, tile),
      commands: buildDrawCommands(map, { origin, tile })
    };
    // Omitted palettes leave the scene shape identical to Phase 2.6.
    if (palette) scene.palette = palette;
    return scene;
  }

  return {
    GROUND_PHASE,
    OBJECT_PHASE,
    OBJECT_DEPTH_OFFSET,
    compareDrawCommands,
    buildDrawCommands,
    createScene
  };
});
