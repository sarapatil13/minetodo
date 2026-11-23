const test = require('node:test');
const assert = require('node:assert/strict');
const mapData = require('../src/world/map.js');
const sceneData = require('../src/world/scene.js');
const selectableTargets = require('../src/world/selectableTargets.js');

function pondMap(width, height, cells) {
  const wanted = new Set(cells.map(([col, row]) => col + ',' + row));
  const tiles = [];
  for (let row = 0; row < height; row += 1) {
    const rowData = [];
    for (let col = 0; col < width; col += 1) {
      rowData.push({
        type: wanted.has(col + ',' + row) ? 'pond' : 'grass',
        variant: 0
      });
    }
    tiles.push(rowData);
  }
  return { name: 'Pond Test', width, height, tiles, objects: [] };
}

test('object targets use stable ids and map back to source command objects', () => {
  const scene = sceneData.createScene(mapData.createSampleMeadow());
  const index = selectableTargets.buildSelectableTargets(scene);
  const houseCommand = scene.commands.find((command) => command.id === 'object:starter-house');
  const house = index.byId['object:starter-house'];

  assert.ok(house);
  assert.equal(house.category, 'object');
  assert.equal(house.sourceId, 'starter-house');
  assert.equal(house.commandId, houseCommand.id);
  assert.deepEqual(house.commandIds, [houseCommand.id]);
  assert.strictEqual(house.command, houseCommand);
  assert.strictEqual(house.command.object, houseCommand.object);
  assert.equal(house.kind, 'house');
  assert.equal(house.col, 7);
  assert.equal(house.row, 3);
  assert.ok(Object.isFrozen(house));
  assert.equal(index.targets.length, scene.map.objects.length);
});

test('object target identities do not depend on array order', () => {
  const first = sceneData.createScene(mapData.createSampleMeadow());
  const reversed = sceneData.createScene(mapData.createSampleMeadow());
  reversed.map.objects = reversed.map.objects.slice().reverse();
  reversed.commands = reversed.commands
    .map((command) => (command.layer === 'object'
      ? Object.assign({}, command, { object: command.object })
      : command))
    .slice()
    .sort((a, b) => {
      if (a.layer !== b.layer) return a.layer === 'ground' ? -1 : 1;
      if (a.depth !== b.depth) return a.depth - b.depth;
      return String(a.id).localeCompare(String(b.id));
    });

  const firstIds = selectableTargets.buildSelectableTargets(first).targets.map((target) => target.id).sort();
  const reversedIds = selectableTargets.buildSelectableTargets(reversed).targets.map((target) => target.id).sort();
  assert.deepEqual(reversedIds, firstIds);
});

test('pond targets group all tile commands with deterministic synthetic ids', () => {
  const scene = sceneData.createScene(pondMap(4, 4, [[1, 1], [2, 1], [1, 2], [2, 2]]));
  const index = selectableTargets.buildSelectableTargets(scene);
  const ponds = index.targets.filter((target) => target.category === 'terrain');

  assert.equal(ponds.length, 1);
  assert.equal(ponds[0].id, 'terrain:pond:1,1|2,1|1,2|2,2');
  assert.equal(ponds[0].tiles.length, 4);
  assert.deepEqual(ponds[0].commandIds, [
    'tile:1:1', 'tile:2:1', 'tile:1:2', 'tile:2:2'
  ]);
  assert.deepEqual(ponds[0].commandIndexes, [5, 6, 9, 10]);
  assert.equal(ponds[0].order, 5);
  assert.ok(Object.isFrozen(ponds[0]));
});

test('disconnected pond tiles produce separate stable targets', () => {
  const scene = sceneData.createScene(pondMap(5, 2, [[0, 0], [4, 0]]));
  const ponds = selectableTargets.buildSelectableTargets(scene).targets;

  assert.equal(ponds.length, 2);
  assert.deepEqual(ponds.map((target) => target.id), [
    'terrain:pond:0,0',
    'terrain:pond:4,0'
  ]);
});

test('invalid or missing object metadata is reported without breaking other targets', () => {
  const scene = sceneData.createScene(mapData.createSampleMeadow());
  scene.commands.push({
    id: 'object:',
    layer: 'object',
    command: 'object',
    kind: 'tree',
    object: { id: '', kind: 'tree', col: 0, row: 0 },
    x: 0,
    y: 0,
    depth: 0.5,
    phase: 1
  });
  scene.commands.push({
    id: 'object:tree-northwest',
    layer: 'object',
    command: 'object',
    kind: 'tree',
    object: { id: 'tree-northwest', kind: 'tree', col: 1, row: 3 },
    x: -48,
    y: 96,
    depth: 4.5,
    phase: 1
  });

  const index = selectableTargets.buildSelectableTargets(scene);
  assert.ok(index.byId['object:tree-northwest']);
  assert.ok(index.issues.some((issue) => issue.code === 'INVALID_TARGET_ID'));
  assert.ok(index.issues.some((issue) => issue.code === 'DUPLICATE_TARGET_ID'));
});

test('descriptions are derived from existing fields and do not invent metadata', () => {
  const scene = sceneData.createScene(mapData.createSampleMeadow());
  const index = selectableTargets.buildSelectableTargets(scene);
  const house = selectableTargets.describeTarget(index.byId['object:starter-house']);
  const pond = selectableTargets.describeTarget(
    index.targets.find((target) => target.category === 'terrain')
  );

  assert.equal(house.name, 'Starter House');
  assert.equal(house.typeLabel, 'House');
  assert.deepEqual(house.facts.map((fact) => fact.label), [
    'ID', 'Kind', 'Grid', 'Variant'
  ]);
  assert.equal(house.description, undefined);

  assert.equal(pond.name, 'Pond');
  assert.equal(pond.typeLabel, 'Terrain · Water');
  assert.deepEqual(pond.facts.map((fact) => fact.label), [
    'Tiles', 'Coordinates', 'Variants'
  ]);
  assert.equal(pond.description, undefined);
});
