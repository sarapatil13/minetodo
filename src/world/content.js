(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const coords = isNode ? require('./coords.js') : root.CQ.worldCoords;
  const tiles = isNode ? require('./tiles.js') : root.CQ.worldTiles;
  const mapData = isNode ? require('./map.js') : root.CQ.worldMap;
  const validation = isNode ? require('./mapValidation.js') : root.CQ.worldMapValidation;
  const sceneData = isNode ? require('./scene.js') : root.CQ.worldScene;
  const progression = isNode ? require('./progression.js') : root.CQ.worldProgression;
  const selectableTargets = isNode
    ? require('./selectableTargets.js')
    : root.CQ.worldSelectableTargets;
  const api = factory(coords, tiles, mapData, validation, sceneData, progression, selectableTargets);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldContent = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  coords,
  tiles,
  mapData,
  validation,
  sceneData,
  progression,
  selectableTargets
) {
  'use strict';

  const ISSUE_CODES = Object.freeze({
    INVALID_BASE: 'INVALID_BASE',
    INVALID_STATE: 'INVALID_STATE',
    DUPLICATE_ID: 'DUPLICATE_ID',
    RESERVED_ID: 'RESERVED_ID',
    OCCUPIED_CELL: 'OCCUPIED_CELL',
    BOUNDS_CHANGED: 'BOUNDS_CHANGED',
    INVALID_MAP: 'INVALID_MAP',
    INVALID_TARGETS: 'INVALID_TARGETS'
  });

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isNonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value !== null && typeof value === 'object') {
      const clone = {};
      Object.keys(value).forEach((key) => { clone[key] = cloneValue(value[key]); });
      return clone;
    }
    return value;
  }

  function compareText(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  function compareCell(a, b) {
    return a.row - b.row || a.col - b.col;
  }

  function cellKey(col, row) {
    return col + ',' + row;
  }

  function boundsEqual(left, right) {
    if (!isRecord(left) || !isRecord(right)) return false;
    return ['minX', 'minY', 'maxX', 'maxY', 'width', 'height'].every((key) =>
      left[key] === right[key]
    );
  }

  function addIssue(issues, code, path, message, details) {
    issues.push(Object.freeze({
      code,
      path,
      message,
      details: details ? Object.freeze(details) : Object.freeze({})
    }));
  }

  function describeErrors(prefix, errors) {
    return prefix + errors.map((error) =>
      (error.path || 'map') + ': ' + (error.message || 'invalid')
    ).join('; ');
  }

  function appendErrors(issues, errors) {
    errors.forEach((error) => {
      addIssue(
        issues,
        error.code || ISSUE_CODES.INVALID_MAP,
        error.path || 'map',
        error.message || 'Invalid world data.',
        error.details
      );
    });
  }

  function emptyModifications() {
    return { objects: { placed: [], moved: [], removed: [] }, terrain: [] };
  }

  function readModifications(raw) {
    const source = isRecord(raw) ? raw : {};
    const objects = isRecord(source.objects) ? source.objects : {};
    return {
      objects: {
        placed: Array.isArray(objects.placed) ? objects.placed : [],
        moved: Array.isArray(objects.moved) ? objects.moved : [],
        removed: Array.isArray(objects.removed) ? objects.removed : []
      },
      terrain: Array.isArray(source.terrain) ? source.terrain : []
    };
  }

  function uniqueById(records, label, issues) {
    const groups = new Map();
    records.forEach((record, index) => {
      const path = label + '[' + index + ']';
      if (!isRecord(record) || !isNonEmptyString(record.id)) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path, 'Record must be an object with an id.');
        return;
      }
      if (!groups.has(record.id)) groups.set(record.id, []);
      groups.get(record.id).push({ record, path });
    });

    const result = [];
    groups.forEach((entries, id) => {
      if (entries.length > 1) {
        addIssue(issues, ISSUE_CODES.DUPLICATE_ID, label,
          'Duplicate id "' + id + '" was skipped; no record was chosen.', { id, count: entries.length });
        return;
      }
      result.push(entries[0]);
    });
    return result
      .sort((a, b) => compareText(a.record.id, b.record.id))
      .map((entry, index) => ({ record: entry.record, path: label + '[' + index + ']' }));
  }

  function uniqueByCell(records, label, issues) {
    const groups = new Map();
    records.forEach((record, index) => {
      const path = label + '[' + index + ']';
      if (!isRecord(record) || !Number.isSafeInteger(record.col) || !Number.isSafeInteger(record.row)) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path, 'Terrain patch must have integer col and row.');
        return;
      }
      const key = cellKey(record.col, record.row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ record, path });
    });

    const result = [];
    groups.forEach((entries, key) => {
      if (entries.length > 1) {
        addIssue(issues, ISSUE_CODES.DUPLICATE_ID, label,
          'Duplicate terrain anchor "' + key + '" was skipped; no patch was chosen.', { key, count: entries.length });
        return;
      }
      result.push(entries[0]);
    });
    return result
      .sort((a, b) => compareCell(a.record, b.record))
      .map((entry, index) => ({ record: entry.record, path: label + '[' + index + ']' }));
  }

  function reservedIds(baseMap) {
    const ids = new Set((baseMap.objects || []).map((object) => object.id));
    const content = progression.FEATURE_CONTENT || {};
    Object.keys(content).forEach((featureId) => {
      const objects = content[featureId] && content[featureId].objects;
      if (!Array.isArray(objects)) return;
      objects.forEach((object) => {
        if (isNonEmptyString(object.id)) ids.add(object.id);
      });
    });
    return ids;
  }

  function inBounds(col, row) {
    return Number.isSafeInteger(col) && Number.isSafeInteger(row) &&
      col >= 0 && col < mapData.WIDTH && row >= 0 && row < mapData.HEIGHT;
  }

  function failure(phase, issues, error) {
    return Object.freeze({
      ok: false,
      phase,
      issues: Object.freeze(issues.slice()),
      error: error || (issues.length ? describeErrors('World composition failed: ', issues) : 'World composition failed.')
    });
  }

  function compose(input) {
    const settings = input || {};
    const issues = [];
    const baseMap = settings.baseMap || mapData.createSampleMeadow();
    const baseErrors = validation.validateMap(baseMap);
    if (baseErrors.length) {
      appendErrors(issues, baseErrors);
      return failure('base', issues);
    }

    const xp = progression.normalizeXp(settings.xp);
    const origin = coords.normalizeOrigin(settings.origin);
    const tile = coords.normalizeTile(settings.tile);
    const sceneOptions = { origin, tile };

    let derivedMap;
    try {
      derivedMap = progression.composeProgressionMap(baseMap, xp);
    } catch (error) {
      addIssue(issues, ISSUE_CODES.INVALID_BASE, 'baseMap', error.message);
      return failure('progression', issues, error.message);
    }

    const expectedBounds = coords.sceneBounds(derivedMap, origin, tile);
    const boundsAfter = () => coords.sceneBounds(map, origin, tile);
    const map = cloneValue(derivedMap);
    const modifications = readModifications(settings.state);
    const reserved = reservedIds(baseMap);
    const usedIds = new Set(map.objects.map((object) => object.id));
    const usedCells = new Map();
    map.objects.forEach((object) => { usedCells.set(cellKey(object.col, object.row), object.id); });

    function acceptBoundsChange(path) {
      if (boundsEqual(boundsAfter(), expectedBounds)) return true;
      addIssue(issues, ISSUE_CODES.BOUNDS_CHANGED, path,
        'Modification would change scene bounds and was skipped.');
      return false;
    }

    // Terrain is applied first so later object changes see the final ground.
    uniqueByCell(modifications.terrain, 'terrain', issues).forEach(({ record, path }) => {
      if (!inBounds(record.col, record.row)) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path, 'Terrain anchor is outside the grid.');
        return;
      }
      if (mapData.TILE_TYPES.indexOf(record.type) === -1) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path + '.type', 'Unsupported terrain type.');
        return;
      }
      if (!isNonNegativeInteger(record.salt)) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path + '.salt', 'Terrain salt must be non-negative.');
        return;
      }
      const definition = tiles.getTerrainDefinition(record.type);
      map.tiles[record.row][record.col] = {
        type: record.type,
        variant: tiles.variantFor(record.col, record.row, record.salt, definition.variants)
      };
    });

    const removals = [];
    const removedSeen = new Set();
    modifications.objects.removed.forEach((id, index) => {
      const path = 'objects.removed[' + index + ']';
      if (!isNonEmptyString(id)) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path, 'Removal id must be a non-empty string.');
        return;
      }
      if (removedSeen.has(id)) {
        addIssue(issues, ISSUE_CODES.DUPLICATE_ID, path, 'Duplicate removal was skipped.', { id });
        return;
      }
      removedSeen.add(id);
      removals.push({ id, path });
    });
    const canonicalRemovals = removals
      .sort((a, b) => compareText(a.id, b.id))
      .map((entry, index) => ({ id: entry.id, path: 'objects.removed[' + index + ']' }));

    const placedUnique = uniqueById(modifications.objects.placed, 'objects.placed', issues);
    const movedUnique = uniqueById(modifications.objects.moved, 'objects.moved', issues);
    const placedIds = new Set(placedUnique.map((entry) => entry.record.id));
    const movedIds = new Set(movedUnique.map((entry) => entry.record.id));
    const conflicting = new Set();
    placedIds.forEach((id) => { if (removedSeen.has(id)) conflicting.add(id); });
    movedIds.forEach((id) => { if (removedSeen.has(id)) conflicting.add(id); });
    conflicting.forEach((id) => {
      addIssue(issues, ISSUE_CODES.DUPLICATE_ID, 'objects',
        'Id "' + id + '" appears in conflicting record lists and was skipped.', { id });
    });

    canonicalRemovals.forEach(({ id, path }) => {
      if (conflicting.has(id)) return;
      const index = map.objects.findIndex((object) => object.id === id);
      if (index === -1) return;
      const removed = map.objects[index];
      map.objects.splice(index, 1);
      if (!acceptBoundsChange(path)) {
        map.objects.splice(index, 0, removed);
        return;
      }
      usedIds.delete(id);
      usedCells.delete(cellKey(removed.col, removed.row));
    });

    placedUnique.forEach(({ record, path }) => {
      const id = record.id;
      if (conflicting.has(id)) return;
      if (reserved.has(id)) {
        addIssue(issues, ISSUE_CODES.RESERVED_ID, path + '.id',
          'User-created id collides with a reserved base or progression id.', { id });
        return;
      }
      if (id.indexOf('user:') !== 0 || id.length <= 'user:'.length) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path + '.id',
          'User-created id must use the "user:" namespace.');
        return;
      }
      if (mapData.OBJECT_KINDS.indexOf(record.kind) === -1) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path + '.kind', 'Unsupported object kind.');
        return;
      }
      if (!inBounds(record.col, record.row)) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path, 'Object anchor is outside the grid.');
        return;
      }
      if (!isNonNegativeInteger(record.salt)) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path + '.salt', 'Object salt must be non-negative.');
        return;
      }
      const key = cellKey(record.col, record.row);
      if (usedIds.has(id) || usedCells.has(key)) {
        addIssue(issues, ISSUE_CODES.OCCUPIED_CELL, path,
          'Object id or anchor is already occupied.', { id, key });
        return;
      }
      const object = {
        id,
        kind: record.kind,
        col: record.col,
        row: record.row,
        variant: tiles.variantFor(record.col, record.row, record.salt, tiles.DEFAULT_VARIANTS),
        metadata: { source: 'user' }
      };
      map.objects.push(object);
      if (!acceptBoundsChange(path)) {
        map.objects.pop();
        return;
      }
      usedIds.add(id);
      usedCells.set(key, id);
    });

    movedUnique.forEach(({ record, path }) => {
      const id = record.id;
      if (conflicting.has(id)) return;
      if (!inBounds(record.col, record.row)) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path, 'Move anchor is outside the grid.');
        return;
      }
      if (!isNonNegativeInteger(record.salt)) {
        addIssue(issues, ISSUE_CODES.INVALID_STATE, path + '.salt', 'Move salt must be non-negative.');
        return;
      }
      const object = map.objects.find((item) => item.id === id);
      if (!object) return;
      const oldKey = cellKey(object.col, object.row);
      const newKey = cellKey(record.col, record.row);
      if (oldKey !== newKey && usedCells.has(newKey)) {
        addIssue(issues, ISSUE_CODES.OCCUPIED_CELL, path,
          'Move anchor is already occupied.', { id, key: newKey });
        return;
      }
      const previous = { col: object.col, row: object.row, variant: object.variant };
      object.col = record.col;
      object.row = record.row;
      object.variant = tiles.variantFor(record.col, record.row, record.salt, tiles.DEFAULT_VARIANTS);
      if (!acceptBoundsChange(path)) {
        object.col = previous.col;
        object.row = previous.row;
        object.variant = previous.variant;
        return;
      }
      usedCells.delete(oldKey);
      usedCells.set(newKey, id);
    });

    const mapErrors = validation.validateMap(map);
    if (mapErrors.length) {
      appendErrors(issues, mapErrors);
      return failure('map', issues);
    }

    const scene = sceneData.createScene(map, sceneOptions);
    const targetIndex = selectableTargets.buildSelectableTargets(scene, settings.targetOptions);
    if (targetIndex.issues.length) {
      appendErrors(issues, targetIndex.issues);
      return failure('targets', issues);
    }
    if (!boundsEqual(scene.bounds, expectedBounds)) {
      addIssue(issues, ISSUE_CODES.BOUNDS_CHANGED, 'scene', 'Final scene bounds changed.');
      return failure('bounds', issues);
    }

    return Object.freeze({
      ok: true,
      phase: 'complete',
      xp,
      map,
      scene,
      targetIndex,
      issues: Object.freeze(issues.slice()),
      skipped: issues.length
    });
  }

  function composeMap(input) {
    const result = compose(input);
    if (!result.ok) throw new Error(result.error);
    return result.map;
  }

  function composeScene(input) {
    const result = compose(input);
    if (!result.ok) throw new Error(result.error);
    return result.scene;
  }

  return Object.freeze({
    ISSUE_CODES,
    emptyModifications,
    reservedIds,
    compose,
    composeMap,
    composeScene
  });
});
