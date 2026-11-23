const test = require('node:test');
const assert = require('node:assert/strict');
const camera = require('../src/world/camera.js');
const mapData = require('../src/world/map.js');
const sceneData = require('../src/world/scene.js');
const hitTest = require('../src/world/hitTest.js');
const selectableTargets = require('../src/world/selectableTargets.js');
const interaction = require('../src/world/interaction.js');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

function setup() {
  const scene = sceneData.createScene(mapData.createSampleMeadow());
  const viewport = camera.createViewport({ width: 640, height: 360 }, 1);
  let state = camera.createCamera(scene.bounds);
  let renderCalls = 0;
  const canvas = {
    classList: new FakeClassList(),
    focused: 0,
    focus() { this.focused += 1; }
  };

  const handle = interaction.create(canvas, {
    scene,
    getCamera: () => state,
    getViewport: () => viewport,
    requestRender: () => { renderCalls += 1; }
  });

  function screenPointFor(targetId) {
    const target = handle.inspect().targets
      ? selectableTargets.buildSelectableTargets(scene).byId[targetId]
      : null;
    const resolved = target || selectableTargets.buildSelectableTargets(scene).byId[targetId];
    const anchor = hitTest.anchorForTarget(resolved);
    return camera.sceneToScreen(anchor, viewport, state);
  }

  return {
    scene,
    canvas,
    handle,
    viewport,
    screenPointFor,
    getCamera: () => state,
    setCamera(next) { state = next; },
    renderCalls: () => renderCalls
  };
}

function targetIdOfKind(context, kind) {
  return context.handle.inspect().targets.find((id) => id.indexOf('object:' + kind + '-') === 0 || id === 'object:' + kind);
}

test('tap selects an object and tapping empty terrain clears it', () => {
  const context = setup();
  const houseId = targetIdOfKind(context, 'house') || 'object:starter-house';
  const point = context.screenPointFor(houseId);

  context.handle.handleTap(point, {}, 'mouse');
  assert.equal(context.handle.inspect().selectedId, houseId);
  assert.ok(context.canvas.focused > 0);

  const before = context.renderCalls();
  context.handle.handleTap({ x: 2, y: 2 }, {}, 'mouse');
  assert.equal(context.handle.inspect().selectedId, null);
  assert.ok(context.renderCalls() > before);
});

test('hover state changes only when the hovered target changes', () => {
  const context = setup();
  const houseId = targetIdOfKind(context, 'house') || 'object:starter-house';
  const point = context.screenPointFor(houseId);

  context.handle.handleHoverMove(point, {}, 'mouse');
  assert.equal(context.handle.inspect().hoverId, houseId);
  assert.equal(context.canvas.classList.contains('has-hover'), true);

  const renders = context.renderCalls();
  context.handle.handleHoverMove(point, {}, 'mouse');
  assert.equal(context.renderCalls(), renders);

  context.handle.handleHoverEnd({});
  assert.equal(context.handle.inspect().hoverId, null);
  assert.equal(context.canvas.classList.contains('has-hover'), false);
});

test('hover is recomputed after a camera change using the cached pointer', () => {
  const context = setup();
  const houseId = targetIdOfKind(context, 'house') || 'object:starter-house';
  let point = context.screenPointFor(houseId);
  context.handle.handleHoverMove(point, {}, 'mouse');
  assert.equal(context.handle.inspect().hoverId, houseId);

  const panned = camera.panCamera(context.getCamera(), { x: 100, y: -100 }, context.viewport, null);
  context.setCamera(panned);
  context.handle.refreshHover();

  assert.equal(context.handle.inspect().hoverId, null);

  point = context.screenPointFor(houseId);
  context.handle.handleHoverMove(point, {}, 'mouse');
  const zoomed = camera.zoomCamera(panned, 1.15, point, context.viewport, null);
  context.setCamera(zoomed);
  context.handle.refreshHover({ scheduleRender: false });
  assert.equal(context.handle.inspect().hoverId, houseId);
});

test('keyboard navigation, activation and escape work without camera shortcuts', () => {
  const context = setup();
  const ids = context.handle.inspect().targets;

  context.handle.handleNavigate(1, {});
  assert.equal(context.handle.inspect().keyboardFocusId, ids[0]);

  context.handle.handleNavigate(1, {});
  assert.equal(context.handle.inspect().keyboardFocusId, ids[1]);

  context.handle.handleActivate({});
  assert.equal(context.handle.inspect().selectedId, ids[1]);

  context.handle.handleClear({});
  assert.equal(context.handle.inspect().selectedId, null);
  assert.ok(context.canvas.focused > 0);

  const beforeZoom = context.getCamera().zoom;
  assert.equal(beforeZoom, 1);
});

test('feedback payload includes targets for renderer command lookup', () => {
  const context = setup();
  const ids = context.handle.inspect().targets;
  context.handle.handleNavigate(1, {});
  context.handle.handleActivate({});

  const feedback = context.handle.feedback();
  assert.equal(feedback.selectedId, ids[0]);
  assert.strictEqual(feedback.targetsById[ids[0]].id, ids[0]);
  assert.equal(feedback.hoverId, null);
  assert.equal(feedback.keyboardFocusId, ids[0]);
});
