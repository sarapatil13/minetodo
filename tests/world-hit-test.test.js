const test = require('node:test');
const assert = require('node:assert/strict');
const camera = require('../src/world/camera.js');
const sceneData = require('../src/world/scene.js');
const selectableTargets = require('../src/world/selectableTargets.js');
const hitTest = require('../src/world/hitTest.js');

function objectCommand(kind, overrides) {
  return Object.assign({
    id: 'object:' + kind,
    layer: 'object',
    command: 'object',
    kind,
    variant: 1,
    object: { id: kind, kind, col: 0, row: 0 },
    col: 0,
    row: 0,
    x: 0,
    y: 0,
    depth: 0.5,
    phase: 1
  }, overrides || {});
}

function objectTarget(command, order) {
  return {
    id: command.id,
    category: 'object',
    sourceId: command.object.id,
    commandId: command.id,
    commandIds: [command.id],
    commandIndexes: [order || 0],
    kind: command.kind,
    col: command.col,
    row: command.row,
    variant: command.variant,
    order: order || 0,
    focusPoint: { x: command.x, y: command.y },
    command
  };
}

function pickObject(kind, point, tolerance, overrides) {
  const target = objectTarget(objectCommand(kind, overrides));
  return hitTest.pickAtScenePoint(point, [target], { tolerance: tolerance || 0 });
}

const REPRESENTATIVE_POINTS = {
  tree: {
    visible: [[0, -62], [0, -15]],
    transparent: [[-30, -8]],
    touchGap: [[-34, 0]]
  },
  house: {
    visible: [[-10, -40], [15, -20]],
    transparent: [[0, -68]],
    touchGap: [[0, -70]]
  },
  flowers: {
    visible: [[0, -15], [12, -7]],
    transparent: [[-6, -12]],
    touchGap: [[-30, -10]]
  },
  bush: {
    visible: [[0, -16], [-9, -9]],
    transparent: [[-24, 0]],
    touchGap: [[-36, -8]]
  },
  reeds: {
    visible: [[-11, -12], [9, -20]],
    transparent: [[4, -10]],
    touchGap: [[-25, -10]]
  },
  fence: {
    visible: [[0, -8], [-20, -5]],
    transparent: [[-10, 4]],
    touchGap: [[-10, 10]]
  }
};

for (const kind of Object.keys(REPRESENTATIVE_POINTS)) {
  test(kind + ' hit shapes cover representative visible artwork', () => {
    const cases = REPRESENTATIVE_POINTS[kind].visible;
    for (const [x, y] of cases) {
      assert.equal(
        (pickObject(kind, { x, y }, 0) || {}).id,
        objectTarget(objectCommand(kind)).id,
        x + ',' + y
      );
    }
  });

  test(kind + ' hit shapes preserve representative transparent gaps', () => {
    for (const [x, y] of REPRESENTATIVE_POINTS[kind].transparent) {
      assert.equal(pickObject(kind, { x, y }, 0), null, x + ',' + y);
    }
  });

  test(kind + ' touch tolerance does not swallow a visibly empty gap', () => {
    for (const [x, y] of REPRESENTATIVE_POINTS[kind].touchGap) {
      assert.equal(
        pickObject(kind, { x, y }, hitTest.TOUCH_TOLERANCE_CSS),
        null,
        x + ',' + y
      );
    }
  });
}

test('pickAtScenePoint selects the later painter-order object when objects overlap', () => {
  const back = objectTarget(objectCommand('bush', { id: 'back', object: { id: 'back', kind: 'bush' } }), 3);
  const front = objectTarget(objectCommand('house', { id: 'front', object: { id: 'front', kind: 'house' } }), 9);
  const point = { x: 4, y: -12 };

  assert.equal(hitTest.pickAtScenePoint(point, [back, front], { tolerance: 0 }), front);
  assert.equal(hitTest.pickAtScenePoint(point, [front, back], { tolerance: 0 }), front);
});

test('overlapping anchors do not affect painter-order selection', () => {
  const left = objectTarget(objectCommand('house', {
    id: 'left',
    x: 0,
    y: 0,
    object: { id: 'left', kind: 'house' }
  }), 2);
  const right = objectTarget(objectCommand('house', {
    id: 'right',
    x: 4,
    y: -4,
    object: { id: 'right', kind: 'house' }
  }), 7);
  const overlap = { x: 0, y: -48 };

  assert.ok(hitTest.pickAtScenePoint(overlap, [left], { tolerance: 0 }));
  assert.ok(hitTest.pickAtScenePoint(overlap, [right], { tolerance: 0 }));
  assert.equal(hitTest.pickAtScenePoint(overlap, [left, right], { tolerance: 0 }), right);
});

