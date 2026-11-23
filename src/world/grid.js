(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const tiles = isNode ? require('./tiles.js') : root.CQ.worldTiles;
  const validation = isNode ? require('./mapValidation.js') : root.CQ.worldMapValidation;
  const api = factory(tiles, validation);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldGrid = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (tiles, validation) {
  'use strict';

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map(cloneValue);
    }
    if (Boolean(value) && typeof value === 'object') {
      const clone = {};
      const keys = Object.keys(value);
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        clone[key] = cloneValue(value[key]);
      }
      return clone;
    }
    return value;
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isInBounds(grid, col, row) {
    return Boolean(grid) &&
      Number.isSafeInteger(col) &&
      Number.isSafeInteger(row) &&
      Number.isSafeInteger(grid.width) &&
      Number.isSafeInteger(grid.height) &&
      col >= 0 &&
      col < grid.width &&
      row >= 0 &&
      row < grid.height;
  }

  function indexOf(grid, col, row) {
    if (!isInBounds(grid, col, row)) return -1;
    return row * grid.width + col;
  }

  function createGrid(width, height, options) {
    if (!Number.isSafeInteger(width) || width <= 0) {
      throw new RangeError('Grid width must be a positive safe integer');
    }
    if (!Number.isSafeInteger(height) || height <= 0) {
      throw new RangeError('Grid height must be a positive safe integer');
    }

    const settings = options || {};
    const terrain = settings.terrain === undefined ? 'grass' : settings.terrain;
    const definition = tiles.getTerrainDefinition(terrain);
    if (!definition) {
      throw new TypeError('Unknown terrain type: ' + String(terrain));
    }

    const salt = settings.variantSalt === undefined ? 1 : settings.variantSalt;
    if (!Number.isInteger(salt)) {
      throw new TypeError('Variant salt must be an integer');
    }

    const name = settings.name === undefined ? 'Untitled World' : settings.name;
    if (typeof name !== 'string') {
      throw new TypeError('World name must be a string');
    }

    const tileRows = [];
    for (let row = 0; row < height; row += 1) {
      const tileRow = [];
      for (let col = 0; col < width; col += 1) {
        tileRow.push({
          type: terrain,
          variant: tiles.variantFor(col, row, salt, definition.variants)
        });
      }
      tileRows.push(tileRow);
    }

    const grid = {
      name,
      width,
      height,
      tiles: tileRows,
      objects: []
    };
    validation.assertValidMap(grid);
    return grid;
  }

  function adoptGrid(map) {
    validation.assertValidMap(map);
    const copy = cloneValue(map);
    validation.assertValidMap(copy);
    return copy;
  }

  function getTile(grid, col, row) {
    if (!isInBounds(grid, col, row) || !Array.isArray(grid.tiles)) return null;
    const rowData = grid.tiles[row];
    if (!Array.isArray(rowData)) return null;
    const source = rowData[col];
    return isRecord(source) ? cloneValue(source) : null;
  }

  function getNeighbors(grid, col, row, options) {
    if (!isInBounds(grid, col, row)) return [];

    const settings = options || {};
    const offsets = [
      { col: 0, row: -1 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: -1, row: 0 }
    ];

    if (settings.diagonal === true) {
      offsets.push(
        { col: 1, row: -1 },
        { col: 1, row: 1 },
        { col: -1, row: 1 },
        { col: -1, row: -1 }
      );
    }

    const result = [];
    for (const offset of offsets) {
      const neighborCol = col + offset.col;
      const neighborRow = row + offset.row;
      const tile = getTile(grid, neighborCol, neighborRow);
      if (tile) {
        result.push({ col: neighborCol, row: neighborRow, tile });
      }
    }
    return result;
  }

  function getTilesByType(grid, terrain) {
    const canonical = tiles.resolveTerrainType(terrain);
    if (!canonical) {
      throw new TypeError('Unknown terrain type: ' + String(terrain));
    }

    const result = [];
    if (!grid || !Array.isArray(grid.tiles)) return result;

    for (let row = 0; row < grid.tiles.length; row += 1) {
      const rowData = grid.tiles[row];
      if (!Array.isArray(rowData)) continue;

      for (let col = 0; col < rowData.length; col += 1) {
        const source = rowData[col];
        if (isRecord(source) && tiles.resolveTerrainType(source.type) === canonical) {
          result.push({ col, row, tile: cloneValue(source) });
        }
      }
    }
    return result;
  }

  function updateTile(grid, col, row, patch) {
    if (!isInBounds(grid, col, row)) {
      throw new RangeError('Tile anchor is outside the grid: ' + col + ',' + row);
    }
    if (!isRecord(patch)) {
      throw new TypeError('Tile patch must be an object');
    }

    const next = adoptGrid(grid);
    const target = next.tiles[row][col];
    const changes = cloneValue(patch);
    const keys = Object.keys(changes);
    for (let index = 0; index < keys.length; index += 1) {
      target[keys[index]] = changes[keys[index]];
    }

    validation.assertValidMap(next);
    return next;
  }

  return {
    createGrid,
    adoptGrid,
    isInBounds,
    indexOf,
    getTile,
    getNeighbors,
    getTilesByType,
    updateTile
  };
});
