const test = require('node:test');
const assert = require('node:assert/strict');
const camera = require('../src/world/camera.js');
const world = require('../src/world/index.js');
const controller = require('../src/world/controller.js');

const SETTINGS = { padding: 8, bottomReserve: 24, maxScale: 1.4 };
const SCENE_BOUNDS = {
  minX: -100,
  minY: -50,
  maxX: 100,
  maxY: 50,
  width: 200,
  height: 100
};

function near(actual, expected, tolerance, message) {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    (message || 'values should be close') + ': ' + actual + ' vs ' + expected
  );
  return true;
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeContext {
  constructor(log) {
    this.log = log;
    this.fillStyle = null;
    this.strokeStyle = null;
    this.lineWidth = 1;
  }

  record(name, args) {
    this.log.push([name].concat(args));
  }

  setTransform() { this.record('setTransform', [...arguments]); }
  clearRect() { this.record('clearRect', [...arguments]); }
  save() { this.record('save', []); }
  restore() { this.record('restore', []); }
  translate() { this.record('translate', [...arguments]); }
  scale() { this.record('scale', [...arguments]); }
  beginPath() { this.record('beginPath', []); }
  closePath() { this.record('closePath', []); }
  moveTo() { this.record('moveTo', [...arguments]); }
  lineTo() { this.record('lineTo', [...arguments]); }
  fill() { this.record('fill', []); }
  stroke() { this.record('stroke', []); }
  fillRect() { this.record('fillRect', [...arguments]); }
  ellipse() { this.record('ellipse', [...arguments]); }
  arc() { this.record('arc', [...arguments]); }
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createRadialGradient() {
    return { addColorStop() {} };
  }
}

class FakeCanvas {
  constructor(width, height) {
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.captured = new Set();
    this.rect = { left: 0, top: 0, width: width || 320, height: height || 180, right: width || 320, bottom: height || 180 };
    this.width = 0;
    this.height = 0;
    this.log = [];
    this.parentElement = null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    const index = handlers.indexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
    if (!handlers.length) this.listeners.delete(type);
  }

  dispatch(type, overrides) {
    const event = Object.assign({
      type,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      }
    }, overrides || {});
    for (const handler of (this.listeners.get(type) || []).slice()) {
      handler(event);
    }
    return event;
  }

  listenerCount(type) {
    return (this.listeners.get(type) || []).length;
  }

  getContext() {
    if (!this.ctx) this.ctx = new FakeContext(this.log);
    return this.ctx;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  setPointerCapture(id) {
    this.captured.add(id);
  }

  releasePointerCapture(id) {
    this.captured.delete(id);
  }

  hasPointerCapture(id) {
    return this.captured.has(id);
  }
}

function scene(bounds) {
  return {
    map: { width: 0, height: 0, tiles: [], objects: [] },
    origin: { x: 0, y: 0 },
    tile: { width: 48, height: 24 },
    bounds: bounds || SCENE_BOUNDS,
    commands: []
  };
}

function options(overrides) {
  return Object.assign({ scene: scene(), maxDpr: 1 }, SETTINGS, overrides || {});
}

test('controller initializes a valid viewport and camera before attaching input', () => {
  const canvas = new FakeCanvas();
  const handle = controller.createController(canvas, options());
  try {
    const info = handle.inspect();

    assert.ok(info.viewport);
    assert.equal(info.viewport.width, 320);
    assert.equal(info.viewport.height, 180);
    assert.ok(Number.isFinite(info.viewport.baseScale) && info.viewport.baseScale > 0);
    assert.ok(info.camera);
    assert.deepEqual(info.camera.limits, {
      minZoom: camera.DEFAULT_MIN_ZOOM,
      maxZoom: camera.DEFAULT_MAX_ZOOM,
      zoomStep: camera.DEFAULT_ZOOM_STEP
    });
    assert.deepEqual(Object.keys(info.view).sort(), ['scale', 'x', 'y']);
    assert.ok(canvas.listenerCount('pointerdown') > 0);
    assert.ok(canvas.listenerCount('wheel') > 0);
  } finally {
    handle.destroy();
  }
});

test('controller default view still matches computeView', () => {
  const canvas = new FakeCanvas();
  const handle = controller.createController(canvas, options());
  try {
    const info = handle.inspect();
    const expected = controller.computeView(SCENE_BOUNDS, 320, 180, SETTINGS);

    near(info.view.x, expected.x, 1e-9, 'view x');
    near(info.view.y, expected.y, 1e-9, 'view y');
    near(info.view.scale, expected.scale, 1e-9, 'view scale');
  } finally {
    handle.destroy();
  }
});

