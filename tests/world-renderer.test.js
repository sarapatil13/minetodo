const test = require('node:test');
const assert = require('node:assert/strict');
const mapData = require('../src/world/map.js');
const sceneData = require('../src/world/scene.js');
const renderer = require('../src/world/renderer.js');

function createContext() {
  const calls = [];
  function record(name) {
    return (...args) => {
      for (const arg of args) {
        if (typeof arg === 'number') {
          assert.ok(Number.isFinite(arg), name + ' received a non-finite number');
        }
      }
      calls.push({ name, args });
    };
  }

  const gradient = { addColorStop: record('addColorStop') };
  return {
    calls,
    fillStyle: null,
    strokeStyle: null,
    lineWidth: 1,
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillRect: record('fillRect'),
    clearRect: record('clearRect'),
    ellipse: record('ellipse'),
    arc: record('arc'),
    translate: record('translate'),
    scale: record('scale'),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient
  };
}

test('drawBackdrop fills the viewport with finite coordinates', () => {
  const ctx = createContext();
  renderer.drawBackdrop(ctx, 320, 180);
  assert.ok(ctx.calls.some((call) => call.name === 'fillRect'));
  assert.ok(ctx.calls.length > 10);
});

test('drawTile supports every terrain type', () => {
  const commands = sceneData.buildDrawCommands(mapData.createSampleMeadow());
  const seen = new Set();

  for (const command of commands) {
    if (command.layer !== 'ground') continue;
    seen.add(command.type);
    const ctx = createContext();
    renderer.drawTile(ctx, command, { width: 48, height: 24 });
    assert.ok(ctx.calls.some((call) => call.name === 'fill'));
  }

  assert.deepEqual([...seen].sort(), ['grass', 'path', 'pond']);
});

test('drawObject supports every object kind', () => {
  const commands = sceneData.buildDrawCommands(mapData.createSampleMeadow());
  const seen = new Set();

  for (const command of commands) {
    if (command.layer !== 'object') continue;
    seen.add(command.kind);
    const ctx = createContext();
    renderer.drawObject(ctx, command, { width: 48, height: 24 });
    assert.ok(ctx.calls.some((call) => call.name === 'fill'));
  }

  assert.deepEqual([...seen].sort(), ['bush', 'fence', 'flowers', 'house', 'reeds', 'tree']);
});

test('drawWorld dispatches commands in scene order', () => {
  const built = sceneData.createScene(mapData.createSampleMeadow());
  const ctx = createContext();
  const seen = [];
  const originalTile = renderer.drawTile;
  const originalObject = renderer.drawObject;

  renderer.drawTile = (_ctx, command) => seen.push(command.id);
  renderer.drawObject = (_ctx, command) => seen.push(command.id);
  try {
    renderer.drawWorld(ctx, built);
  } finally {
    renderer.drawTile = originalTile;
    renderer.drawObject = originalObject;
  }

  assert.deepEqual(seen, built.commands.map((command) => command.id));
});

function feedbackFor(scene, targetId, level) {
  const targets = require('../src/world/selectableTargets.js').buildSelectableTargets(scene).targets;
  const target = targets.find((candidate) => candidate.id === targetId);
  const feedback = { hoverId: null, keyboardFocusId: null, selectedId: null, targetsById: {} };
  feedback.targetsById[target.id] = target;
  feedback[level] = target.id;
  return feedback;
}

test('drawWorld adds selected feedback without changing command dispatch order', () => {
  const built = sceneData.createScene(mapData.createSampleMeadow());
  const ctx = createContext();
  const seen = [];
  const originalTile = renderer.drawTile;
  const originalObject = renderer.drawObject;

  renderer.drawTile = (_ctx, command) => seen.push(command.id);
  renderer.drawObject = (_ctx, command) => seen.push(command.id);
  try {
    renderer.drawWorld(ctx, built, feedbackFor(built, 'object:starter-house', 'selectedId'));
  } finally {
    renderer.drawTile = originalTile;
    renderer.drawObject = originalObject;
  }

  assert.deepEqual(seen, built.commands.map((command) => command.id));
  assert.ok(ctx.calls.filter((call) => call.name === 'stroke').length > 0);
});

