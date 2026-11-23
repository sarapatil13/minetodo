const test = require('node:test');
const assert = require('node:assert/strict');
const camera = require('../src/world/camera.js');
const cameraInput = require('../src/world/cameraInput.js');

const SETTINGS = { padding: 8, bottomReserve: 24 };
const BOUNDS = {
  minX: -10000,
  minY: -6000,
  maxX: 10000,
  maxY: 6000,
  width: 20000,
  height: 12000
};

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

class FakeCanvas {
  constructor() {
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.captured = new Set();
    this.rect = { left: 10, top: 20, width: 320, height: 180 };
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

  listenerCount(type) {
    return (this.listeners.get(type) || []).length;
  }
}

function setup(options) {
  const canvas = new FakeCanvas();
  const viewport = camera.createViewport({ width: 320, height: 180 }, 1, SETTINGS);
  let cam = camera.createCamera(BOUNDS);
  const renderCalls = { render: 0, set: 0 };
  const semantic = {
    hover: [],
    hoverEnd: 0,
    taps: [],
    navigate: [],
    activate: 0,
    clear: 0
  };
  const settings = Object.assign({ tapThresholds: { mouse: 6, touch: 10 } }, options || {});
  const input = cameraInput.attach(canvas, {
    getCamera: () => cam,
    setCamera(next) {
      cam = next;
      renderCalls.set += 1;
    },
    getViewport: () => viewport,
    getBounds: () => BOUNDS,
    requestRender: () => {
      renderCalls.render += 1;
    },
    onHoverMove(point, event, pointerType) {
      semantic.hover.push({ point, pointerType });
    },
    onHoverEnd() {
      semantic.hoverEnd += 1;
    },
    onTap(point, event, pointerType) {
      semantic.taps.push({ point, pointerType });
    },
    onNavigate(direction) {
      semantic.navigate.push(direction);
    },
    onActivate() {
      semantic.activate += 1;
    },
    onClear() {
      semantic.clear += 1;
    },
    options: settings
  });

  return {
    canvas,
    viewport,
    input,
    renderCalls,
    semantic,
    getCamera: () => cam
  };
}

test('single-pointer drag pans with CSS deltas and captures the pointer', () => {
  const context = setup();

  const down = context.canvas.dispatch('pointerdown', {
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    clientX: 100,
    clientY: 80
  });
  context.canvas.dispatch('pointermove', {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 120,
    clientY: 90
  });

  assert.equal(down.defaultPrevented, true);
  assert.equal(context.canvas.captured.has(1), true);
  assert.equal(context.canvas.classList.contains('is-panning'), true);
  assert.equal(context.getCamera().focusX, -20);
  assert.equal(context.getCamera().focusY, -10);
  assert.ok(context.renderCalls.set >= 1);
  assert.ok(context.renderCalls.render >= 1);
});

test('pointerup releases capture and stops further panning', () => {
  const context = setup();

  context.canvas.dispatch('pointerdown', {
    pointerId: 2,
    pointerType: 'mouse',
    button: 0,
    clientX: 100,
    clientY: 100
  });
  context.canvas.dispatch('pointermove', { pointerId: 2, clientX: 130, clientY: 100 });
  const before = context.getCamera().focusX;
  context.canvas.dispatch('pointerup', { pointerId: 2, clientX: 130, clientY: 100 });
  context.canvas.dispatch('pointermove', { pointerId: 2, clientX: 200, clientY: 100 });

  assert.equal(context.canvas.captured.has(2), false);
  assert.equal(context.canvas.classList.contains('is-panning'), false);
  assert.equal(context.getCamera().focusX, before);
});

test('non-primary mouse buttons are ignored', () => {
  const context = setup();

  context.canvas.dispatch('pointerdown', {
    pointerId: 3,
    pointerType: 'mouse',
    button: 1,
    clientX: 100,
    clientY: 100
  });
  context.canvas.dispatch('pointermove', { pointerId: 3, clientX: 180, clientY: 140 });

  assert.equal(context.getCamera().focusX, 0);
  assert.equal(context.getCamera().focusY, 0);
  assert.equal(context.canvas.captured.has(3), false);
});

test('lost pointer capture clears pan state without a jump', () => {
  const context = setup();

  context.canvas.dispatch('pointerdown', {
    pointerId: 4,
    pointerType: 'touch',
    button: 0,
    clientX: 100,
    clientY: 100
  });
  context.canvas.dispatch('lostpointercapture', { pointerId: 4 });
  context.canvas.dispatch('pointermove', { pointerId: 4, clientX: 200, clientY: 160 });

  assert.equal(context.canvas.classList.contains('is-panning'), false);
  assert.equal(context.getCamera().focusX, 0);
  assert.equal(context.getCamera().focusY, 0);
});

test('two-pointer pinch changes zoom and pointer transitions do not jump', () => {
  const context = setup();

  context.canvas.dispatch('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    button: 0,
    clientX: 100,
    clientY: 100
  });
  context.canvas.dispatch('pointerdown', {
    pointerId: 2,
    pointerType: 'touch',
    button: 0,
    clientX: 200,
    clientY: 100
  });
  context.canvas.dispatch('pointermove', { pointerId: 2, clientX: 240, clientY: 100 });

  const pinched = context.getCamera();
  assert.ok(pinched.zoom > 1);

  context.canvas.dispatch('pointerup', { pointerId: 2, clientX: 240, clientY: 100 });
  context.canvas.dispatch('pointermove', { pointerId: 1, clientX: 110, clientY: 100 });

  const after = context.getCamera();
  near(after.focusX, pinched.focusX - 10 / (context.viewport.baseScale * pinched.zoom), 1e-6);
});

