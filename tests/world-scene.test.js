const test = require('node:test');
const assert = require('node:assert/strict');
const coords = require('../src/world/coords.js');
const mapData = require('../src/world/map.js');
const scene = require('../src/world/scene.js');

function emptyGrid(width, height) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: 'grass', variant: 0 })));
}

function smallMap(objects) {
  return { width: 4, height: 4, tiles: emptyGrid(4, 4), objects };
}

test('buildDrawCommands contains every tile and object exactly once', () => {
  const world = mapData.createSampleMeadow();
  const before = JSON.stringify(world);
  const commands = scene.buildDrawCommands(world);
  const ground = commands.filter((command) => command.layer === 'ground');
  const objects = commands.filter((command) => command.layer === 'object');

  assert.equal(commands.length, world.width * world.height + world.objects.length);
  assert.equal(ground.length, world.width * world.height);
  assert.equal(objects.length, world.objects.length);
  assert.equal(new Set(commands.map((command) => command.id)).size, commands.length);
  assert.equal(JSON.stringify(world), before);

  for (const command of ground) {
    assert.ok(mapData.TILE_TYPES.includes(command.type));
    assert.equal(command.diamond.length, 4);
    assert.equal(command.phase, scene.GROUND_PHASE);
  }
  for (const command of objects) {
    assert.ok(coords.OBJECT_EXTENTS[command.kind]);
    assert.equal(command.phase, scene.OBJECT_PHASE);
  }
});

test('draw commands are sorted by unified depth, not all ground before objects', () => {
  const commands = scene.buildDrawCommands(mapData.createSampleMeadow());
  const objectIndexes = commands
    .map((command, index) => (command.layer === 'object' ? index : -1))
    .filter((index) => index >= 0);

  assert.ok(objectIndexes.some((index, position) =>
    position > 0 && commands[index - 1] && commands[index - 1].layer === 'ground'));
  assert.ok(objectIndexes.some((index) =>
    commands[index + 1] && commands[index + 1].layer === 'ground'));

  for (let index = 1; index < commands.length; index += 1) {
    assert.ok(scene.compareDrawCommands(commands[index - 1], commands[index]) <= 0);
  }
});

test('foreground terrain can occlude a background object base', () => {
  const world = mapData.createSampleMeadow();
  const commands = scene.buildDrawCommands(world);
  const indexById = new Map(commands.map((command, index) => [command.id, index]));

  const backTile = indexById.get('tile:2:2');
  const tree = indexById.get('object:tree-northwest');
  const frontTile = indexById.get('tile:3:3');

  assert.ok(backTile < tree);
  assert.ok(tree < frontTile);
  assert.equal(commands[tree].depth, 4.5);
});

test('objects are ordered by depth then row, col and id deterministically', () => {
  const world = smallMap([
    { id: 'a', kind: 'tree', col: 2, row: 1 },
    { id: 'b', kind: 'house', col: 1, row: 2 },
    { id: 'c', kind: 'flowers', col: 0, row: 3 },
    { id: 'd', kind: 'bush', col: 2, row: 1 }
  ]);
  const objects = scene.buildDrawCommands(world)
    .filter((command) => command.layer === 'object')
    .map((command) => command.id);

  assert.deepEqual(objects, [
    'object:a',
    'object:d',
    'object:b',
    'object:c'
  ]);

  const forward = scene.compareDrawCommands(
    { depth: 2.5, phase: 1, row: 1, col: 1, id: 'z' },
    { depth: 2.5, phase: 1, row: 1, col: 2, id: 'a' }
  );
  assert.equal(forward, -1);
});

test('compareDrawCommands does not mutate its inputs', () => {
  const left = { depth: 2, phase: 0, row: 1, col: 1, id: 'left' };
  const right = { depth: 2, phase: 0, row: 1, col: 1, id: 'right' };
  const leftBefore = JSON.stringify(left);
  const rightBefore = JSON.stringify(right);

  scene.compareDrawCommands(left, right);
  assert.equal(JSON.stringify(left), leftBefore);
  assert.equal(JSON.stringify(right), rightBefore);
});

test('createScene includes full object extents in its bounds', () => {
  const world = mapData.createSampleMeadow();
  const built = scene.createScene(world, { origin: { x: 20, y: 30 } });
  const house = world.objects.find((object) => object.kind === 'house');
  const houseCenter = coords.gridToScreen(house.col, house.row, built.origin, built.tile);
  const houseExtent = coords.OBJECT_EXTENTS.house;

  assert.equal(built.name, 'Meadow Haven');
  assert.equal(built.commands.length, 99 + world.objects.length);
  assert.ok(built.bounds.minY <= houseCenter.y + houseExtent.top);
  assert.ok(built.bounds.maxY >= houseCenter.y + houseExtent.bottom);
  assert.ok(built.bounds.width > 0);
  assert.ok(built.bounds.height > 0);
});

test('createScene carries an optional isolated palette without changing the default shape', () => {
  const map = mapData.createSampleMeadow();
  const plain = scene.createScene(map);
  assert.equal(Object.prototype.hasOwnProperty.call(plain, 'palette'), false);

  const source = { skyTop: '#010203', grass: ['#111111', '#222222'] };
  const built = scene.createScene(map, { palette: source });
  assert.deepEqual(built.palette, source);
  assert.notEqual(built.palette, source);
  assert.notEqual(built.palette.grass, source.grass);

  source.grass[0] = '#ffffff';
  assert.equal(built.palette.grass[0], '#111111');
});
