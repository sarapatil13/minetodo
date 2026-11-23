(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldMap = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIDTH = 11;
  const HEIGHT = 9;
  const TILE_TYPES = ['grass', 'path', 'pond'];
  const OBJECT_KINDS = ['tree', 'house', 'flowers', 'bush', 'reeds', 'fence'];

  const PATH_TILES = [
    [3, 7], [4, 7], [4, 6], [5, 6], [5, 5], [6, 5], [6, 4], [6, 3]
  ];

  const POND_TILES = [[8, 5], [9, 5], [8, 6], [9, 6]];

  const OBJECTS = [
    { id: 'tree-northwest', kind: 'tree', col: 1, row: 3 },
    { id: 'tree-north', kind: 'tree', col: 3, row: 1 },
    { id: 'tree-east', kind: 'tree', col: 9, row: 4 },
    { id: 'tree-southwest', kind: 'tree', col: 2, row: 7 },
    { id: 'starter-house', kind: 'house', col: 7, row: 3 },
    { id: 'flowers-west', kind: 'flowers', col: 2, row: 2 },
    { id: 'flowers-north', kind: 'flowers', col: 5, row: 2 },
    { id: 'flowers-south', kind: 'flowers', col: 7, row: 6 },
    { id: 'flowers-east', kind: 'flowers', col: 10, row: 6 },
    { id: 'bush-north', kind: 'bush', col: 4, row: 1 },
    { id: 'bush-east', kind: 'bush', col: 8, row: 3 },
    { id: 'bush-south', kind: 'bush', col: 6, row: 8 },
    { id: 'reeds-west', kind: 'reeds', col: 7, row: 5 },
    { id: 'reeds-north', kind: 'reeds', col: 8, row: 4 },
    { id: 'reeds-south', kind: 'reeds', col: 9, row: 7 },
    { id: 'fence-west-a', kind: 'fence', col: 0, row: 4 },
    { id: 'fence-west-b', kind: 'fence', col: 1, row: 4 },
    { id: 'fence-south-a', kind: 'fence', col: 0, row: 6 },
    { id: 'fence-south-b', kind: 'fence', col: 1, row: 6 }
  ];

  function variantFor(col, row, salt) {
    return (col * 7 + row * 11 + salt * 5) % 5;
  }

  function key(col, row) {
    return col + ',' + row;
  }

  function createSampleMeadow() {
    const path = new Set(PATH_TILES.map(([col, row]) => key(col, row)));
    const pond = new Set(POND_TILES.map(([col, row]) => key(col, row)));
    const tiles = [];

    for (let row = 0; row < HEIGHT; row += 1) {
      const tileRow = [];
      for (let col = 0; col < WIDTH; col += 1) {
        const id = key(col, row);
        let type = 'grass';
        if (path.has(id)) type = 'path';
        if (pond.has(id)) type = 'pond';
        tileRow.push({ type, variant: variantFor(col, row, 1) });
      }
      tiles.push(tileRow);
    }

    const objects = OBJECTS.map((object, index) => ({
      id: object.id,
      kind: object.kind,
      col: object.col,
      row: object.row,
      variant: variantFor(object.col, object.row, index + 2)
    }));

    return {
      name: 'Meadow Haven',
      width: WIDTH,
      height: HEIGHT,
      tiles,
      objects
    };
  }

  return {
    WIDTH,
    HEIGHT,
    TILE_TYPES,
    OBJECT_KINDS,
    createSampleMeadow
  };
});
