const test = require('node:test');
const assert = require('node:assert/strict');
const coords = require('../src/world/coords.js');
const mapData = require('../src/world/map.js');
const sceneData = require('../src/world/scene.js');
const controller = require('../src/world/controller.js');
const camera = require('../src/world/camera.js');

const SETTINGS = { padding: 8, bottomReserve: 24, maxScale: 1.4 };
const BOUNDS = {
  minX: -100,
  minY: -50,
  maxX: 100,
  maxY: 50,
  width: 200,
  height: 100
};

function near(actual, expected, tolerance, message) {
  assert.ok(
    Number.isFinite(actual) && Number.isFinite(expected) &&
      Math.abs(actual - expected) <= tolerance,
    (message || 'values should be close') + ': ' + actual + ' vs ' + expected
  );
}

function viewportFor(width, height, bounds, baseScale) {
  const scale = Number.isFinite(baseScale)
    ? baseScale
    : controller.computeView(bounds, width, height, SETTINGS).scale;
  return camera.createViewport({ width, height }, scale, SETTINGS);
}

function state(focusX, focusY, zoom, limits) {
  return camera.normalizeCamera(
    { focusX, focusY, zoom, limits: limits || camera.createCamera(BOUNDS).limits },
    null,
    null
  );
}

test('default camera uses the scene center and shared default zoom limits', () => {
  const initial = camera.createCamera(BOUNDS);

  assert.equal(initial.focusX, 0);
  assert.equal(initial.focusY, 0);
  assert.equal(initial.zoom, 1);
  assert.deepEqual(initial.limits, {
    minZoom: camera.DEFAULT_MIN_ZOOM,
    maxZoom: camera.DEFAULT_MAX_ZOOM,
    zoomStep: camera.DEFAULT_ZOOM_STEP
  });
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(Object.isFrozen(initial.limits), true);
});

test('zoom limits are normalized once and preserved by clone, reset and normalize', () => {
  const initial = camera.createCamera(BOUNDS, {
    minZoom: 0.5,
    maxZoom: 2,
    zoomStep: 1.25
  });
  const cloned = camera.cloneCamera(initial);
  const normalized = camera.normalizeCamera(
    { focusX: 10, focusY: 5, zoom: 99, limits: initial.limits },
    BOUNDS,
    viewportFor(320, 180, BOUNDS)
  );
  const reset = camera.resetCamera(normalized, BOUNDS);

  assert.deepEqual(initial.limits, { minZoom: 0.5, maxZoom: 2, zoomStep: 1.25 });
  assert.deepEqual(cloned.limits, initial.limits);
  assert.deepEqual(normalized.limits, initial.limits);
  assert.deepEqual(reset.limits, initial.limits);
  assert.equal(normalized.zoom, 2);
  assert.equal(reset.zoom, 1);
  assert.equal(reset.focusX, 0);
  assert.equal(reset.focusY, 0);
});

test('invalid or reversed zoom limits fall back safely', () => {
  const reversed = camera.createCamera(BOUNDS, { minZoom: 3, maxZoom: 0.5 });
  const invalid = camera.createCamera(BOUNDS, {
    minZoom: Number.NaN,
    maxZoom: 0,
    zoomStep: -2
  });

  assert.equal(reversed.limits.minZoom, camera.DEFAULT_MIN_ZOOM);
  assert.equal(reversed.limits.maxZoom, camera.DEFAULT_MAX_ZOOM);
  assert.deepEqual(invalid.limits, {
    minZoom: camera.DEFAULT_MIN_ZOOM,
    maxZoom: camera.DEFAULT_MAX_ZOOM,
    zoomStep: camera.DEFAULT_ZOOM_STEP
  });

  const highMin = camera.createCamera(BOUNDS, { minZoom: 1.5, maxZoom: 4 });
  assert.equal(highMin.zoom, 1.5);
});

test('default camera transform exactly matches the existing computeView transform', () => {
  const sizes = [
    [1280, 242],
    [820, 220],
    [390, 190],
    [320, 180],
    [1, 1]
  ];

  for (const [width, height] of sizes) {
    const expected = controller.computeView(BOUNDS, width, height, SETTINGS);
    const viewport = viewportFor(width, height, BOUNDS);
    const view = camera.viewTransform(viewport, camera.createCamera(BOUNDS));

    near(view.x, expected.x, 1e-9, width + 'x' + height + ' x');
    near(view.y, expected.y, 1e-9, width + 'x' + height + ' y');
    near(view.scale, expected.scale, 1e-9, width + 'x' + height + ' scale');
    assert.deepEqual(Object.keys(view).sort(), ['scale', 'x', 'y']);
  }
});

