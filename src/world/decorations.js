(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const catalog = isNode ? require('./contentCatalog.js') : root.CQ.worldContentCatalog;
  const unlocks = isNode ? require('./unlocks.js') : root.CQ.worldUnlocks;
  const biomes = isNode ? require('./biomeCatalog.js') : root.CQ.worldBiomeCatalog;
  const mapData = isNode ? require('./map.js') : root.CQ.worldMap;
  const api = factory(isNode, root, catalog, unlocks, biomes, mapData);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).decorations = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  isNode,
  root,
  catalog,
  unlocks,
  biomes,
  mapData
) {
  'use strict';

  const ISSUE_CODES = Object.freeze({
    INVALID_STATE: 'INVALID_STATE',
    UNKNOWN_ITEM: 'UNKNOWN_ITEM',
    LOCKED: 'LOCKED',
    NOT_OWNED: 'NOT_OWNED',
    ALREADY_PLACED: 'ALREADY_PLACED',
    UNKNOWN_PLACEMENT: 'UNKNOWN_PLACEMENT',
    INCOMPATIBLE_BIOME: 'INCOMPATIBLE_BIOME',
    UNKNOWN_BIOME: 'UNKNOWN_BIOME',
    BIOME_LOCKED: 'BIOME_LOCKED',
    OCCUPIED_CELL: 'OCCUPIED_CELL',
    OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
    INVALID_CELL: 'INVALID_CELL'
  });

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (isRecord(value)) {
      const result = {};
      Object.keys(value).forEach((key) => { result[key] = clone(value[key]); });
      return result;
    }
    return value;
  }

  function addIssue(issues, code, path, message, details) {
    issues.push(Object.freeze({
      code,
      path,
      message,
      details: details ? Object.freeze(details) : Object.freeze({})
    }));
  }

  function result(ok, state, issues, extra) {
    return Object.freeze(Object.assign({
      ok,
      state: state || null,
      issues: Object.freeze(issues.slice())
    }, extra || {}));
  }

  function stateModule(options) {
    if (options && options.worldState) return options.worldState;
    if (isNode) return require('../worldState.js');
    return root && root.CQ ? root.CQ.worldState : null;
  }

  function checkedState(state, options, issues, path) {
    const api = stateModule(options);
    if (!api || typeof api.validateV2State !== 'function') {
      addIssue(issues, ISSUE_CODES.INVALID_STATE, path, 'World state v2 module is unavailable.');
      return null;
    }
    const checked = api.validateV2State(state);
    if (!checked.ok) {
      checked.issues.forEach((issue) => {
        addIssue(issues, issue.code || ISSUE_CODES.INVALID_STATE, issue.path || path,
          issue.message || 'Invalid world state.', issue.details);
      });
      return null;
    }
    return checked.state;
  }

  function evaluationFor(state, options, key) {
    const settings = options || {};
    if (settings[key]) return settings[key];
    const base = { worldState: state };
    ['taskState', 'xp', 'completedTasks', 'ledgerEntries', 'grants'].forEach((name) => {
      if (settings[name] !== undefined) base[name] = settings[name];
    });
    return key === 'biomeEvaluation'
      ? biomes.evaluateUnlocks(base)
      : unlocks.evaluate(base);
  }

  function cellFrom(cell) {
    return isRecord(cell) && Number.isSafeInteger(cell.col) && Number.isSafeInteger(cell.row)
      ? { col: cell.col, row: cell.row }
      : null;
  }

  function hashSalt(text) {
    let hash = 2166136261;
    const source = String(text);
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash % 1000000007;
  }

  function saltFor(cell, id, options) {
    if (options && Number.isSafeInteger(options.salt) && options.salt >= 0) return options.salt;
    return hashSalt(id + ':' + cell.col + ':' + cell.row);
  }

  function ownedById(state, id) {
    return state.ownership.items.find((item) => item.id === id) || null;
  }

  function ownedForCatalog(state, catalogId) {
    return state.ownership.items.find((item) => item.catalogId === catalogId) || null;
  }

  function allPlacements(state) {
    const found = [];
    Object.keys(state.biomes).sort().forEach((biomeId) => {
      state.biomes[biomeId].objects.placed.forEach((record) => {
        found.push({ biomeId, record });
      });
    });
    return found;
  }

  function placementIn(state, biomeId, placementId) {
    const delta = state.biomes[biomeId];
    if (!delta) return null;
    return delta.objects.placed.find((record) => record.id === placementId) || null;
  }

  function sentinelFailure(issues) {
    return result(false, null, issues);
  }

  function acquire(state, catalogId, options) {
    const settings = options || {};
    const issues = [];
    const valid = checkedState(state, settings, issues, 'state');
    if (!valid) return sentinelFailure(issues);

    const item = catalog.getItem(catalogId);
    if (!item) {
      addIssue(issues, ISSUE_CODES.UNKNOWN_ITEM, 'catalogId', 'Catalog item is not defined.', { id: catalogId });
      return sentinelFailure(issues);
    }
    const evaluation = evaluationFor(valid, settings, 'evaluation');
    if (!unlocks.isUnlocked(catalogId, evaluation)) {
      addIssue(issues, ISSUE_CODES.LOCKED, 'catalogId', 'Catalog item is not unlocked yet.', { id: catalogId });
      return sentinelFailure(issues);
    }

    const api = stateModule(settings);
    const id = isNonEmptyString(settings.ownedId)
      ? settings.ownedId
      : api.createOwnedId();
    if (ownedById(valid, id)) {
      addIssue(issues, ISSUE_CODES.NOT_OWNED, 'ownedId', 'Owned instance id is already in use.', { id });
      return sentinelFailure(issues);
    }

    const next = clone(valid);
    next.ownership.items.push(Object.freeze({
      id,
      catalogId: item.id,
      acquiredAt: typeof settings.now === 'string' ? settings.now : '',
      source: isNonEmptyString(settings.source) ? settings.source : 'acquired'
    }));
    const committed = checkedState(next, settings, issues, 'state');
    if (!committed) return sentinelFailure(issues);
    return result(true, committed, issues, { ownedId: id });
  }

  function place(state, ownedId, cell, options) {
    const settings = options || {};
    const issues = [];
    const valid = checkedState(state, settings, issues, 'state');
    if (!valid) return sentinelFailure(issues);

    const owned = ownedById(valid, ownedId);
    if (!owned) {
      addIssue(issues, ISSUE_CODES.NOT_OWNED, 'ownedId', 'Owned instance does not exist.', { id: ownedId });
      return sentinelFailure(issues);
    }
    const item = catalog.getItem(owned.catalogId);
    if (!item) {
      addIssue(issues, ISSUE_CODES.UNKNOWN_ITEM, 'ownedId', 'Owned instance has no catalog item.', { id: owned.catalogId });
      return sentinelFailure(issues);
    }
    const biomeId = valid.activeBiome;
    if (!biomes.getBiome(biomeId)) {
      addIssue(issues, ISSUE_CODES.UNKNOWN_BIOME, 'activeBiome', 'Active biome is not defined.', { id: biomeId });
      return sentinelFailure(issues);
    }
    const biomeEvaluation = evaluationFor(valid, settings, 'biomeEvaluation');
    if (!unlocks.isUnlocked(biomeId, biomeEvaluation)) {
      addIssue(issues, ISSUE_CODES.BIOME_LOCKED, 'activeBiome', 'Active biome is not unlocked.', { id: biomeId });
      return sentinelFailure(issues);
    }
    const evaluation = evaluationFor(valid, settings, 'evaluation');
    if (!unlocks.isUnlocked(item.id, evaluation)) {
      addIssue(issues, ISSUE_CODES.LOCKED, 'catalogId', 'Owned item is not unlocked yet.', { id: item.id });
      return sentinelFailure(issues);
    }
    if (!biomes.supportsItem(biomeId, item.id)) {
      addIssue(issues, ISSUE_CODES.INCOMPATIBLE_BIOME, 'catalogId',
        'Catalog item is not compatible with the active biome.', { id: item.id, biome: biomeId });
      return sentinelFailure(issues);
    }
    const anchor = cellFrom(cell);
    if (!anchor) {
      addIssue(issues, ISSUE_CODES.INVALID_CELL, 'cell', 'Placement cell needs integer col and row.');
      return sentinelFailure(issues);
    }
    if (anchor.col < 0 || anchor.col >= mapData.WIDTH || anchor.row < 0 || anchor.row >= mapData.HEIGHT) {
      addIssue(issues, ISSUE_CODES.OUT_OF_BOUNDS, 'cell', 'Placement cell is outside the world grid.', anchor);
      return sentinelFailure(issues);
    }
    const existing = allPlacements(valid);
    if (existing.some((entry) => entry.record.ownedId === owned.id)) {
      addIssue(issues, ISSUE_CODES.ALREADY_PLACED, 'ownedId',
        'An owned instance may be placed at most once across all biomes.', { id: owned.id });
      return sentinelFailure(issues);
    }

    const api = stateModule(settings);
    const id = isNonEmptyString(settings.placementId)
      ? settings.placementId
      : api.createPlacementId();
    if (existing.some((entry) => entry.record.id === id)) {
      addIssue(issues, ISSUE_CODES.ALREADY_PLACED, 'placementId', 'Placement id is already in use.', { id });
      return sentinelFailure(issues);
    }
    if (valid.biomes[biomeId].objects.placed.some((record) =>
      record.col === anchor.col && record.row === anchor.row)) {
      addIssue(issues, ISSUE_CODES.OCCUPIED_CELL, 'cell', 'Placement cell is already occupied.', anchor);
      return sentinelFailure(issues);
    }

    const next = clone(valid);
    next.biomes[biomeId].objects.placed.push(Object.freeze({
      id,
      ownedId: owned.id,
      kind: item.kind,
      col: anchor.col,
      row: anchor.row,
      salt: saltFor(anchor, id, settings)
    }));
    const committed = checkedState(next, settings, issues, 'state');
    if (!committed) return sentinelFailure(issues);
    return result(true, committed, issues, { placementId: id, ownedId: owned.id });
  }

  function move(state, placementId, cell, options) {
    const settings = options || {};
    const issues = [];
    const valid = checkedState(state, settings, issues, 'state');
    if (!valid) return sentinelFailure(issues);

    const biomeId = valid.activeBiome;
    const found = placementIn(valid, biomeId, placementId);
    if (!found) {
      addIssue(issues, ISSUE_CODES.UNKNOWN_PLACEMENT, 'placementId',
        'Placement does not exist in the active biome.', { id: placementId });
      return sentinelFailure(issues);
    }
    const anchor = cellFrom(cell);
    if (!anchor) {
      addIssue(issues, ISSUE_CODES.INVALID_CELL, 'cell', 'Move cell needs integer col and row.');
      return sentinelFailure(issues);
    }
    if (anchor.col < 0 || anchor.col >= mapData.WIDTH || anchor.row < 0 || anchor.row >= mapData.HEIGHT) {
      addIssue(issues, ISSUE_CODES.OUT_OF_BOUNDS, 'cell', 'Move cell is outside the world grid.', anchor);
      return sentinelFailure(issues);
    }
    if (valid.biomes[biomeId].objects.placed.some((record) =>
      record.id !== placementId && record.col === anchor.col && record.row === anchor.row)) {
      addIssue(issues, ISSUE_CODES.OCCUPIED_CELL, 'cell', 'Move cell is already occupied.', anchor);
      return sentinelFailure(issues);
    }

    const next = clone(valid);
    const target = next.biomes[biomeId].objects.placed.find((record) => record.id === placementId);
    target.col = anchor.col;
    target.row = anchor.row;
    target.salt = saltFor(anchor, placementId, settings);
    const committed = checkedState(next, settings, issues, 'state');
    if (!committed) return sentinelFailure(issues);
    return result(true, committed, issues, { placementId, ownedId: target.ownedId });
  }

  function remove(state, placementId, options) {
    const settings = options || {};
    const issues = [];
    const valid = checkedState(state, settings, issues, 'state');
    if (!valid) return sentinelFailure(issues);

    const biomeId = valid.activeBiome;
    const found = placementIn(valid, biomeId, placementId);
    if (!found) {
      addIssue(issues, ISSUE_CODES.UNKNOWN_PLACEMENT, 'placementId',
        'Placement does not exist in the active biome.', { id: placementId });
      return sentinelFailure(issues);
    }

    const next = clone(valid);
    const placed = next.biomes[biomeId].objects.placed;
    const index = placed.findIndex((record) => record.id === placementId);
    placed.splice(index, 1);
    const committed = checkedState(next, settings, issues, 'state');
    if (!committed) return sentinelFailure(issues);
    return result(true, committed, issues, { ownedId: found.ownedId });
  }

  function switchBiome(state, biomeId, options) {
    const settings = options || {};
    const issues = [];
    const valid = checkedState(state, settings, issues, 'state');
    if (!valid) return sentinelFailure(issues);

    if (!biomes.getBiome(biomeId)) {
      addIssue(issues, ISSUE_CODES.UNKNOWN_BIOME, 'biomeId', 'Biome is not defined.', { id: biomeId });
      return sentinelFailure(issues);
    }
    const evaluation = evaluationFor(valid, settings, 'biomeEvaluation');
    if (!unlocks.isUnlocked(biomeId, evaluation)) {
      addIssue(issues, ISSUE_CODES.BIOME_LOCKED, 'biomeId', 'Biome is not unlocked yet.', { id: biomeId });
      return sentinelFailure(issues);
    }

    const next = clone(valid);
    next.activeBiome = biomeId;
    const committed = checkedState(next, settings, issues, 'state');
    if (!committed) return sentinelFailure(issues);
    return result(true, committed, issues, { biomeId });
  }

  function syncAutoGrants(state, options) {
    const settings = options || {};
    const issues = [];
    const valid = checkedState(state, settings, issues, 'state');
    if (!valid) return sentinelFailure(issues);

    const evaluation = evaluationFor(valid, settings, 'evaluation');
    const next = clone(valid);
    const added = [];
    catalog.all().forEach((item) => {
      if (item.autoGrant !== true || !unlocks.isUnlocked(item.id, evaluation)) return;
      const id = 'user:item:auto:' + item.id;
      if (ownedById(next, id)) return;
      next.ownership.items.push(Object.freeze({
        id,
        catalogId: item.id,
        acquiredAt: typeof settings.now === 'string' ? settings.now : '',
        source: 'auto-grant'
      }));
      added.push(id);
    });
    const committed = checkedState(next, settings, issues, 'state');
    if (!committed) return sentinelFailure(issues);
    return result(true, committed, issues, { added: Object.freeze(added) });
  }

  // Composition input uses the v1 delta shape expected by world.content.
  // Incompatible or locked placements are skipped here with issues, while the
  // persisted v2 state keeps them untouched for a later compatible biome.
  function activeModifications(state, options) {
    const settings = options || {};
    const issues = [];
    const valid = checkedState(state, settings, issues, 'state');
    if (!valid) return sentinelFailure(issues);

    const biomeId = valid.activeBiome;
    const delta = valid.biomes[biomeId];
    const evaluation = settings.enforceUnlocks === false
      ? null
      : evaluationFor(valid, settings, 'evaluation');
    const placed = [];
    const skipped = [];

    delta.objects.placed.forEach((record) => {
      const owned = ownedById(valid, record.ownedId);
      const item = owned ? catalog.getItem(owned.catalogId) : null;
      if (!item) {
        addIssue(issues, ISSUE_CODES.UNKNOWN_ITEM, biomeId + '.objects.placed.' + record.id,
          'Saved placement has no catalog item.', { id: record.id });
        skipped.push(record.id);
        return;
      }
      if (!biomes.supportsItem(biomeId, item.id)) {
        addIssue(issues, ISSUE_CODES.INCOMPATIBLE_BIOME, biomeId + '.objects.placed.' + record.id,
          'Saved placement is incompatible with the active biome and was skipped.',
          { id: record.id, catalogId: item.id });
        skipped.push(record.id);
        return;
      }
      if (evaluation && !unlocks.isUnlocked(item.id, evaluation)) {
        addIssue(issues, ISSUE_CODES.LOCKED, biomeId + '.objects.placed.' + record.id,
          'Saved placement is still locked and was skipped.', { id: record.id, catalogId: item.id });
        skipped.push(record.id);
        return;
      }
      placed.push(Object.freeze({
        id: record.id,
        kind: record.kind,
        col: record.col,
        row: record.row,
        salt: record.salt
      }));
    });

    return result(true, valid, issues, {
      biomeId,
      modifications: Object.freeze({
        objects: Object.freeze({
          placed: Object.freeze(placed),
          moved: Object.freeze(clone(delta.objects.moved)),
          removed: Object.freeze(delta.objects.removed.slice())
        }),
        terrain: Object.freeze(clone(delta.terrain))
      }),
      skipped: Object.freeze(skipped)
    });
  }

  return Object.freeze({
    ISSUE_CODES,
    acquire,
    place,
    move,
    remove,
    switchBiome,
    syncAutoGrants,
    activeModifications
  });
});
