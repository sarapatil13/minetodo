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
