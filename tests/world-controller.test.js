const test = require('node:test');
const assert = require('node:assert/strict');
const mapData = require('../src/world/map.js');
const sceneData = require('../src/world/scene.js');
const controller = require('../src/world/controller.js');

test('computeCanvasMetrics applies DPR and clamps the backing store', () => {
  assert.deepEqual(controller.computeCanvasMetrics(320, 180, 1), { dpr: 1, width: 320, height: 180 });
  assert.deepEqual(controller.computeCanvasMetrics(320, 180, 1.5), { dpr: 1.5, width: 480, height: 270 });
  assert.deepEqual(controller.computeCanvasMetrics(320, 180, 2), { dpr: 2, width: 640, height: 360 });
  assert.deepEqual(controller.computeCanvasMetrics(320, 180, 4, 3), { dpr: 3, width: 960, height: 540 });
  assert.deepEqual(controller.computeCanvasMetrics(0, -4, 2), { dpr: 2, width: 2, height: 2 });
});

test('computeView fits scene bounds and reserves space for the caption', () => {
  const bounds = { minX: -100, minY: -50, maxX: 100, maxY: 50, width: 200, height: 100 };
  const view = controller.computeView(bounds, 320, 180, { padding: 8, bottomReserve: 20 });

  assert.deepEqual(view, { scale: 1.4, x: 160, y: 80 });
  assert.ok(view.x + bounds.minX * view.scale >= 8);
  assert.ok(view.x + bounds.maxX * view.scale <= 312);
  assert.ok(view.y + bounds.minY * view.scale >= 8);
  assert.ok(view.y + bounds.maxY * view.scale <= 160);
});

test('the sample world fits inside a 390 by 190 mobile viewport', () => {
  const world = sceneData.createScene(mapData.createSampleMeadow());
  const width = 390;
  const height = 190;
  const settings = { padding: 8, bottomReserve: 24 };
  const view = controller.computeView(world.bounds, width, height, settings);

  assert.ok(view.x + world.bounds.minX * view.scale >= settings.padding - 1e-9);
  assert.ok(view.x + world.bounds.maxX * view.scale <= width - settings.padding + 1e-9);
  assert.ok(view.y + world.bounds.minY * view.scale >= settings.padding - 1e-9);
  assert.ok(view.y + world.bounds.maxY * view.scale <= height - settings.bottomReserve + 1e-9);
});

function createContext() {
  const transforms = [];
  const noop = () => {};
  const gradient = { addColorStop: noop };
  return {
    transforms,
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    setTransform: (...args) => transforms.push(args),
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    fill: noop,
    stroke: noop,
    fillRect: noop,
    clearRect: noop,
    ellipse: noop,
    arc: noop,
    translate: noop,
    scale: noop,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient
  };
}

test('createController sizes the backing store and can be destroyed', () => {
  const previousDpr = globalThis.devicePixelRatio;
  globalThis.devicePixelRatio = 2;
  const ctx = createContext();
  const canvas = {
    width: 0,
    height: 0,
    parentElement: null,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 320, height: 180 })
  };

  let handle;
  try {
    handle = controller.createController(canvas, { maxDpr: 3 });
    handle.redraw();
    assert.equal(canvas.width, 640);
    assert.equal(canvas.height, 360);
    assert.deepEqual(ctx.transforms[1], [2, 0, 0, 2, 0, 0]);
    assert.equal(handle.inspect().dpr, 2);
    assert.equal(handle.inspect().backingWidth, 640);
  } finally {
    if (handle) handle.destroy();
    if (previousDpr === undefined) delete globalThis.devicePixelRatio;
    else globalThis.devicePixelRatio = previousDpr;
  }

  assert.equal(handle.destroy(), false);
});
