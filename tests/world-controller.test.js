const test = require('node:test');
const assert = require('node:assert/strict');
const mapData = require('../src/world/map.js');
const sceneData = require('../src/world/scene.js');
const controller = require('../src/world/controller.js');
const progression = require('../src/world/progression.js');
const selectableTargets = require('../src/world/selectableTargets.js');

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

test('createController exposes interaction inspection and cleans up interaction listeners', () => {
  const ctx = createContext();
  const canvas = {
    width: 0,
    height: 0,
    parentElement: null,
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); }
    },
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 320, height: 180 })
  };

  const handle = controller.createController(canvas, { maxDpr: 1 });
  try {
    const info = handle.inspect();
    assert.equal(typeof info.interaction.selectInteraction, 'undefined');
    assert.equal(info.interaction.targetCount > 0, true);
    assert.equal(info.interaction.selectedId, null);
    assert.equal(info.interaction.hoverId, null);
    assert.equal(canvas.classList.values.has('pointerleave'), false);
  } finally {
    assert.equal(handle.destroy(), true);
    assert.equal(handle.destroy(), false);
  }
});

function createProgressionController() {
  const canvas = {
    width: 0,
    height: 0,
    parentElement: null,
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); }
    },
    getContext: () => createContext(),
    getBoundingClientRect: () => ({ width: 320, height: 180 })
  };
  return controller.createController(canvas, { maxDpr: 1 });
}

test('setProgression updates world, stage, targets and progress in one commit', () => {
  const handle = createProgressionController();
  try {
    const before = handle.inspect();
    const originalWorld = handle.world;
    const originalHandle = handle;
    const scene = progression.createProgressionScene(mapData.createSampleMeadow(), 500);
    const checked = handle.preflightProgression({ xp: 500, scene });

    assert.equal(checked.ok, true);
    assert.strictEqual(handle.world, originalWorld);
    assert.equal(before.progression.stageId, 'starting-meadow');

    const result = handle.setProgression({ xp: 500, scene });
    const after = handle.inspect();

    assert.equal(result.committed, true);
    assert.strictEqual(handle, originalHandle);
    assert.strictEqual(handle.world, scene);
    assert.notStrictEqual(handle.world, originalWorld);
    assert.equal(after.progression.xp, 500);
    assert.equal(after.progression.stageId, 'developed-village');
    assert.deepEqual(after.progression.unlockedFeatures, [
      'meadow-wildflowers',
      'meadow-path-accent',
      'village-annex'
    ]);
    assert.equal(after.interaction.targetCount, checked.targetCount);
    assert.ok(after.interaction.targets.includes('object:progression-annex-house'));
    assert.deepEqual(after.camera, before.camera);
    assert.deepEqual(after.view, before.view);
    assert.equal(result.stageChanged, true);
    assert.deepEqual(Array.from(result.addedFeatures), [
      'meadow-wildflowers',
      'meadow-path-accent',
      'village-annex'
    ]);
  } finally {
    handle.destroy();
  }
});

test('setProgression can lower a derived stage and removes only vanished features', () => {
  const handle = createProgressionController();
  try {
    handle.setProgression({
      xp: 1400,
      scene: progression.createProgressionScene(mapData.createSampleMeadow(), 1400)
    });
    const fullTargets = handle.inspect().interaction.targets.slice();

    const baseScene = progression.createProgressionScene(mapData.createSampleMeadow(), 0);
    const result = handle.setProgression({ xp: 0, scene: baseScene });

    assert.equal(result.stageChanged, true);
    assert.deepEqual(Array.from(result.removedFeatures), [
      'meadow-wildflowers',
      'meadow-path-accent',
      'village-annex',
      'village-garden',
      'thriving-canopy'
    ]);
    assert.equal(handle.inspect().progression.stageId, 'starting-meadow');
    assert.equal(handle.inspect().progression.unlockedFeatures.length, 0);
    assert.ok(handle.inspect().interaction.targetCount < fullTargets.length);
    assert.ok(!handle.inspect().interaction.targets.includes('object:progression-canopy-tree'));
  } finally {
    handle.destroy();
  }
});

test('preflightProgression rejects invalid XP, maps, targets and bounds without mutation', () => {
  const handle = createProgressionController();
  try {
    const originalWorld = handle.world;
    const originalInfo = handle.inspect();
    const scene = progression.createProgressionScene(mapData.createSampleMeadow(), 100);

    for (const input of [null, { xp: -1, scene }, { xp: NaN, scene }]) {
      const result = handle.preflightProgression(input);
      assert.equal(result.ok, false);
      assert.throws(() => handle.setProgression(input), /Progression/);
    }

    const invalidMap = progression.createProgressionScene(mapData.createSampleMeadow(), 100);
    invalidMap.map.objects[0].id = '';
    assert.match(handle.preflightProgression({ xp: 100, scene: invalidMap }).error, /Invalid progression map/);

    const invalidTargets = progression.createProgressionScene(mapData.createSampleMeadow(), 100);
    const objectCommand = invalidTargets.commands.find((command) => command.layer === 'object');
    invalidTargets.commands = invalidTargets.commands.concat([
      Object.assign({}, objectCommand, { id: 'object:duplicate-target' })
    ]);
    assert.match(handle.preflightProgression({ xp: 100, scene: invalidTargets }).error,
      /Invalid progression target index/);

    const wrongBounds = progression.createProgressionScene(mapData.createSampleMeadow(), 100);
    wrongBounds.bounds = Object.assign({}, wrongBounds.bounds, { width: wrongBounds.bounds.width + 1 });
    assert.match(handle.preflightProgression({ xp: 100, scene: wrongBounds }).error, /bounds/);

    assert.strictEqual(handle.world, originalWorld);
    assert.deepEqual(handle.inspect(), originalInfo);
    assert.equal(
      handle.inspect().interaction.targetCount,
      selectableTargets.buildSelectableTargets(originalWorld).targets.length
    );
  } finally {
    handle.destroy();
  }
});

test('setProgression rolls back the previous world if the target index cannot be replaced', () => {
  const handle = createProgressionController();
  const originalWorld = handle.world;
  const originalInfo = handle.inspect();
  const originalBuild = selectableTargets.buildSelectableTargets;
  let builds = 0;

  selectableTargets.buildSelectableTargets = function (...args) {
    builds += 1;
    const result = originalBuild.apply(this, args);
    if (builds === 2) {
      return Object.freeze({
        targets: result.targets,
        byId: result.byId,
        issues: Object.freeze([{ code: 'FORCED', path: 'scene', message: 'forced failure' }])
      });
    }
    return result;
  };

  try {
    const scene = progression.createProgressionScene(mapData.createSampleMeadow(), 250);
    assert.throws(
      () => handle.setProgression({ xp: 250, scene }),
      /Unable to replace the selectable target index/
    );
  } finally {
    selectableTargets.buildSelectableTargets = originalBuild;
  }

  assert.strictEqual(handle.world, originalWorld);
  assert.deepEqual(handle.inspect().progression, originalInfo.progression);
  assert.deepEqual(handle.inspect().interaction.targets, originalInfo.interaction.targets);
  handle.destroy();
});