test('wheel zoom is anchored at the pointer and prevents page scroll', () => {
  const context = setup();
  const before = context.getCamera();
  const anchor = { x: 80, y: 70 };
  const anchorScene = camera.screenToScene(anchor, context.viewport, before);

  const event = context.canvas.dispatch('wheel', {
    deltaY: -120,
    deltaX: 0,
    deltaMode: 0,
    clientX: 90,
    clientY: 90
  });

  const after = context.getCamera();
  const afterScene = camera.screenToScene(anchor, context.viewport, after);

  assert.equal(event.defaultPrevented, true);
  assert.ok(after.zoom > before.zoom);
  near(afterScene.x, anchorScene.x, 1e-6);
  near(afterScene.y, anchorScene.y, 1e-6);
});

test('wheel delta modes normalize line and page deltas', () => {
  const first = setup();
  const second = setup();

  first.canvas.dispatch('wheel', {
    deltaY: -1,
    deltaMode: 1,
    clientX: 100,
    clientY: 100
  });
  second.canvas.dispatch('wheel', {
    deltaY: -16,
    deltaMode: 0,
    clientX: 100,
    clientY: 100
  });

  near(first.getCamera().zoom, second.getCamera().zoom, 1e-9);
});

test('keyboard zoom and reset operate on the focused canvas', () => {
  const context = setup();
  const initial = context.getCamera();

  const plus = context.canvas.dispatch('keydown', { key: '+' });
  const zoomed = context.getCamera();
  assert.equal(plus.defaultPrevented, true);
  assert.equal(zoomed.zoom, initial.limits.zoomStep);

  context.canvas.dispatch('keydown', { key: '0' });
  const reset = context.getCamera();
  assert.equal(reset.zoom, 1);
  assert.equal(reset.focusX, 0);
  assert.equal(reset.focusY, 0);
  assert.deepEqual(reset.limits, initial.limits);
});

test('hover movement without a pressed pointer emits a semantic hover point', () => {
  const context = setup();

  context.canvas.dispatch('pointermove', {
    pointerId: 8,
    pointerType: 'mouse',
    clientX: 120,
    clientY: 90
  });
  context.canvas.dispatch('pointermove', {
    pointerId: 8,
    pointerType: 'mouse',
    clientX: 140,
    clientY: 100
  });

  assert.equal(context.semantic.hover.length, 2);
  assert.deepEqual(context.semantic.hover[0].point, { x: 110, y: 70 });
  assert.equal(context.semantic.hover[0].pointerType, 'mouse');
  assert.equal(context.getCamera().focusX, 0);
  assert.equal(context.getCamera().focusY, 0);
});

test('pointer leave emits hover end while no gesture is active', () => {
  const context = setup();
  context.canvas.dispatch('pointermove', {
    pointerId: 9,
    pointerType: 'mouse',
    clientX: 100,
    clientY: 100
  });
  context.canvas.dispatch('pointerleave', { pointerId: 9, pointerType: 'mouse' });
  assert.equal(context.semantic.hoverEnd, 1);
});

test('a stationary pointer produces a tap but movement beyond the threshold does not', () => {
  const stationary = setup();
  stationary.canvas.dispatch('pointerdown', {
    pointerId: 10,
    pointerType: 'mouse',
    button: 0,
    clientX: 100,
    clientY: 100
  });
  stationary.canvas.dispatch('pointerup', {
    pointerId: 10,
    pointerType: 'mouse',
    clientX: 101,
    clientY: 100
  });
  assert.equal(stationary.semantic.taps.length, 1);
  assert.equal(stationary.semantic.taps[0].pointerType, 'mouse');

  const dragged = setup();
  dragged.canvas.dispatch('pointerdown', {
    pointerId: 11,
    pointerType: 'touch',
    button: 0,
    clientX: 100,
    clientY: 100
  });
  dragged.canvas.dispatch('pointermove', {
    pointerId: 11,
    pointerType: 'touch',
    clientX: 112,
    clientY: 100
  });
  dragged.canvas.dispatch('pointerup', {
    pointerId: 11,
    pointerType: 'touch',
    clientX: 100,
    clientY: 100
  });
  assert.equal(dragged.semantic.taps.length, 0);
});

