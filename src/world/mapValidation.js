(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const tiles = isNode ? require('./tiles.js') : root.CQ.worldTiles;
  const mapData = isNode ? require('./map.js') : root.CQ.worldMap;
  const api = factory(tiles, mapData);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldMapValidation = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (tiles, mapData) {
  'use strict';

  const MAP_ERROR_CODES = Object.freeze({
    INVALID_MAP: 'INVALID_MAP',
    INVALID_NAME: 'INVALID_NAME',
    INVALID_WIDTH: 'INVALID_WIDTH',
    INVALID_HEIGHT: 'INVALID_HEIGHT',
    INVALID_TILES: 'INVALID_TILES',
    INVALID_TILE_ROW: 'INVALID_TILE_ROW',
    INVALID_TILE: 'INVALID_TILE',
    INVALID_TERRAIN_ID: 'INVALID_TERRAIN_ID',
    INVALID_VARIANT: 'INVALID_VARIANT',
    INVALID_OBJECTS: 'INVALID_OBJECTS',
    INVALID_OBJECT: 'INVALID_OBJECT',
    INVALID_OBJECT_ID: 'INVALID_OBJECT_ID',
    DUPLICATE_OBJECT_ID: 'DUPLICATE_OBJECT_ID',
    INVALID_OBJECT_KIND: 'INVALID_OBJECT_KIND',
    OBJECT_OUT_OF_BOUNDS: 'OBJECT_OUT_OF_BOUNDS'
  });

  function WorldMapError(message, errors) {
    const details = Array.isArray(errors) ? errors.slice() : [];
    Error.call(this, message);
    this.name = 'WorldMapError';
    this.message = message;
    this.code = details.length ? details[0].code : MAP_ERROR_CODES.INVALID_MAP;
    this.errors = details;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorldMapError);
    }
  }

  WorldMapError.prototype = Object.create(Error.prototype);
  WorldMapError.prototype.constructor = WorldMapError;

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isPositiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0;
  }

  function describe(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array(' + value.length + ')';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'string') return JSON.stringify(value);
    return String(value);
  }

  function addError(errors, code, path, message, details) {
    errors.push({
      code,
      path,
      message,
      details: details || {}
    });
  }

  function validateTile(tile, path, errors) {
    if (!isRecord(tile)) {
      addError(errors, MAP_ERROR_CODES.INVALID_TILE, path,
        'Tile must be an object with a terrain type and variant.',
        { actual: describe(tile) });
      return;
    }

    const terrainId = tile.type;
    const validTerrain = typeof terrainId === 'string' &&
      tiles.isAllowedTerrainType(terrainId);
    if (!validTerrain) {
      addError(errors, MAP_ERROR_CODES.INVALID_TERRAIN_ID, path + '.type',
        'Tile terrain id must be a canonical terrain type or a supported alias.',
        { actual: describe(terrainId) });
    }

    if (!tiles.isValidVariant(terrainId, tile.variant)) {
      const definition = tiles.getTerrainDefinition(terrainId);
      const maximum = definition ? definition.variants - 1 : tiles.DEFAULT_VARIANTS - 1;
      addError(errors, MAP_ERROR_CODES.INVALID_VARIANT, path + '.variant',
        'Tile variant must be an integer within the terrain definition range.',
        {
          actual: describe(tile.variant),
          expected: 'integer from 0 to ' + maximum
        });
    }
  }

  function validateObject(object, path, width, height, seenIds, errors) {
    if (!isRecord(object)) {
      addError(errors, MAP_ERROR_CODES.INVALID_OBJECT, path,
        'Object must be an object with an id, kind, and grid anchor.',
        { actual: describe(object) });
      return;
    }

    const id = object.id;
    if (typeof id !== 'string' || id.trim().length === 0) {
      addError(errors, MAP_ERROR_CODES.INVALID_OBJECT_ID, path + '.id',
        'Object id must be a non-empty string.',
        { actual: describe(id) });
    } else if (seenIds[id]) {
      addError(errors, MAP_ERROR_CODES.DUPLICATE_OBJECT_ID, path + '.id',
        'Object id must be unique within the map.',
        { actual: describe(id) });
    } else {
      seenIds[id] = true;
    }

    if (mapData.OBJECT_KINDS.indexOf(object.kind) === -1) {
      addError(errors, MAP_ERROR_CODES.INVALID_OBJECT_KIND, path + '.kind',
        'Object kind must be one of the supported object kinds.',
        {
          actual: describe(object.kind),
          expected: mapData.OBJECT_KINDS.slice()
        });
    }

    if (!Number.isSafeInteger(object.col) || !Number.isSafeInteger(object.row) ||
        object.col < 0 || object.col >= width ||
        object.row < 0 || object.row >= height) {
      addError(errors, MAP_ERROR_CODES.OBJECT_OUT_OF_BOUNDS, path,
        'Object anchor must use integer col/row values inside the grid.',
        {
          actual: 'col ' + describe(object.col) + ', row ' + describe(object.row),
          expected: 'col 0-' + (width - 1) + ', row 0-' + (height - 1)
        });
    }

    if (!Number.isInteger(object.variant) || object.variant < 0 ||
        object.variant >= tiles.DEFAULT_VARIANTS) {
      addError(errors, MAP_ERROR_CODES.INVALID_VARIANT, path + '.variant',
        'Object variant must be an integer within the supported object range.',
        {
          actual: describe(object.variant),
          expected: 'integer from 0 to ' + (tiles.DEFAULT_VARIANTS - 1)
        });
    }
  }

  function validateMap(map) {
    const errors = [];

    if (!isRecord(map)) {
      addError(errors, MAP_ERROR_CODES.INVALID_MAP, 'map',
        'World map must be an object.',
        { actual: describe(map) });
      return errors;
    }

    if (map.name !== undefined && typeof map.name !== 'string') {
      addError(errors, MAP_ERROR_CODES.INVALID_NAME, 'name',
        'World map name must be a string when provided.',
        { actual: describe(map.name) });
    }

    const widthValid = isPositiveInteger(map.width);
    const heightValid = isPositiveInteger(map.height);
    if (!widthValid) {
      addError(errors, MAP_ERROR_CODES.INVALID_WIDTH, 'width',
        'World map width must be a positive safe integer.',
        { actual: describe(map.width) });
    }
    if (!heightValid) {
      addError(errors, MAP_ERROR_CODES.INVALID_HEIGHT, 'height',
        'World map height must be a positive safe integer.',
        { actual: describe(map.height) });
    }
    if (!widthValid || !heightValid) return errors;

    if (!Array.isArray(map.tiles)) {
      addError(errors, MAP_ERROR_CODES.INVALID_TILES, 'tiles',
        'World map tiles must be an array of row arrays.',
        { actual: describe(map.tiles) });
    } else {
      if (map.tiles.length !== map.height) {
        addError(errors, MAP_ERROR_CODES.INVALID_TILES, 'tiles',
          'World map tiles must contain exactly height rows.',
          {
            actual: map.tiles.length,
            expected: map.height
          });
      }

      const rowCount = Math.min(map.tiles.length, map.height);
      for (let row = 0; row < rowCount; row += 1) {
        const rowData = map.tiles[row];
        if (!Array.isArray(rowData)) {
          addError(errors, MAP_ERROR_CODES.INVALID_TILE_ROW, 'tiles[' + row + ']',
            'Tile row must be an array.',
            { actual: describe(rowData) });
          continue;
        }

        if (rowData.length !== map.width) {
          addError(errors, MAP_ERROR_CODES.INVALID_TILE_ROW, 'tiles[' + row + ']',
            'Tile row must contain exactly width tiles.',
            {
              actual: rowData.length,
              expected: map.width
            });
        }

        const colCount = Math.min(rowData.length, map.width);
        for (let col = 0; col < colCount; col += 1) {
          validateTile(rowData[col], 'tiles[' + row + '][' + col + ']', errors);
        }
      }
    }

    if (!Array.isArray(map.objects)) {
      addError(errors, MAP_ERROR_CODES.INVALID_OBJECTS, 'objects',
        'World map objects must be an array.',
        { actual: describe(map.objects) });
      return errors;
    }

    const seenIds = Object.create(null);
    for (let index = 0; index < map.objects.length; index += 1) {
      validateObject(
        map.objects[index],
        'objects[' + index + ']',
        map.width,
        map.height,
        seenIds,
        errors
      );
    }

    return errors;
  }

  function assertValidMap(map) {
    const errors = validateMap(map);
    if (errors.length === 0) return map;

    const suffix = errors.length === 1 ? '' : 's';
    const summary = errors.slice(0, 3).map((error) => (
      error.path + ': ' + error.message
    )).join('; ');
    const more = errors.length > 3
      ? ' (and ' + (errors.length - 3) + ' more)'
      : '';

    throw new WorldMapError(
      'Invalid world map (' + errors.length + ' error' + suffix + '): ' +
      summary + more,
      errors
    );
  }

  return {
    MAP_ERROR_CODES,
    WorldMapError,
    validateMap,
    assertValidMap
  };
});
