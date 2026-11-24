const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const content = require('../src/world/content.js');
const progression = require('../src/world/progression.js');
const world = require('../src/world/index.js');

function makeState(overrides = {}) {
  const objects = overrides.objects || {};
  return {
    objects: {
      placed: objects.placed || [],
      moved: objects.moved || [],
      removed: objects.removed || []
    },
    terrain: overrides.terrain || []
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function issueCodes(result) {
  return result.issues.map((issue) => issue.code);
}

test('empty modifications reproduce the derived progression map and scene', () => {
  const base = world.createSampleMeadow();
  const result = content.compose({
    baseMap: base,
    xp: 500,
    state: content.emptyModifications()
  });

  assert.equal(result.ok, true);
  assert.equal(result.phase, 'complete');
  assert.deepEqual(result.issues, []);
  assert.equal(result.xp, 500);
  assert.deepEqual(result.map, progression.composeProgressionMap(base, 500));
  assert.equal(result.scene.map, result.map);
  assert.equal(result.scene.commands.length, 127);
  assert.equal(result.targetIndex.issues.length, 0);
  assert.ok(result.targetIndex.byId['object:progression-annex-house']);
});

test('composition does not mutate inputs and is reproducible', () => {
  const base = deepFreeze(world.createSampleMeadow());
  const state = deepFreeze(makeState({
    objects: {
      placed: [{ id: 'user:A', kind: 'flowers', col: 4, row: 4, salt: 3 }],
      moved: [{ id: 'bush-north', col: 3, row: 0, salt: 4 }]
    },
    terrain: [{ col: 5, row: 5, type: 'grass', salt: 5 }]
  }));
  const before = JSON.stringify(base);
  const beforeState = JSON.stringify(state);

  const first = content.compose({ baseMap: base, xp: 900, state });
  const second = content.compose({ baseMap: base, xp: 900, state });

  assert.equal(JSON.stringify(base), before);
  assert.equal(JSON.stringify(state), beforeState);
  assert.equal(first.ok, true);
  assert.deepEqual(first.issues, second.issues);
  assert.deepEqual(first.map, second.map);
  assert.deepEqual(first.scene, second.scene);
});

test('canonical ordering makes equivalent modifications compose identically', () => {
  const base = world.createSampleMeadow();
  const forward = makeState({
    objects: {
      placed: [
        { id: 'user:a', kind: 'bush', col: 4, row: 4, salt: 1 },
        { id: 'user:b', kind: 'flowers', col: 4, row: 5, salt: 2 }
      ],
      moved: [{ id: 'bush-north', col: 3, row: 0, salt: 3 }],
      removed: ['flowers-west', 'reeds-west']
    },
    terrain: [
      { col: 4, row: 5, type: 'path', salt: 4 },
      { col: 5, row: 5, type: 'grass', salt: 5 }
    ]
  });
  const reversed = makeState({
    objects: {
      placed: forward.objects.placed.slice().reverse(),
      moved: forward.objects.moved.slice(),
      removed: forward.objects.removed.slice().reverse()
    },
    terrain: forward.terrain.slice().reverse()
  });

  const first = content.compose({ baseMap: base, xp: 500, state: forward });
  const second = content.compose({ baseMap: base, xp: 500, state: reversed });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.map, second.map);
  assert.deepEqual(first.scene, second.scene);
  assert.deepEqual(first.issues, second.issues);
});

test('applies terrain, removals, placements, and moves over derived content', () => {
  const base = world.createSampleMeadow();
  const state = makeState({
    objects: {
      placed: [{ id: 'user:lantern', kind: 'flowers', col: 3, row: 4, salt: 7 }],
      moved: [{ id: 'bush-north', col: 3, row: 0, salt: 8 }],
      removed: ['flowers-west']
    },
    terrain: [{ col: 4, row: 4, type: 'path', salt: 9 }]
  });

  const result = content.compose({ baseMap: base, xp: 500, state });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.map.objects.some((object) => object.id === 'flowers-west'), false);

  const placed = result.map.objects.find((object) => object.id === 'user:lantern');
  assert.ok(placed);
  assert.deepEqual(placed.metadata, { source: 'user' });

  const moved = result.map.objects.find((object) => object.id === 'bush-north');
  assert.deepEqual([moved.col, moved.row], [3, 0]);
  assert.equal(result.map.tiles[4][4].type, 'path');
  assert.ok(result.scene.commands.some((command) => command.id === 'object:user:lantern'));
  assert.ok(result.targetIndex.byId['object:user:lantern']);
});