test('drawWorld renders pond feedback for every commanded tile in the target', () => {
  const built = sceneData.createScene(mapData.createSampleMeadow());
  const targets = require('../src/world/selectableTargets.js').buildSelectableTargets(built).targets;
  const pond = targets.find((target) => target.category === 'terrain');
  const ctx = createContext();

  renderer.drawWorld(ctx, built, feedbackFor(built, pond.id, 'hoverId'));

  const strokes = ctx.calls.filter((call) => call.name === 'stroke');
  assert.ok(strokes.length >= pond.tiles.length);
});

test('drawWorld preserves the default command order with an empty feedback object', () => {
  const built = sceneData.createScene(mapData.createSampleMeadow());
  const ctx = createContext();
  const seen = [];
  const originalTile = renderer.drawTile;
  const originalObject = renderer.drawObject;

  renderer.drawTile = (_ctx, command) => seen.push(command.id);
  renderer.drawObject = (_ctx, command) => seen.push(command.id);
  try {
    renderer.drawWorld(ctx, built, {});
  } finally {
    renderer.drawTile = originalTile;
    renderer.drawObject = originalObject;
  }

  assert.deepEqual(seen, built.commands.map((command) => command.id));
});

test('drawBackdrop accepts a palette override without mutating the default palette', () => {
  const baseTop = renderer.PALETTE.skyTop;
  const ctx = createContext();
  renderer.drawBackdrop(ctx, 320, 180, { skyTop: '#010203', skyBottom: '#040506' });
  const stops = ctx.calls
    .filter((call) => call.name === 'addColorStop')
    .map((call) => call.args[1]);
  assert.ok(stops.includes('#010203'));
  assert.ok(stops.includes('#040506'));
  assert.equal(renderer.PALETTE.skyTop, baseTop);
});

test('drawTile and drawObject use palette colors when supplied', () => {
  const applied = [];
  const ctx = createContext();
  Object.defineProperty(ctx, 'fillStyle', {
    configurable: true,
    get: () => applied[applied.length - 1],
    set: (value) => { applied.push(value); }
  });

  const grass = sceneData.buildDrawCommands(mapData.createSampleMeadow())
    .find((command) => command.layer === 'ground' && command.type === 'grass');
  renderer.drawTile(ctx, grass, { width: 48, height: 24 }, {
    grass: ['#123456'],
    grassSide: '#654321',
    grassEdge: '#abcdef'
  });
  assert.ok(applied.includes('#123456'));
  assert.ok(applied.includes('#654321'));
  assert.equal(renderer.PALETTE.grass[0], '#a8c98b');

  const fence = { kind: 'fence', x: 0, y: 0, variant: 0 };
  renderer.drawObject(ctx, fence, null, {
    fence: '#111111',
    fenceLight: '#222222',
    fencePost: '#333333'
  });
  assert.ok(applied.includes('#111111'));
  assert.ok(applied.includes('#222222'));
  assert.ok(applied.includes('#333333'));
});

test('drawWorld forwards the scene palette to every command renderer', () => {
  const palette = { skyTop: '#010203' };
  const built = sceneData.createScene(mapData.createSampleMeadow(), { palette });
  const ctx = createContext();
  const seen = [];
  const originalTile = renderer.drawTile;
  const originalObject = renderer.drawObject;

  renderer.drawTile = (_ctx, command, tile, received) => seen.push({ id: command.id, palette: received });
  renderer.drawObject = (_ctx, command, tile, received) => seen.push({ id: command.id, palette: received });
  try {
    renderer.drawWorld(ctx, built);
  } finally {
    renderer.drawTile = originalTile;
    renderer.drawObject = originalObject;
  }

  assert.equal(seen.length, built.commands.length);
  assert.ok(seen.every((entry) => entry.palette === built.palette));
});
