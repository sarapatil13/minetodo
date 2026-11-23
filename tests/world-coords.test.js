const test = require('node:test');
const assert = require('node:assert/strict');
const coords = require('../src/world/coords.js');

const origin = { x: 130, y: 40 };
const tile = { width: 48, height: 24 };

test('gridToScreen uses the isometric origin and half-tile steps', () => {
  assert.deepEqual(coords.gridToScreen(0, 0, origin, tile), { x: 130, y: 40 });
  assert.deepEqual(coords.gridToScreen(1, 0, origin, tile), { x: 154, y: 52 });
  assert.deepEqual(coords.gridToScreen(0, 1, origin, tile), { x: 106, y: 52 });
  assert.deepEqual(coords.gridToScreen(3, 2, origin, tile), { x: 154, y: 100 });
});

test('screenToGrid is the exact inverse of gridToScreen', () => {
  for (const [col, row] of [[0, 0], [1, 0], [0, 1], [4, 7], [-2, 3], [9, -4]]) {
    const point = coords.gridToScreen(col, row, origin, tile);
    assert.deepEqual(coords.screenToGrid(point.x, point.y, origin, tile), { col, row });
  }
});

test('round trips hold for the full 11 by 9 meadow', () => {
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 11; col += 1) {
      const center = coords.gridToScreen(col, row, origin, tile);
      assert.deepEqual(coords.screenToGrid(center.x, center.y, origin, tile), { col, row });
      assert.deepEqual(coords.tileAt(center.x, center.y, origin, tile), { col, row });
    }
  }
});

test('transform round trips work for alternate origins and tile sizes', () => {
  const cases = [
    [{ x: 0, y: 0 }, { width: 48, height: 24 }],
    [{ x: -70.5, y: 18.25 }, { width: 32, height: 16 }],
    [{ x: 240, y: -12 }, { width: 60, height: 30 }]
  ];

  for (const [customOrigin, customTile] of cases) {
    for (const [col, row] of [[0, 0], [2, 5], [8, 1], [-3, -2]]) {
      const point = coords.gridToScreen(col, row, customOrigin, customTile);
      const inverse = coords.screenToGrid(point.x, point.y, customOrigin, customTile);
      assert.ok(Math.abs(inverse.col - col) < 1e-9);
      assert.ok(Math.abs(inverse.row - row) < 1e-9);
      assert.deepEqual(coords.tileAt(point.x, point.y, customOrigin, customTile), { col, row });
    }
  }
});

test('tileDiamond returns the four corner points in clockwise order', () => {
  assert.deepEqual(coords.tileDiamond(100, 80, tile), [
    { x: 100, y: 68 },
    { x: 124, y: 80 },
    { x: 100, y: 92 },
    { x: 76, y: 80 }
  ]);

  const center = coords.gridToScreen(2, 3, origin, tile);
  assert.deepEqual(coords.tileDiamondAt(2, 3, origin, tile), coords.tileDiamond(center.x, center.y, tile));
});

test('diamond edges are shared and tileAt resolves them toward smaller col then row', () => {
  const center = coords.gridToScreen(2, 2, origin, tile);

  // The lower-right edge is shared by (2,2) and (3,2).
  const rightEdge = { x: center.x + 12, y: center.y + 6 };
  assert.equal(coords.pointInTile(rightEdge.x, rightEdge.y, 2, 2, origin, tile), true);
  assert.equal(coords.pointInTile(rightEdge.x, rightEdge.y, 3, 2, origin, tile), true);
  assert.deepEqual(coords.tileAt(rightEdge.x, rightEdge.y, origin, tile), { col: 2, row: 2 });

  // The upper-left edge is shared by (1,2) and (2,2).
  const leftEdge = { x: center.x - 12, y: center.y - 6 };
  assert.equal(coords.pointInTile(leftEdge.x, leftEdge.y, 1, 2, origin, tile), true);
  assert.equal(coords.pointInTile(leftEdge.x, leftEdge.y, 2, 2, origin, tile), true);
  assert.deepEqual(coords.tileAt(leftEdge.x, leftEdge.y, origin, tile), { col: 1, row: 2 });

  assert.deepEqual(coords.tileAt(center.x - 12, center.y + 6, origin, tile), { col: 2, row: 2 });
  assert.deepEqual(coords.tileAt(center.x + 12, center.y - 6, origin, tile), { col: 2, row: 1 });
});

test('diamond vertices shared by four tiles use the documented tie-break', () => {
  const center = coords.gridToScreen(2, 2, origin, tile);
  const rightVertex = { x: center.x + 24, y: center.y };

  for (const [col, row] of [[2, 1], [3, 1], [2, 2], [3, 2]]) {
    assert.equal(coords.pointInTile(rightVertex.x, rightVertex.y, col, row, origin, tile), true);
  }
  assert.deepEqual(coords.tileAt(rightVertex.x, rightVertex.y, origin, tile), { col: 2, row: 1 });
});

test('ambiguous four-tile corners use the same deterministic tie-break', () => {
  // This grid vertex is shared by tiles (0,0), (1,0), (0,1) and (1,1).
  const corner = coords.gridToScreen(0.5, 0.5, origin, tile);
  for (const [col, row] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    assert.equal(coords.pointInTile(corner.x, corner.y, col, row, origin, tile), true);
  }
  assert.deepEqual(coords.tileAt(corner.x, corner.y, origin, tile), { col: 0, row: 0 });

  const largeOrigin = { x: 0, y: 0 };
  const otherCorner = coords.gridToScreen(3.5, 4.5, largeOrigin, tile);
  assert.deepEqual(coords.tileAt(otherCorner.x, otherCorner.y, largeOrigin, tile), { col: 3, row: 4 });
});

test('tileAt picks the correct neighbor just inside and outside each edge', () => {
  const center = coords.gridToScreen(2, 2, origin, tile);

  assert.deepEqual(coords.tileAt(center.x + 11.9, center.y + 6, origin, tile), { col: 2, row: 2 });
  assert.deepEqual(coords.tileAt(center.x + 12.1, center.y + 6, origin, tile), { col: 3, row: 2 });
  assert.deepEqual(coords.tileAt(center.x + 12, center.y - 5.9, origin, tile), { col: 2, row: 2 });
  assert.deepEqual(coords.tileAt(center.x + 12, center.y - 6.1, origin, tile), { col: 2, row: 1 });
});

test('scene bounds include tile side depth and tall object extents', () => {
  const map = {
    width: 2,
    height: 2,
    tiles: [[{}, {}], [{}, {}]],
    objects: [{ id: 'tree-1', kind: 'tree', col: 1, row: 0 }]
  };
  const bounds = coords.sceneBounds(map, origin, tile);
  const treeCenter = coords.gridToScreen(1, 0, origin, tile);
  const treeExtent = coords.OBJECT_EXTENTS.tree;

  assert.equal(bounds.minX, origin.x - 48);
  assert.equal(bounds.maxX, treeCenter.x + treeExtent.right);
  assert.equal(bounds.minY, treeCenter.y + treeExtent.top);
  assert.equal(bounds.maxY, origin.y + 24 + 12 + coords.TILE_SIDE_DEPTH);
  assert.ok(bounds.minY <= treeCenter.y + treeExtent.top);
  assert.ok(bounds.maxY >= treeCenter.y + treeExtent.bottom);
  assert.ok(bounds.width > 0);
  assert.ok(bounds.height > 0);
});
