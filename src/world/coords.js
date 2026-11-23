(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldCoords = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TILE_W = 48;
  const TILE_H = 24;
  const TILE_SIDE_DEPTH = 5;
  const EPSILON = 1e-9;
  const DEFAULT_TILE = { width: TILE_W, height: TILE_H };
  const DEFAULT_ORIGIN = { x: 0, y: 0 };

  // Extents are relative to a tile's screen anchor. They describe the full
  // drawn footprint so responsive fitting never clips tall objects.
  const OBJECT_EXTENTS = {
    tree: { left: -34, top: -84, right: 34, bottom: 5 },
    house: { left: -40, top: -64, right: 40, bottom: 14 },
    flowers: { left: -23, top: -24, right: 23, bottom: 5 },
    bush: { left: -25, top: -28, right: 25, bottom: 5 },
    reeds: { left: -21, top: -30, right: 21, bottom: 5 },
    fence: { left: -32, top: -24, right: 32, bottom: 7 }
  };

  function normalizeTile(tile) {
    const source = tile || DEFAULT_TILE;
    const width = Number.isFinite(source.width) ? source.width : TILE_W;
    const height = Number.isFinite(source.height) ? source.height : TILE_H;
    return { width, height };
  }

  function normalizeOrigin(origin) {
    const source = origin || DEFAULT_ORIGIN;
    return {
      x: Number.isFinite(source.x) ? source.x : 0,
      y: Number.isFinite(source.y) ? source.y : 0
    };
  }

  function gridToScreen(col, row, origin, tile) {
    const o = normalizeOrigin(origin);
    const t = normalizeTile(tile);
    return {
      x: o.x + (col - row) * (t.width / 2),
      y: o.y + (col + row) * (t.height / 2)
    };
  }

  function screenToGrid(x, y, origin, tile) {
    const o = normalizeOrigin(origin);
    const t = normalizeTile(tile);
    const dx = x - o.x;
    const dy = y - o.y;
    const a = dx / (t.width / 2);
    const b = dy / (t.height / 2);
    return { col: (a + b) / 2, row: (b - a) / 2 };
  }

  function diamondMetric(x, y, col, row, origin, tile) {
    const center = gridToScreen(col, row, origin, tile);
    const t = normalizeTile(tile);
    return Math.abs(x - center.x) / (t.width / 2) +
      Math.abs(y - center.y) / (t.height / 2);
  }

  function pointInTile(x, y, col, row, origin, tile) {
    return diamondMetric(x, y, col, row, origin, tile) <= 1 + EPSILON;
  }

  // Tile picking is deliberately not just Math.round() on the inverse.
  // A screen diamond is the image of a unit grid square and its edges are
  // shared by two tiles (corners by four). We compare every nearby tile by
  // diamond distance, then break ties toward the smaller col and row so the
  // result is stable and documented.
  function tileAt(x, y, origin, tile) {
    const point = screenToGrid(x, y, origin, tile);
    const baseCol = Math.floor(point.col);
    const baseRow = Math.floor(point.row);
    let best = null;

    for (let col = baseCol - 1; col <= baseCol + 2; col += 1) {
      for (let row = baseRow - 1; row <= baseRow + 2; row += 1) {
        const metric = diamondMetric(x, y, col, row, origin, tile);
        const tiesWithBest = best &&
          Math.abs(metric - best.metric) <= EPSILON &&
          (col < best.col || (col === best.col && row < best.row));

        if (!best || metric < best.metric - EPSILON || tiesWithBest) {
          best = { col, row, metric };
        }
      }
    }

    return { col: best.col, row: best.row };
  }

  function tileDiamond(cx, cy, tile) {
    const t = normalizeTile(tile);
    const hw = t.width / 2;
    const hh = t.height / 2;
    return [
      { x: cx, y: cy - hh },
      { x: cx + hw, y: cy },
      { x: cx, y: cy + hh },
      { x: cx - hw, y: cy }
    ];
  }

  function tileDiamondAt(col, row, origin, tile) {
    const center = gridToScreen(col, row, origin, tile);
    return tileDiamond(center.x, center.y, tile);
  }

  function normalizeExtent(extent) {
    if (!extent) return null;
    if (Number.isFinite(extent.left) && Number.isFinite(extent.top) &&
        Number.isFinite(extent.right) && Number.isFinite(extent.bottom)) {
      return extent;
    }
    if (Number.isFinite(extent.x) && Number.isFinite(extent.y) &&
        Number.isFinite(extent.width) && Number.isFinite(extent.height)) {
      return {
        left: extent.x,
        top: extent.y,
        right: extent.x + extent.width,
        bottom: extent.y + extent.height
      };
    }
    return null;
  }

  function sceneBounds(map, origin, tile) {
    const o = normalizeOrigin(origin);
    const t = normalizeTile(tile);
    const width = map && Number.isFinite(map.width) ? map.width : 0;
    const height = map && Number.isFinite(map.height) ? map.height : 0;
    const hw = t.width / 2;
    const hh = t.height / 2;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    function expand(left, top, right, bottom) {
      if (left < minX) minX = left;
      if (top < minY) minY = top;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }

    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const center = gridToScreen(col, row, o, t);
        expand(center.x - hw, center.y - hh, center.x + hw, center.y + hh + TILE_SIDE_DEPTH);
      }
    }

    const objects = (map && map.objects) || [];
    for (const object of objects) {
      const center = gridToScreen(object.col, object.row, o, t);
      const extent = normalizeExtent(object.extent || OBJECT_EXTENTS[object.kind]);
      if (!extent) continue;
      expand(
        center.x + extent.left,
        center.y + extent.top,
        center.x + extent.right,
        center.y + extent.bottom
      );
    }

    if (!Number.isFinite(minX)) {
      minX = o.x - hw;
      minY = o.y - hh;
      maxX = o.x + hw;
      maxY = o.y + hh + TILE_SIDE_DEPTH;
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  return {
    TILE_W,
    TILE_H,
    TILE_SIDE_DEPTH,
    DEFAULT_TILE,
    OBJECT_EXTENTS,
    normalizeTile,
    normalizeOrigin,
    gridToScreen,
    screenToGrid,
    diamondMetric,
    pointInTile,
    tileAt,
    tileDiamond,
    tileDiamondAt,
    sceneBounds
  };
});