function overlapScene(objectFirst) {
  const tile = {
    id: 'tile:0:0',
    layer: 'ground',
    command: 'tile',
    type: 'pond',
    variant: 0,
    col: 0,
    row: 0,
    x: 0,
    y: 0,
    diamond: [
      { x: 0, y: -12 }, { x: 24, y: 0 }, { x: 0, y: 12 }, { x: -24, y: 0 }
    ],
    depth: 0,
    phase: 0
  };
  const object = objectCommand('bush', {
    id: 'bush-over-pond',
    object: { id: 'bush-over-pond', kind: 'bush', col: 0, row: 0, variant: 1 }
  });
  const commands = objectFirst ? [object, tile] : [tile, object];
  return {
    name: 'Overlap',
    map: { name: 'Overlap', width: 1, height: 1, tiles: [[{ type: 'pond', variant: 0 }]], objects: [object.object] },
    origin: { x: 0, y: 0 },
    tile: { width: 48, height: 24 },
    bounds: { minX: -24, minY: -30, maxX: 24, maxY: 20, width: 48, height: 50 },
    commands
  };
}

test('pond terrain and objects share one painter-order model', () => {
  const point = { x: 0, y: -8 };
  const behindTargets = selectableTargets.buildSelectableTargets(overlapScene(true)).targets;
  const frontTargets = selectableTargets.buildSelectableTargets(overlapScene(false)).targets;

  const behindPick = hitTest.pickAtScenePoint(point, behindTargets, { tolerance: 0 });
  const frontPick = hitTest.pickAtScenePoint(point, frontTargets, { tolerance: 0 });

  assert.equal(behindPick.category, 'terrain');
  assert.equal(frontPick.category, 'object');
});

test('multi-tile pond selection uses the commanded tile order, not the group order', () => {
  const bush = objectCommand('bush', {
    id: 'bush-between',
    object: { id: 'bush-between', kind: 'bush', col: 1, row: 0, variant: 1 }
  });
  const firstTile = {
    id: 'tile:0:0', layer: 'ground', command: 'tile', type: 'pond', variant: 0,
    col: 0, row: 0, x: -24, y: 0,
    diamond: [{ x: -24, y: -12 }, { x: 0, y: 0 }, { x: -24, y: 12 }, { x: -48, y: 0 }],
    depth: 0, phase: 0
  };
  const secondTile = {
    id: 'tile:1:0', layer: 'ground', command: 'tile', type: 'pond', variant: 0,
    col: 1, row: 0, x: 0, y: 0,
    diamond: [{ x: 0, y: -12 }, { x: 24, y: 0 }, { x: 0, y: 12 }, { x: -24, y: 0 }],
    depth: 1, phase: 0
  };
  const scene = {
    name: 'Wide Pond',
    map: {
      name: 'Wide Pond', width: 2, height: 1,
      tiles: [[{ type: 'pond', variant: 0 }, { type: 'pond', variant: 0 }]],
      objects: [bush.object]
    },
    origin: { x: 0, y: 0 },
    tile: { width: 48, height: 24 },
    bounds: { minX: -48, minY: -24, maxX: 24, maxY: 20, width: 72, height: 44 },
    commands: [firstTile, bush, secondTile]
  };
  const targets = selectableTargets.buildSelectableTargets(scene).targets;
  const pond = targets.find((target) => target.category === 'terrain');
  const shrub = targets.find((target) => target.category === 'object');
  const secondPondTile = pond.tiles.find((tile) => tile.col === 1 && tile.row === 0);

  assert.ok(secondPondTile.commandIndex > shrub.order);
  assert.equal(
    hitTest.pickAtScenePoint({ x: secondPondTile.x, y: secondPondTile.y }, targets, { tolerance: 0 }),
    pond
  );
});

test('pick uses camera screen-to-scene conversion at zoom and pan', () => {
  const viewport = camera.createViewport({ width: 320, height: 180 }, 1);
  const state = camera.createCamera({ minX: -100, minY: -100, maxX: 100, maxY: 100, width: 200, height: 200 });
  const target = objectTarget(objectCommand('house', { x: 30, y: 20 }));
  const panned = camera.panCamera(state, { x: -40, y: 25 }, viewport, null);
  const zoomed = camera.zoomCamera(panned, 1.15, { x: 150, y: 80 }, viewport, null);
  const screenPoint = camera.sceneToScreen({ x: 30, y: 0 }, viewport, zoomed);

  assert.equal(
    hitTest.pick(screenPoint, { camera: zoomed, viewport, targets: [target] }, 'mouse'),
    target
  );
});

test('touch tolerance is larger than mouse tolerance in screen pixels', () => {
  const viewport = camera.createViewport({ width: 320, height: 180 }, 1);
  const state = camera.createCamera({ minX: -100, minY: -100, maxX: 100, maxY: 100, width: 200, height: 200 });
  const target = objectTarget(objectCommand('tree'));
  const point = camera.sceneToScreen({ x: -28, y: -6 }, viewport, state);
  const context = { camera: state, viewport, targets: [target] };

  assert.equal(hitTest.pick(point, context, 'mouse'), null);
  assert.equal(hitTest.pick(point, context, 'touch'), target);
});

test('anchorForTarget returns a point inside each supported shape', () => {
  for (const kind of Object.keys(REPRESENTATIVE_POINTS)) {
    const target = objectTarget(objectCommand(kind));
    const anchor = hitTest.anchorForTarget(target);
    assert.equal(
      (hitTest.pickAtScenePoint(anchor, [target], { tolerance: 0 }) || {}).id,
      target.id,
      kind + ' anchor'
    );
  }
});