test('draw path preserves clear, backdrop and transformed world rendering', () => {
  const canvas = new FakeCanvas();
  const handle = controller.createController(canvas, options());
  try {
    handle.redraw();
    const info = handle.inspect();
    const log = canvas.log;

    assert.deepEqual(log[0], ['setTransform', 1, 0, 0, 1, 0, 0]);
    assert.deepEqual(log[1], ['clearRect', 0, 0, canvas.width, canvas.height]);
    assert.deepEqual(log[2], ['setTransform', 1, 0, 0, 1, 0, 0]);

    const worldTranslate = log.findIndex((entry) =>
      entry[0] === 'translate' &&
      Number.isFinite(entry[1]) && Number.isFinite(entry[2]) &&
      Math.abs(entry[1] - info.view.x) <= 1e-9 &&
      Math.abs(entry[2] - info.view.y) <= 1e-9
    );
    assert.ok(worldTranslate >= 0);
    const firstFillRect = log.findIndex((entry) => entry[0] === 'fillRect');
    assert.ok(firstFillRect >= 0 && firstFillRect < worldTranslate);

    const worldScale = log[worldTranslate + 1];
    assert.equal(worldScale[0], 'scale');
    near(worldScale[1], info.view.scale, 1e-9, 'world scale x');
    near(worldScale[2], info.view.scale, 1e-9, 'world scale y');
  } finally {
    handle.destroy();
  }
});

test('resize recomputes viewport and backing store without a new controller', () => {
  const canvas = new FakeCanvas(320, 180);
  const handle = controller.createController(canvas, options());
  try {
    canvas.rect.width = 640;
    canvas.rect.height = 360;
    canvas.rect.right = 640;
    canvas.rect.bottom = 360;
    handle.redraw();
    const info = handle.inspect();

    assert.equal(info.viewport.width, 640);
    assert.equal(info.viewport.height, 360);
    assert.equal(info.backingWidth, 640);
    assert.equal(info.backingHeight, 360);
  } finally {
    handle.destroy();
  }
});

test('input uses the current viewport even before the next animation frame', () => {
  const largeBounds = {
    minX: -1000,
    minY: -600,
    maxX: 1000,
    maxY: 600,
    width: 2000,
    height: 1200
  };
  const canvas = new FakeCanvas(320, 180);
  const handle = controller.createController(canvas, options({ scene: scene(largeBounds) }));
  try {
    canvas.rect.width = 640;
    canvas.rect.height = 360;
    canvas.rect.right = 640;
    canvas.rect.bottom = 360;

    canvas.dispatch('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: 200,
      clientY: 100
    });
    canvas.dispatch('pointermove', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 220,
      clientY: 110
    });

    const info = handle.inspect();
    assert.equal(info.viewport.width, 640);
    assert.equal(info.viewport.height, 360);
  } finally {
    handle.destroy();
  }
});

test('destroy removes input listeners and is idempotent', () => {
  const canvas = new FakeCanvas();
  const handle = controller.createController(canvas, options());

  assert.ok(canvas.listenerCount('pointerdown') > 0);
  assert.equal(handle.destroy(), true);
  assert.equal(handle.destroy(), false);
  assert.equal(canvas.listenerCount('pointerdown'), 0);
  assert.equal(canvas.listenerCount('wheel'), 0);
  assert.equal(canvas.classList.contains('is-panning'), false);
});

test('remounting destroys the previous listeners instead of duplicating them', () => {
  const canvas = new FakeCanvas();
  const first = world.mount(canvas, options());
  assert.ok(first);
  const afterFirst = canvas.listenerCount('pointerdown');
  assert.ok(afterFirst > 0);

  const second = world.mount(canvas, options());
  assert.ok(second);
  assert.notEqual(first, second);
  assert.equal(canvas.listenerCount('pointerdown'), afterFirst);
  assert.equal(canvas.listenerCount('wheel'), afterFirst ? canvas.listenerCount('wheel') : 0);
  assert.equal(first.destroy(), false);

  assert.equal(second.destroy(), true);
  assert.equal(canvas.listenerCount('pointerdown'), 0);
});

test('multiple render requests coalesce into a single animation frame', () => {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let scheduled = 0;
  globalThis.requestAnimationFrame = () => {
    scheduled += 1;
    return scheduled;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    const canvas = new FakeCanvas();
    const handle = controller.createController(canvas, options());
    const afterCreate = scheduled;

    const first = handle.requestRender();
    const second = handle.requestRender();

    assert.equal(first, second);
    assert.equal(scheduled, afterCreate);
    handle.destroy();
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