test('skips invalid individual records and reports every issue', () => {
  const base = world.createSampleMeadow();
  const state = makeState({
    objects: {
      placed: [
        { id: 'user:good', kind: 'bush', col: 4, row: 4, salt: 1 },
        { id: 'tree-north', kind: 'tree', col: 1, row: 1, salt: 1 },
        { id: 'user:bad-kind', kind: 'dragon', col: 5, row: 5, salt: 1 },
        { id: 'user:bad-cell', kind: 'tree', col: 99, row: 1, salt: 1 },
        { id: 'user:bad-salt', kind: 'tree', col: 1, row: 1, salt: -1 }
      ],
      moved: [{ id: 'bush-north', col: 99, row: 1, salt: 1 }],
      removed: ['']
    },
    terrain: [{ col: 1, row: 1, type: 'lava', salt: 1 }]
  });

  const result = content.compose({ baseMap: base, xp: 0, state });

  assert.equal(result.ok, true);
  assert.deepEqual(result.map.objects.filter((object) => object.id.indexOf('user:') === 0)
    .map((object) => object.id), ['user:good']);
  assert.deepEqual([result.map.objects.find((object) => object.id === 'bush-north').col,
    result.map.objects.find((object) => object.id === 'bush-north').row], [4, 1]);

  const codes = issueCodes(result);
  assert.ok(codes.includes(content.ISSUE_CODES.RESERVED_ID));
  assert.ok(codes.includes(content.ISSUE_CODES.INVALID_STATE));
});

test('duplicate ids and occupied cells are rejected without choosing a record', () => {
  const base = world.createSampleMeadow();
  const state = makeState({
    objects: {
      placed: [
        { id: 'user:dup', kind: 'bush', col: 4, row: 4, salt: 1 },
        { id: 'user:dup', kind: 'flowers', col: 5, row: 4, salt: 2 },
        { id: 'user:occupied', kind: 'tree', col: 1, row: 3, salt: 3 }
      ],
      moved: [{ id: 'bush-north', col: 7, row: 3, salt: 4 }]
    }
  });

  const result = content.compose({ baseMap: base, xp: 0, state });

  assert.equal(result.ok, true);
  assert.equal(result.map.objects.some((object) => object.id === 'user:dup'), false);
  assert.equal(result.map.objects.some((object) => object.id === 'user:occupied'), false);
  assert.deepEqual([result.map.objects.find((object) => object.id === 'bush-north').col,
    result.map.objects.find((object) => object.id === 'bush-north').row], [4, 1]);

  const codes = issueCodes(result);
  assert.ok(codes.includes(content.ISSUE_CODES.DUPLICATE_ID));
  assert.ok(codes.includes(content.ISSUE_CODES.OCCUPIED_CELL));
});

test('bounds-changing modifications are skipped and reported', () => {
  const base = world.createSampleMeadow();
  base.objects = base.objects.filter((object) => object.id === 'tree-north');
  const state = makeState({ objects: { removed: ['tree-north'] } });

  const result = content.compose({ baseMap: base, xp: 0, state });

  assert.equal(result.ok, true);
  assert.ok(result.map.objects.some((object) => object.id === 'tree-north'));
  assert.ok(issueCodes(result).includes(content.ISSUE_CODES.BOUNDS_CHANGED));
  assert.deepEqual(result.scene.bounds, world.worldBounds(base));
});

test('invalid base maps and target options fail composition before returning a scene', () => {
  const invalidBase = world.createSampleMeadow();
  invalidBase.objects[0].kind = 'dragon';

  const baseResult = content.compose({
    baseMap: invalidBase,
    xp: 0,
    state: content.emptyModifications()
  });
  assert.equal(baseResult.ok, false);
  assert.equal(baseResult.phase, 'base');
  assert.ok(issueCodes(baseResult).includes('INVALID_OBJECT_KIND'));
  assert.throws(
    () => content.composeMap({ baseMap: invalidBase, xp: 0, state: content.emptyModifications() }),
    /World composition failed/
  );

  const targetResult = content.compose({
    baseMap: world.createSampleMeadow(),
    xp: 0,
    state: content.emptyModifications(),
    targetOptions: { objectKinds: [] }
  });
  assert.equal(targetResult.ok, false);
  assert.equal(targetResult.phase, 'targets');
  assert.ok(issueCodes(targetResult).includes('UNSUPPORTED_OBJECT_KIND'));
});

test('classic script loading exposes pure composition through CQ.world', () => {
  const context = vm.createContext({});
  const scripts = [
    'src/rules.js',
    'src/storage.js',
    'src/transfer.js',
    'src/progressionConfig.js',
    'src/world/coords.js',
    'src/world/tiles.js',
    'src/world/map.js',
    'src/world/mapValidation.js',
    'src/world/grid.js',
    'src/world/scene.js',
    'src/world/progression.js',
    'src/world/camera.js',
    'src/world/hitTest.js',
    'src/world/renderer.js',
    'src/world/selectableTargets.js',
    'src/world/content.js',
    'src/world/interactionState.js',
    'src/world/infoPanel.js',
    'src/world/cameraInput.js',
    'src/world/interaction.js',
    'src/world/controller.js',
    'src/world/index.js'
  ];

  scripts.forEach((file) => {
    const absolute = path.join(__dirname, '..', file);
    vm.runInContext(fs.readFileSync(absolute, 'utf8'), context, { filename: absolute });
  });

  assert.equal(typeof context.CQ.worldContent.compose, 'function');
  assert.equal(context.CQ.world.content, context.CQ.worldContent);
  const composed = context.CQ.world.content.compose({
    xp: 500,
    state: context.CQ.world.content.emptyModifications()
  });
  assert.equal(composed.ok, true);
  assert.equal(composed.map.objects.length, 28);
  assert.equal(context.localStorage, undefined);
  assert.equal(context.document, undefined);
});