test('touch taps use their own threshold', () => {
  const context = setup();
  context.canvas.dispatch('pointerdown', {
    pointerId: 12,
    pointerType: 'touch',
    button: 0,
    clientX: 100,
    clientY: 100
  });
  context.canvas.dispatch('pointermove', {
    pointerId: 12,
    pointerType: 'touch',
    clientX: 108,
    clientY: 100
  });
  context.canvas.dispatch('pointerup', {
    pointerId: 12,
    pointerType: 'touch',
    clientX: 108,
    clientY: 100
  });
  assert.equal(context.semantic.taps.length, 1);
  assert.equal(context.semantic.taps[0].pointerType, 'touch');
});

test('pointercancel and lost pointer capture never produce taps', () => {
  const cancelled = setup();
  cancelled.canvas.dispatch('pointerdown', {
    pointerId: 13,
    pointerType: 'touch',
    button: 0,
    clientX: 100,
    clientY: 100
  });
  cancelled.canvas.dispatch('pointercancel', { pointerId: 13, pointerType: 'touch', clientX: 100, clientY: 100 });
  assert.equal(cancelled.semantic.taps.length, 0);

  const lost = setup();
  lost.canvas.dispatch('pointerdown', {
    pointerId: 14,
    pointerType: 'touch',
    button: 0,
    clientX: 100,
    clientY: 100
  });
  lost.canvas.dispatch('lostpointercapture', { pointerId: 14, pointerType: 'touch', clientX: 100, clientY: 100 });
  assert.equal(lost.semantic.taps.length, 0);
});

test('transitions into and out of two pointers never produce taps', () => {
  const context = setup();
  context.canvas.dispatch('pointerdown', {
    pointerId: 15,
    pointerType: 'touch',
    button: 0,
    clientX: 100,
    clientY: 100
  });
  context.canvas.dispatch('pointerdown', {
    pointerId: 16,
    pointerType: 'touch',
    button: 0,
    clientX: 200,
    clientY: 100
  });
  context.canvas.dispatch('pointermove', {
    pointerId: 16,
    pointerType: 'touch',
    clientX: 240,
    clientY: 100
  });
  context.canvas.dispatch('pointerup', {
    pointerId: 16,
    pointerType: 'touch',
    clientX: 240,
    clientY: 100
  });
  const afterPinch = context.getCamera();
  context.canvas.dispatch('pointermove', {
    pointerId: 15,
    pointerType: 'touch',
    clientX: 110,
    clientY: 100
  });
  context.canvas.dispatch('pointerup', {
    pointerId: 15,
    pointerType: 'touch',
    clientX: 110,
    clientY: 100
  });

  assert.equal(context.semantic.taps.length, 0);
  near(context.getCamera().focusX, afterPinch.focusX - 10 / (context.viewport.baseScale * afterPinch.zoom), 1e-6);
});

test('keyboard navigation keys emit semantics without disturbing zoom keys', () => {
  const context = setup();
  const initial = context.getCamera();

  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Enter', ' ', 'Escape']) {
    const event = context.canvas.dispatch('keydown', { key });
    assert.equal(event.defaultPrevented, true, key);
  }

  assert.deepEqual(context.semantic.navigate, [1, 1, -1, -1]);
  assert.equal(context.semantic.activate, 2);
  assert.equal(context.semantic.clear, 1);
  assert.deepEqual(context.getCamera(), initial);
});

test('context menu and drag start are suppressed on the canvas', () => {
  const context = setup();

  const menu = context.canvas.dispatch('contextmenu', {});
  const drag = context.canvas.dispatch('dragstart', {});

  assert.equal(menu.defaultPrevented, true);
  assert.equal(drag.defaultPrevented, true);
});

test('destroy removes listeners and is idempotent', () => {
  const context = setup();
  const types = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave', 'wheel', 'keydown', 'contextmenu', 'dragstart'];
  for (const type of types) {
    assert.ok(context.canvas.listenerCount(type) > 0, type);
  }

  assert.equal(context.input.destroy(), true);
  assert.equal(context.input.destroy(), false);

  for (const type of types) {
    assert.equal(context.canvas.listenerCount(type), 0, type);
  }

  context.canvas.dispatch('pointerdown', {
    pointerId: 5,
    pointerType: 'mouse',
    button: 0,
    clientX: 100,
    clientY: 100
  });
  assert.equal(context.canvas.captured.has(5), false);
});

function near(actual, expected, tolerance) {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    actual + ' should be within ' + tolerance + ' of ' + expected
  );
}