test('scene and screen conversions round trip at several zooms', () => {
  const viewport = viewportFor(640, 360, BOUNDS, 0.75);
  const points = [
    { x: 0, y: 0 },
    { x: -123.25, y: 45.5 },
    { x: 17.125, y: -91.75 },
    { x: 999.5, y: 321.25 }
  ];

  for (const zoom of [0.6, 1, 1.4, 3]) {
    const cam = state(12.5, -7.25, zoom);
    for (const point of points) {
      const screen = camera.sceneToScreen(point, viewport, cam);
      const back = camera.screenToScene(screen, viewport, cam);
      near(back.x, point.x, 1e-6, 'scene x at zoom ' + zoom);
      near(back.y, point.y, 1e-6, 'scene y at zoom ' + zoom);
    }
  }
});

test('grid wrappers preserve isometric projection and tile picking', () => {
  const scene = sceneData.createScene(mapData.createSampleMeadow(), {
    origin: { x: 130, y: 40 }
  });
  const viewport = viewportFor(640, 360, scene.bounds, 0.8);
  const cam = camera.createCamera(scene.bounds);
  const sceneOptions = { origin: scene.origin, tile: scene.tile };

  for (const [col, row] of [[0, 0], [3, 2], [10, 8], [-2, 5]]) {
    const screen = camera.gridToScreen(col, row, viewport, cam, sceneOptions);
    const grid = camera.screenToGrid(screen.x, screen.y, viewport, cam, sceneOptions);
    near(grid.col, col, 1e-6, 'grid col');
    near(grid.row, row, 1e-6, 'grid row');
  }

  const center = coords.gridToScreen(3, 2, scene.origin, scene.tile);
  const screen = camera.sceneToScreen(center, viewport, cam);
  assert.deepEqual(
    camera.screenToTile(screen.x, screen.y, viewport, cam, sceneOptions),
    { col: 3, row: 2 }
  );
});

test('zoom stops at the configured minimum and maximum limits', () => {
  const viewport = viewportFor(320, 180, BOUNDS, 1);
  const anchor = { x: 160, y: 90 };
  let cam = camera.createCamera(BOUNDS, { minZoom: 0.5, maxZoom: 2 });

  for (let index = 0; index < 30; index += 1) {
    cam = camera.zoomCamera(cam, 1.2, anchor, viewport, BOUNDS);
  }
  assert.equal(cam.zoom, 2);

  for (let index = 0; index < 30; index += 1) {
    cam = camera.zoomCamera(cam, 0.8, anchor, viewport, BOUNDS);
  }
  assert.equal(cam.zoom, 0.5);
});

test('unconstrained pointer-centred zoom keeps the anchored scene point fixed', () => {
  const viewport = viewportFor(640, 360, BOUNDS, 0.8);
  const anchor = { x: 173.5, y: 241.25 };
  const before = state(12.5, -7.25, 1);
  const anchorScene = camera.screenToScene(anchor, viewport, before);
  const after = camera.zoomCamera(before, 1.2, anchor, viewport, null);

  assert.ok(after.zoom > before.zoom);
  const afterScene = camera.screenToScene(anchor, viewport, after);
  near(afterScene.x, anchorScene.x, 1e-6, 'anchor scene x');
  near(afterScene.y, anchorScene.y, 1e-6, 'anchor scene y');
});

test('constrained zoom respects world boundaries even when the anchor would move', () => {
  const bounds = {
    minX: -1000,
    minY: -600,
    maxX: 1000,
    maxY: 600,
    width: 2000,
    height: 1200
  };
  const viewport = viewportFor(320, 180, bounds, 1);
  let cam = camera.createCamera(bounds);
  cam = camera.panCamera(cam, { x: -800, y: -400 }, viewport, bounds);
  const beforeFocusX = cam.focusX;

  cam = camera.zoomCamera(cam, 1.18, { x: 300, y: 150 }, viewport, bounds);
  const maxAllowed = camera.clampCamera(
    { focusX: 1e9, focusY: cam.focusY, zoom: cam.zoom, limits: cam.limits },
    bounds,
    viewport
  ).focusX;

  assert.ok(beforeFocusX > 0);
  assert.ok(cam.focusX <= maxAllowed + 1e-6);
  assert.ok(cam.zoom > 1);
});

test('zooming at a world edge keeps the transformed edge within the viewport', () => {
  const bounds = {
    minX: -500,
    minY: -300,
    maxX: 500,
    maxY: 300,
    width: 1000,
    height: 600
  };
  const viewport = viewportFor(320, 180, bounds, 1);
  const settings = { padding: 8, bottomReserve: 24 };
  const atEdge = camera.clampCamera(
    { focusX: 1e9, focusY: 0, zoom: 1, limits: camera.createCamera(bounds).limits },
    bounds,
    viewport
  );
  const zoomed = camera.zoomCamera(atEdge, 1.18, { x: 316, y: 90 }, viewport, bounds);
  const view = camera.viewTransform(viewport, zoomed);
  const maxScreenX = view.x + bounds.maxX * view.scale;

  near(maxScreenX, settings.padding + Math.min(64, viewport.contentWidth * 0.25), 1e-6, 'right edge overlap');
});

