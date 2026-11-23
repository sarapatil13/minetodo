(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const camera = isNode ? require('./camera.js') : root.CQ.worldCamera;
  const coords = isNode ? require('./coords.js') : root.CQ.worldCoords;
  const api = factory(camera, coords);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldHitTest = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (camera, coords) {
  'use strict';

  // Values are CSS pixels. pick() converts them into scene units using the
  // active view scale, so tolerance behaves consistently while zooming.
  const MOUSE_TOLERANCE_CSS = 2;
  const TOUCH_TOLERANCE_CSS = 10;
  const EPSILON = 1e-9;

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function translate(points, x, y) {
    return points.map((point) => ({ x: x + point.x, y: y + point.y }));
  }

  function polygon(points, options) {
    return Object.freeze({
      type: 'polygon',
      points: Object.freeze(points.map((point) => Object.freeze({
        x: point.x,
        y: point.y
      }))),
      maxTolerance: (options && options.maxTolerance) || TOUCH_TOLERANCE_CSS
    });
  }

  function ellipse(cx, cy, rx, ry, options) {
    return Object.freeze({
      type: 'ellipse',
      cx,
      cy,
      rx,
      ry,
      maxTolerance: (options && options.maxTolerance) || TOUCH_TOLERANCE_CSS
    });
  }

  function pointInPolygon(point, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const a = points[i];
      const b = points[j];
      const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
        (point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function distanceToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= EPSILON) {
      return Math.hypot(point.x - a.x, point.y - a.y);
    }
    const raw = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    const t = Math.min(1, Math.max(0, raw));
    return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
  }

  function distanceToPolygon(point, points) {
    let distance = Infinity;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      distance = Math.min(distance, distanceToSegment(point, points[j], points[i]));
    }
    return distance;
  }

  function distanceToEllipse(point, shape) {
    const qx = Math.max(Math.abs(point.x - shape.cx) - shape.rx, 0);
    const qy = Math.max(Math.abs(point.y - shape.cy) - shape.ry, 0);
    return Math.hypot(qx, qy);
  }

  function shapeContains(shape, point, tolerance) {
    const allowed = Math.max(0, Math.min(tolerance, shape.maxTolerance));
    if (shape.type === 'ellipse') {
      const dx = (point.x - shape.cx) / shape.rx;
      const dy = (point.y - shape.cy) / shape.ry;
      if (dx * dx + dy * dy <= 1 + EPSILON) return true;
      return allowed > 0 && distanceToEllipse(point, shape) <= allowed + EPSILON;
    }

    if (pointInPolygon(point, shape.points)) return true;
    return allowed > 0 && distanceToPolygon(point, shape.points) <= allowed + EPSILON;
  }

  // Mirrors foliageShape() in renderer.js. The leaf silhouette is used as the
  // hit polygon instead of inventing a rectangle around it.
  function foliage(x, y, rx, ry, options) {
    return polygon(translate([
      { x: -rx, y: ry * 0.2 },
      { x: -rx * 0.85, y: -ry * 0.55 },
      { x: -rx * 0.35, y: -ry },
      { x: rx * 0.4, y: -ry * 0.9 },
      { x: rx * 0.9, y: -ry * 0.4 },
      { x: rx, y: ry * 0.25 },
      { x: rx * 0.6, y: ry * 0.8 },
      { x: -rx * 0.55, y: ry * 0.85 }
    ], x, y), options);
  }

  function treeShapes(x, y, command) {
    const lean = (((command && command.variant) || 0) % 3) - 1;
    return [
      ellipse(x + 2, y + 2, 22, 7),
      polygon(translate([
        { x: -5, y: 0 },
        { x: -7 + lean, y: -34 },
        { x: 4 + lean, y: -34 },
        { x: 7, y: 0 }
      ], x, y)),
      foliage(x - 14, y - 45 + lean, 18, 17),
      foliage(x + 13, y - 46 - lean, 18, 17),
      foliage(x + lean, y - 62, 23, 19),
      foliage(x - 2 + lean, y - 49, 25, 18)
    ];
  }

  function houseShapes(x, y) {
    return [
      ellipse(x + 2, y + 5, 35, 10, { maxTolerance: 4 }),
      polygon(translate([
        { x: -28, y: -14 }, { x: 2, y: -28 }, { x: 2, y: -3 }, { x: -28, y: 11 }
      ], x, y)),
      polygon(translate([
        { x: 2, y: -28 }, { x: 32, y: -15 }, { x: 32, y: 9 }, { x: 2, y: -3 }
      ], x, y)),
      polygon(translate([
        { x: -34, y: -38 }, { x: 2, y: -56 }, { x: 2, y: -40 }, { x: -34, y: -22 }
      ], x, y)),
      polygon(translate([
        { x: 2, y: -56 }, { x: 36, y: -40 }, { x: 36, y: -23 }, { x: 2, y: -40 }
      ], x, y)),
      polygon(translate([
        { x: 16, y: -55 }, { x: 24, y: -51 }, { x: 24, y: -38 }, { x: 16, y: -42 }
      ], x, y))
    ];
  }

  // drawFlower() paints five overlapping petals around each flower centre.
  // The petal extents are 3.2 + 2.4 horizontally and 3.2 + 1.92 vertically.
  function flowerShapes(x, y) {
    return [
      ellipse(x - 13, y - 4, 5.6, 5.12),
      ellipse(x, y - 15, 5.6, 5.12),
      ellipse(x + 12, y - 7, 5.6, 5.12),
      ellipse(x + 4, y + 2, 5.6, 5.12)
    ];
  }

  function bushShapes(x, y) {
    return [
      ellipse(x, y + 2, 19, 6, { maxTolerance: 4 }),
      foliage(x - 9, y - 9, 14, 12),
      foliage(x + 9, y - 10, 13, 12),
      foliage(x, y - 16, 15, 12)
    ];
  }

  function reedsShapes(x, y, command) {
    const variant = (command && command.variant) || 0;
    const shapes = [ellipse(x, y + 2, 17, 4, { maxTolerance: 4 })];
    [-11, -2, 8].forEach((dx, index) => {
      const top = y - 21 - ((variant + index) % 3) * 3;
      shapes.push(polygon(translate([
        { x: dx - 1.2, y: y + 1 },
        { x: dx - 2.2, y: y - 12 },
        { x: dx - 0.2, y: top },
        { x: dx + 2.2, y: top },
        { x: dx + 0.2, y: y - 12 },
        { x: dx + 1.2, y: y + 1 }
      ], x, y)));
      shapes.push(ellipse(x + dx + 1, top + 3, 2.2, 5));
    });
    return shapes;
  }

  // Fence posts and rails use a smaller touch allowance than soft foliage.
  // Otherwise a 10px pad would make the empty space beside a post selectable.
  const FENCE_TOLERANCE = { maxTolerance: 4 };

  function fenceShapes(x, y) {
    const shapes = [
      polygon(translate([
        { x: -24, y: -5 }, { x: 21, y: -16 }, { x: 23, y: -13 }, { x: -22, y: -2 }
      ], x, y), FENCE_TOLERANCE),
      polygon(translate([
        { x: -24, y: -12 }, { x: 21, y: -23 }, { x: 23, y: -20 }, { x: -22, y: -9 }
      ], x, y), FENCE_TOLERANCE)
    ];
    for (const dx of [-20, 0, 19]) {
      const postY = -dx * 0.25;
      shapes.push(polygon(translate([
        { x: dx - 3, y: postY - 14 },
        { x: dx + 3, y: postY - 16 },
        { x: dx + 3, y: postY + 3 },
        { x: dx - 3, y: postY + 5 }
      ], x, y), FENCE_TOLERANCE));
    }
    return shapes;
  }

  const HIT_SHAPES = Object.freeze({
    tree: Object.freeze({ anchor: Object.freeze({ x: 0, y: -45 }), build: treeShapes }),
    house: Object.freeze({ anchor: Object.freeze({ x: 0, y: -48 }), build: houseShapes }),
    flowers: Object.freeze({ anchor: Object.freeze({ x: 0, y: -15 }), build: flowerShapes }),
    bush: Object.freeze({ anchor: Object.freeze({ x: 0, y: -16 }), build: bushShapes }),
    reeds: Object.freeze({ anchor: Object.freeze({ x: -11, y: -12 }), build: reedsShapes }),
    fence: Object.freeze({ anchor: Object.freeze({ x: 0, y: -8 }), build: fenceShapes })
  });

  function terrainShapes(target) {
    const shapes = [];
    for (const tile of target.tiles || []) {
      if (!Array.isArray(tile.diamond) || tile.diamond.length < 3) continue;
      shapes.push(polygon(tile.diamond));

      const halfWidth = (Math.max.apply(null, tile.diamond.map((point) => point.x)) -
        Math.min.apply(null, tile.diamond.map((point) => point.x))) / 2;
      const halfHeight = (Math.max.apply(null, tile.diamond.map((point) => point.y)) -
        Math.min.apply(null, tile.diamond.map((point) => point.y))) / 2;
      const depth = coords.TILE_SIDE_DEPTH;
      shapes.push(polygon([
        { x: tile.x - halfWidth, y: tile.y },
        { x: tile.x, y: tile.y + halfHeight },
        { x: tile.x, y: tile.y + halfHeight + depth },
        { x: tile.x - halfWidth, y: tile.y + depth }
      ], { maxTolerance: 4 }));
      shapes.push(polygon([
        { x: tile.x, y: tile.y + halfHeight },
        { x: tile.x + halfWidth, y: tile.y },
        { x: tile.x + halfWidth, y: tile.y + depth },
        { x: tile.x, y: tile.y + halfHeight + depth }
      ], { maxTolerance: 4 }));
    }
    return shapes;
  }

  function shapesForTarget(target) {
    if (!isRecord(target)) return Object.freeze([]);
    if (target.category === 'terrain') return terrainShapes(target);

    const definition = HIT_SHAPES[target.kind];
    if (!definition) return Object.freeze([]);
    const command = isRecord(target.command) ? target.command : { variant: target.variant };
    const x = Number.isFinite(command.x) ? command.x : (target.focusPoint && target.focusPoint.x) || 0;
    const y = Number.isFinite(command.y) ? command.y : (target.focusPoint && target.focusPoint.y) || 0;
    return Object.freeze(definition.build(x, y, command));
  }

  function candidatesFor(targets, point, tolerance) {
    const candidates = [];

    for (const target of targets || []) {
      if (!isRecord(target)) continue;
      const shapes = shapesForTarget(target);
      if (!shapes.some((shape) => shapeContains(shape, point, tolerance))) continue;

      if (target.category === 'terrain') {
        for (const tile of target.tiles || []) {
          const tileShapes = terrainShapes({
            tiles: [tile],
            commandIds: target.commandIds,
            order: target.order,
            id: target.id
          });
          if (tileShapes.some((shape) => shapeContains(shape, point, tolerance))) {
            candidates.push({
              target,
              tile,
              order: Number.isFinite(tile.commandIndex) ? tile.commandIndex : target.order,
              id: target.id
            });
          }
        }
      } else {
        candidates.push({
          target,
          tile: null,
          order: Number.isFinite(target.order) ? target.order : 0,
          id: target.id
        });
      }
    }

    return candidates;
  }

  // Higher commandIndexes are painted later and therefore win. The id and
  // tile coordinate tie-breakers make edge/corner overlaps deterministic.
  function compareCandidates(a, b) {
    if (a.order !== b.order) return b.order - a.order;
    const idCompare = a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    if (idCompare !== 0) return idCompare;
    const aKey = a.tile ? a.tile.col + ',' + a.tile.row : '';
    const bKey = b.tile ? b.tile.col + ',' + b.tile.row : '';
    return aKey < bKey ? -1 : (aKey > bKey ? 1 : 0);
  }

  function pickAtScenePoint(point, targets, options) {
    if (!isRecord(point) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    const settings = options || {};
    const tolerance = Number.isFinite(settings.tolerance) ? Math.max(0, settings.tolerance) : 0;
    const candidates = candidatesFor(targets, point, tolerance);
    if (candidates.length === 0) return null;
    candidates.sort(compareCandidates);
    return candidates[0].target;
  }

  function viewScale(context) {
    const settings = isRecord(context) ? context : {};
    const viewport = isRecord(settings.viewport) ? settings.viewport : {};
    const state = isRecord(settings.camera) ? settings.camera : {};
    const baseScale = Number.isFinite(viewport.baseScale) && viewport.baseScale > 0
      ? viewport.baseScale
      : 1;
    const zoom = Number.isFinite(state.zoom) && state.zoom > 0 ? state.zoom : 1;
    return Math.max(EPSILON, baseScale * zoom);
  }

  function pick(screenPoint, context, pointerType) {
    const settings = isRecord(context) ? context : {};
    const scale = viewScale(settings);
    const cssTolerance = pointerType === 'touch' ? TOUCH_TOLERANCE_CSS : MOUSE_TOLERANCE_CSS;
    const tolerance = Number.isFinite(settings.toleranceCss)
      ? settings.toleranceCss
      : cssTolerance;
    const scenePoint = camera.screenToScene(screenPoint, settings.viewport, settings.camera);
    return pickAtScenePoint(scenePoint, settings.targets, { tolerance: tolerance / scale });
  }

  function anchorForTarget(target) {
    if (!isRecord(target)) return null;
    if (target.category === 'terrain') {
      const tile = (target.tiles || [])[0];
      return tile ? { x: tile.x, y: tile.y } : null;
    }

    const definition = HIT_SHAPES[target.kind];
    if (!definition) return null;
    const x = target.command && Number.isFinite(target.command.x)
      ? target.command.x
      : (target.focusPoint && target.focusPoint.x) || 0;
    const y = target.command && Number.isFinite(target.command.y)
      ? target.command.y
      : (target.focusPoint && target.focusPoint.y) || 0;
    return { x: x + definition.anchor.x, y: y + definition.anchor.y };
  }

  return {
    MOUSE_TOLERANCE_CSS,
    TOUCH_TOLERANCE_CSS,
    HIT_SHAPES,
    pick,
    pickAtScenePoint,
    anchorForTarget,
    shapesForTarget
  };
});
