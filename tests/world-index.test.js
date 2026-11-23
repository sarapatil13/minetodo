const test = require('node:test');
const assert = require('node:assert/strict');
const world = require('../src/world/index.js');

function createCanvas() {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctx = {
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    setTransform: noop,
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

  return {
    width: 0,
    height: 0,
    parentElement: null,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 320, height: 180 })
  };
}

test('public adapter exposes world modules and sample factory', () => {
  assert.equal(typeof world.mount, 'function');
  assert.equal(typeof world.createSampleMeadow, 'function');
  assert.equal(typeof world.worldBounds, 'function');
  assert.equal(world.coords.TILE_W, 48);
  assert.equal(world.map.WIDTH, 11);
  assert.equal(typeof world.renderer.drawWorld, 'function');
  assert.equal(typeof world.scene.createScene, 'function');
  assert.equal(typeof world.controller.createController, 'function');
  assert.equal(typeof world.selectableTargets.buildSelectableTargets, 'function');
  assert.equal(typeof world.hitTest.pickAtScenePoint, 'function');
  assert.equal(typeof world.interactionState.createState, 'function');
  assert.equal(typeof world.interaction.create, 'function');
  assert.equal(typeof world.infoPanel.attach, 'function');
});

test('mount builds a sample scene and redraws without task modules', () => {
  const canvas = createCanvas();
  const handle = world.mount(canvas, { maxDpr: 1 });

  try {
    assert.ok(handle);
    assert.equal(handle.world.map.name, 'Meadow Haven');
    assert.equal(handle.world.commands.length, 118);
    handle.redraw();
    assert.equal(canvas.width, 320);
    assert.equal(canvas.height, 180);
  } finally {
    handle.destroy();
  }
});

test('mounting twice destroys the previous controller handle', () => {
  const canvas = createCanvas();
  const first = world.mount(canvas, { maxDpr: 1 });
  const second = world.mount(canvas, { maxDpr: 1 });

  try {
    assert.notStrictEqual(first, second);
    assert.equal(first.destroy(), false);
    assert.equal(second.destroy(), true);
    assert.equal(second.destroy(), false);
  } finally {
    second.destroy();
  }
});