test('small-world zoom stays centered instead of preserving a pointer anchor', () => {
  const bounds = {
    minX: -10,
    minY: -5,
    maxX: 10,
    maxY: 5,
    width: 20,
    height: 10
  };
  const viewport = viewportFor(320, 180, bounds, 1);
  const cam = camera.createCamera(bounds);

  for (const zoom of [1.18, 1.4, 3, 0.5]) {
    const next = camera.zoomCamera(cam, zoom, { x: 20, y: 20 }, viewport, bounds);
    assert.equal(next.focusX, 0);
    assert.equal(next.focusY, 0);
  }
});

test('panning is immutable and uses CSS deltas at the current effective scale', () => {
  const bounds = {
    minX: -1000,
    minY: -600,
    maxX: 1000,
    maxY: 600,
    width: 2000,
    height: 1200
  };
  const viewport = viewportFor(320, 180, bounds, 1.2);
  const before = camera.createCamera(bounds);
  const after = camera.panCamera(before, { x: 20, y: -10 }, viewport, bounds);

  assert.notEqual(after, before);
  assert.equal(before.focusX, 0);
  assert.equal(before.focusY, 0);
  near(after.focusX, -20 / (1.2 * before.zoom), 1e-9, 'pan focus x');
  near(after.focusY, 10 / (1.2 * before.zoom), 1e-9, 'pan focus y');
});

test('viewport constraints center small axes and clamp large axes independently', () => {
  const bounds = {
    minX: -10,
    maxX: 10,
    minY: -600,
    maxY: 600,
    width: 20,
    height: 1200
  };
  const viewport = viewportFor(320, 180, bounds, 1);
  const cam = camera.clampCamera(
    { focusX: 1e9, focusY: -1e9, zoom: 1, limits: camera.createCamera(bounds).limits },
    bounds,
    viewport
  );

  assert.equal(cam.focusX, 0);
  assert.ok(cam.focusY < 0);
  assert.ok(cam.focusY >= -700);
});

test('custom zoom limits survive pan, zoom, clamp, normalize and reset', () => {
  const limits = { minZoom: 0.8, maxZoom: 1.8, zoomStep: 1.2 };
  const viewport = viewportFor(320, 180, BOUNDS, 1);
  let cam = camera.createCamera(BOUNDS, limits);

  cam = camera.panCamera(cam, { x: 10, y: 10 }, viewport, BOUNDS);
  assert.deepEqual(cam.limits, limits);

  for (let index = 0; index < 20; index += 1) {
    cam = camera.zoomCamera(cam, 1.18, { x: 160, y: 90 }, viewport, BOUNDS);
  }
  assert.equal(cam.zoom, 1.8);
  assert.deepEqual(cam.limits, limits);

  for (let index = 0; index < 20; index += 1) {
    cam = camera.zoomCamera(cam, 0.85, { x: 160, y: 90 }, viewport, BOUNDS);
  }
  assert.equal(cam.zoom, 0.8);
  assert.deepEqual(cam.limits, limits);

  cam = camera.clampCamera(cam, BOUNDS, viewport);
  cam = camera.normalizeCamera(
    { focusX: Number.NaN, focusY: Number.NaN, zoom: 99, limits: cam.limits },
    BOUNDS,
    viewport
  );
  assert.equal(cam.zoom, 1.8);
  assert.deepEqual(cam.limits, limits);

  cam = camera.resetCamera(cam, BOUNDS);
  assert.equal(cam.zoom, 1);
  assert.deepEqual(cam.limits, limits);
});

test('invalid inputs are normalized to finite camera values', () => {
  const viewport = camera.createViewport({ width: 0, height: -5 }, Number.NaN, null);
  const initial = camera.createCamera(null);

  assert.ok(Number.isFinite(viewport.width) && viewport.width > 0);
  assert.ok(Number.isFinite(viewport.height) && viewport.height > 0);
  assert.ok(Number.isFinite(viewport.baseScale) && viewport.baseScale > 0);
  assert.ok(Number.isFinite(initial.focusX) && Number.isFinite(initial.focusY));

  const normalized = camera.normalizeCamera(null, null, viewport);
  const panned = camera.panCamera(null, { x: Number.NaN, y: Infinity }, viewport, null);
  const zoomed = camera.zoomCamera(null, Number.NaN, null, viewport, null);
  const scene = camera.screenToScene({ x: Number.NaN, y: Infinity }, viewport, normalized);

  assert.ok(Number.isFinite(normalized.zoom));
  assert.ok(Number.isFinite(panned.focusX) && Number.isFinite(panned.focusY));
  assert.ok(Number.isFinite(zoomed.zoom));
  assert.ok(Number.isFinite(scene.x) && Number.isFinite(scene.y));
});
