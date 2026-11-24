(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const world = isNode ? require('./world/index.js') : root.CQ.world;
  const api = factory(root, world);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldState = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, world) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const SCHEMA_VERSION_V2 = 2;
  const KEY = 'cozyquest.world-state.v1';
  const KEY_V2 = 'cozyquest.world-state.v2';
  const INVALID_PREFIX = 'cozyquest.invalid-world-backup.';
  const BACKUP_PREFIX = 'cozyquest.world-backup.';
  const MAX_BACKUPS = 3;
  const DEFAULT_WORLD_ID = 'meadow-haven';
  const DEFAULT_BASE_MAP_ID = 'sample-meadow-v1';
  const DEFAULT_NAME = 'Meadow Haven';
  const DEFAULT_BIOME = 'meadow';
  const USER_ID_PREFIX = 'user:';
  const OWNED_ID_PREFIX = 'user:item:';
  const PLACEMENT_ID_PREFIX = 'user:placement:';
  const GRANT_SOURCES = Object.freeze(['event', 'purchase', 'achievement']);

  const ISSUE_CODES = Object.freeze({
    INVALID_STATE: 'INVALID_STATE',
    UNSUPPORTED_SCHEMA: 'UNSUPPORTED_SCHEMA',
    UNEXPECTED_FIELD: 'UNEXPECTED_FIELD',
    INVALID_FIELD: 'INVALID_FIELD',
    INVALID_RECORD: 'INVALID_RECORD',
    DUPLICATE_RECORD: 'DUPLICATE_RECORD',
    RESERVED_ID: 'RESERVED_ID',
    CONFLICTING_RECORD: 'CONFLICTING_RECORD',
    UNSUPPORTED_KIND: 'UNSUPPORTED_KIND',
    OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
    INVALID_SALT: 'INVALID_SALT',
    UNSUPPORTED_TERRAIN: 'UNSUPPORTED_TERRAIN',
    UNKNOWN_CATALOG_ID: 'UNKNOWN_CATALOG_ID',
    INVALID_OWNER: 'INVALID_OWNER',
    INCOMPATIBLE_ITEM: 'INCOMPATIBLE_ITEM',
    DUPLICATE_PLACEMENT: 'DUPLICATE_PLACEMENT',
    UNKNOWN_BIOME: 'UNKNOWN_BIOME'
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

  function isTimestamp(value) {
    return value === '' || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
  }

  function addIssue(issues, code, path, message, details) {
    issues.push(Object.freeze({
      code,
      path,
      message,
      details: details ? Object.freeze(details) : Object.freeze({})
    }));
  }

  function fail(rawIssues, structural) {
    return Object.freeze({
      ok: false,
      state: emptyState(),
      issues: Object.freeze(rawIssues.slice()),
      structural: structural !== false
    });
  }

  function emptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      worldId: DEFAULT_WORLD_ID,
      baseMapId: DEFAULT_BASE_MAP_ID,
      name: DEFAULT_NAME,
      createdAt: '',
      updatedAt: '',
      objects: { placed: [], moved: [], removed: [] },
      terrain: []
    };
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (isRecord(value)) {
      const result = {};
      Object.keys(value).forEach((key) => { result[key] = cloneValue(value[key]); });
      return result;
    }
    return value;
  }

  function biomeIds() {
    if (!world || !world.biomeCatalog || typeof world.biomeCatalog.all !== 'function') return [];
    return world.biomeCatalog.all().map((biome) => biome.id);
  }

  function emptyBiomeDelta() {
    return { objects: { placed: [], moved: [], removed: [] }, terrain: [] };
  }

  function emptyV2State() {
    const biomes = {};
    biomeIds().forEach((id) => { biomes[id] = emptyBiomeDelta(); });
    return {
      schemaVersion: SCHEMA_VERSION_V2,
      worldId: DEFAULT_WORLD_ID,
      baseMapId: DEFAULT_BASE_MAP_ID,
      name: DEFAULT_NAME,
      createdAt: '',
      updatedAt: '',
      activeBiome: DEFAULT_BIOME,
      unlocks: [],
      ownership: { items: [] },
      biomes
    };
  }

  function failV2(rawIssues, structural) {
    return Object.freeze({
      ok: false,
      state: emptyV2State(),
      issues: Object.freeze(rawIssues.slice()),
      structural: structural !== false
    });
  }

  function keyForState(state) {
    return isRecord(state) && state.schemaVersion === SCHEMA_VERSION_V2 ? KEY_V2 : KEY;
  }

  function knownItemId(catalogId) {
    return world && world.contentCatalog && typeof world.contentCatalog.getItem === 'function'
      ? world.contentCatalog.getItem(catalogId)
      : null;
  }

  function knownCatalogId(catalogId) {
    return Boolean(knownItemId(catalogId) || (world && world.biomeCatalog &&
      typeof world.biomeCatalog.getBiome === 'function' && world.biomeCatalog.getBiome(catalogId)));
  }

  function reservedIds() {
    const base = world.map.createSampleMeadow();
    const ids = new Set(base.objects.map((object) => object.id));
    const content = world.progression.FEATURE_CONTENT || {};
    Object.keys(content).forEach((featureId) => {
      const objects = content[featureId] && content[featureId].objects;
      if (!Array.isArray(objects)) return;
      objects.forEach((object) => {
        if (isNonEmptyString(object.id)) ids.add(object.id);
      });
    });
    return ids;
  }

  function compareText(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  function compareCell(a, b) {
    return a.row - b.row || a.col - b.col;
  }

  function groupById(records, label, issues) {
    const groups = new Map();
    records.forEach((record, index) => {
      const path = label + '[' + index + ']';
      if (!isRecord(record)) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path, 'Record must be an object.');
        return;
      }
      const id = record.id;
      if (!isNonEmptyString(id)) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path + '.id', 'Record id must be a non-empty string.');
        return;
      }
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push({ record, path });
    });

    const unique = [];
    groups.forEach((entries, id) => {
      if (entries.length > 1) {
        addIssue(issues, ISSUE_CODES.DUPLICATE_RECORD, label,
          'Duplicate id "' + id + '" was skipped; no record was chosen.', { id, count: entries.length });
        return;
      }
      unique.push(entries[0]);
    });
    return unique.sort((a, b) => compareText(a.record.id, b.record.id));
  }

  function groupByCell(records, label, issues) {
    const groups = new Map();
    records.forEach((record, index) => {
      const path = label + '[' + index + ']';
      if (!isRecord(record)) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path, 'Record must be an object.');
        return;
      }
      if (!Number.isSafeInteger(record.col) || !Number.isSafeInteger(record.row)) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path, 'Terrain anchor must use safe integers.');
        return;
      }
      const key = record.col + ',' + record.row;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ record, path });
    });

    const unique = [];
    groups.forEach((entries, key) => {
      if (entries.length > 1) {
        addIssue(issues, ISSUE_CODES.DUPLICATE_RECORD, label,
          'Duplicate terrain anchor "' + key + '" was skipped; no patch was chosen.', { key, count: entries.length });
        return;
      }
      unique.push(entries[0]);
    });
    return unique.sort((a, b) => compareCell(a.record, b.record));
  }

  function validatePlaced(records, issues, label) {
    const pathLabel = label || 'objects.placed';
    const reserved = reservedIds();
    const accepted = [];
    groupById(records, pathLabel, issues).forEach(({ record, path }) => {
      const id = record.id;
      if (reserved.has(id)) {
        addIssue(issues, ISSUE_CODES.RESERVED_ID, path + '.id',
          'User-created object id collides with a base or progression id.', { id });
        return;
      }
      if (id.indexOf(USER_ID_PREFIX) !== 0 || id.length <= USER_ID_PREFIX.length) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path + '.id',
          'User-created object id must use the "user:" namespace.');
        return;
      }
      if (world.map.OBJECT_KINDS.indexOf(record.kind) === -1) {
        addIssue(issues, ISSUE_CODES.UNSUPPORTED_KIND, path + '.kind',
          'Object kind is not supported.', { actual: String(record.kind) });
        return;
      }
      if (!Number.isSafeInteger(record.col) || !Number.isSafeInteger(record.row) ||
          record.col < 0 || record.col >= world.map.WIDTH ||
          record.row < 0 || record.row >= world.map.HEIGHT) {
        addIssue(issues, ISSUE_CODES.OUT_OF_BOUNDS, path,
          'Object anchor must be inside the base grid.');
        return;
      }
      if (!isNonNegativeInteger(record.salt)) {
        addIssue(issues, ISSUE_CODES.INVALID_SALT, path + '.salt',
          'Object salt must be a non-negative safe integer.');
        return;
      }
      accepted.push(Object.freeze({
        id,
        kind: record.kind,
        col: record.col,
        row: record.row,
        salt: record.salt
      }));
    });
    return accepted;
  }

  function validateMoved(records, issues, label) {
    const accepted = [];
    groupById(records, label || 'objects.moved', issues).forEach(({ record, path }) => {
      if (!Number.isSafeInteger(record.col) || !Number.isSafeInteger(record.row) ||
          record.col < 0 || record.col >= world.map.WIDTH ||
          record.row < 0 || record.row >= world.map.HEIGHT) {
        addIssue(issues, ISSUE_CODES.OUT_OF_BOUNDS, path,
          'Move anchor must be inside the base grid.');
        return;
      }
      if (!isNonNegativeInteger(record.salt)) {
        addIssue(issues, ISSUE_CODES.INVALID_SALT, path + '.salt',
          'Move salt must be a non-negative safe integer.');
        return;
      }
      accepted.push(Object.freeze({
        id: record.id,
        col: record.col,
        row: record.row,
        salt: record.salt
      }));
    });
    return accepted;
  }

  function validateRemoved(records, issues, label) {
    const accepted = [];
    const seen = new Set();
    const pathLabel = label || 'objects.removed';
    records.forEach((id, index) => {
      const path = pathLabel + '[' + index + ']';
      if (!isNonEmptyString(id)) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path, 'Removal id must be a non-empty string.');
        return;
      }
      if (seen.has(id)) {
        addIssue(issues, ISSUE_CODES.DUPLICATE_RECORD, path,
          'Duplicate removal id was skipped.', { id });
        return;
      }
      seen.add(id);
      accepted.push(id);
    });
    return accepted.sort(compareText);
  }

  function validateTerrain(records, issues, label) {
    const accepted = [];
    groupByCell(records, label || 'terrain', issues).forEach(({ record, path }) => {
      if (world.map.TILE_TYPES.indexOf(record.type) === -1) {
        addIssue(issues, ISSUE_CODES.UNSUPPORTED_TERRAIN, path + '.type',
          'Terrain type is not supported by the current renderer.', { actual: String(record.type) });
        return;
      }
      if (!isNonNegativeInteger(record.salt)) {
        addIssue(issues, ISSUE_CODES.INVALID_SALT, path + '.salt',
          'Terrain salt must be a non-negative safe integer.');
        return;
      }
      accepted.push(Object.freeze({
        col: record.col,
        row: record.row,
        type: record.type,
        salt: record.salt
      }));
    });
    return accepted;
  }

  function resolveConflicts(state, issues, label) {
    const pathLabel = label || 'objects';
    const placed = new Set(state.objects.placed.map((record) => record.id));
    const moved = new Set(state.objects.moved.map((record) => record.id));
    const removed = new Set(state.objects.removed);
    const conflicting = new Set();

    placed.forEach((id) => {
      if (removed.has(id)) conflicting.add(id);
    });
    moved.forEach((id) => {
      if (removed.has(id)) conflicting.add(id);
    });

    conflicting.forEach((id) => {
      addIssue(issues, ISSUE_CODES.CONFLICTING_RECORD, pathLabel,
        'Id "' + id + '" appears in conflicting record lists and was skipped.', { id });
    });

    state.objects.placed = state.objects.placed.filter((record) => !conflicting.has(record.id));
    state.objects.moved = state.objects.moved.filter((record) => !conflicting.has(record.id));
    state.objects.removed = state.objects.removed.filter((id) => !conflicting.has(id));
    return state;
  }

  function validateState(raw) {
    const structural = [];
    if (!isRecord(raw)) return fail(['world state is not an object']);
    if (raw.schemaVersion !== SCHEMA_VERSION) {
      return fail(['unsupported world schemaVersion: ' + String(raw.schemaVersion)]);
    }

    const allowed = [
      'schemaVersion', 'worldId', 'baseMapId', 'name',
      'createdAt', 'updatedAt', 'objects', 'terrain'
    ];
    Object.keys(raw).forEach((key) => {
      if (allowed.indexOf(key) === -1) {
        addIssue(structural, ISSUE_CODES.UNEXPECTED_FIELD, key,
          'Unexpected world state field. Derived application state must not be persisted.');
      }
    });

    if (!isNonEmptyString(raw.worldId)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'worldId', 'World id must be a non-empty string.');
    }
    if (!isNonEmptyString(raw.baseMapId)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'baseMapId', 'Base map id must be a non-empty string.');
    }
    if (!isNonEmptyString(raw.name)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'name', 'World name must be a non-empty string.');
    }
    if (!isTimestamp(raw.createdAt)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'createdAt', 'createdAt must be an ISO timestamp or empty.');
    }
    if (!isTimestamp(raw.updatedAt)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'updatedAt', 'updatedAt must be an ISO timestamp or empty.');
    }
    if (!isRecord(raw.objects)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'objects', 'objects must be an object.');
    } else {
      ['placed', 'moved', 'removed'].forEach((key) => {
        if (!Array.isArray(raw.objects[key])) {
          addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'objects.' + key,
            'objects.' + key + ' must be an array.');
        }
      });
      Object.keys(raw.objects).forEach((key) => {
        if (['placed', 'moved', 'removed'].indexOf(key) === -1) {
          addIssue(structural, ISSUE_CODES.UNEXPECTED_FIELD, 'objects.' + key,
            'Unexpected objects field.');
        }
      });
    }
    if (!Array.isArray(raw.terrain)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'terrain', 'terrain must be an array.');
    }
    if (structural.length) return fail(structural);

    const issues = [];
    const state = {
      schemaVersion: SCHEMA_VERSION,
      worldId: raw.worldId,
      baseMapId: raw.baseMapId,
      name: raw.name,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      objects: {
        placed: validatePlaced(raw.objects.placed, issues),
        moved: validateMoved(raw.objects.moved, issues),
        removed: validateRemoved(raw.objects.removed, issues)
      },
      terrain: validateTerrain(raw.terrain, issues)
    };
    resolveConflicts(state, issues);

    return Object.freeze({
      ok: true,
      state: Object.freeze(state),
      issues: Object.freeze(issues.slice()),
      structural: false
    });
  }

  function ownedIdForLegacy(placementId) {
    if (typeof placementId === 'string' && placementId.indexOf(USER_ID_PREFIX) === 0) {
      return OWNED_ID_PREFIX + placementId.slice(USER_ID_PREFIX.length);
    }
    return OWNED_ID_PREFIX + String(placementId);
  }

  function validateGrants(records, issues) {
    const accepted = [];
    groupById(records, 'unlocks', issues).forEach(({ record, path }) => {
      if (!knownCatalogId(record.catalogId)) {
        addIssue(issues, ISSUE_CODES.UNKNOWN_CATALOG_ID, path + '.catalogId',
          'Explicit grant must reference a known catalog item or biome.', { id: record.catalogId });
        return;
      }
      if (GRANT_SOURCES.indexOf(record.source) === -1) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path + '.source',
          'Explicit grant source is not supported.', { actual: String(record.source) });
        return;
      }
      if (record.source === 'event' && !isNonEmptyString(record.eventId)) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path + '.eventId', 'Event grant needs an event id.');
        return;
      }
      if (record.source === 'purchase' && !isNonEmptyString(record.sku)) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path + '.sku', 'Purchase grant needs a SKU.');
        return;
      }
      if (record.source === 'achievement' &&
          (!isNonEmptyString(record.achievementId) ||
           !world.unlocks || !Object.prototype.hasOwnProperty.call(
             world.unlocks.ACHIEVEMENTS, record.achievementId))) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path + '.achievementId',
          'Achievement grant needs a known achievement id.');
        return;
      }
      if (!isTimestamp(record.grantedAt)) {
        addIssue(issues, ISSUE_CODES.INVALID_FIELD, path + '.grantedAt',
          'Grant timestamp must be an ISO timestamp or empty.');
        return;
      }
      const grant = {
        id: record.id,
        catalogId: record.catalogId,
        source: record.source,
        grantedAt: record.grantedAt
      };
      if (record.source === 'event') grant.eventId = record.eventId;
      if (record.source === 'purchase') grant.sku = record.sku;
      if (record.source === 'achievement') grant.achievementId = record.achievementId;
      accepted.push(Object.freeze(grant));
    });
    return accepted.sort((left, right) => compareText(left.id, right.id));
  }

  function validateOwnership(raw, issues) {
    const accepted = [];
    const byId = new Map();
    groupById(raw, 'ownership.items', issues).forEach(({ record, path }) => {
      if (typeof record.id !== 'string' || record.id.indexOf(OWNED_ID_PREFIX) !== 0 ||
          record.id.length <= OWNED_ID_PREFIX.length) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path + '.id',
          'Owned instance id must use the "user:item:" namespace.');
        return;
      }
      if (!knownItemId(record.catalogId)) {
        addIssue(issues, ISSUE_CODES.UNKNOWN_CATALOG_ID, path + '.catalogId',
          'Owned instance must reference a known catalog item.', { id: record.catalogId });
        return;
      }
      if (!isTimestamp(record.acquiredAt)) {
        addIssue(issues, ISSUE_CODES.INVALID_FIELD, path + '.acquiredAt',
          'Acquisition timestamp must be an ISO timestamp or empty.');
        return;
      }
      const item = Object.freeze({
        id: record.id,
        catalogId: record.catalogId,
        acquiredAt: record.acquiredAt,
        source: typeof record.source === 'string' ? record.source : ''
      });
      accepted.push(item);
      byId.set(item.id, item);
    });
    return { items: accepted, byId };
  }

  function validateV2Placed(records, issues, label, context) {
    const reserved = reservedIds();
    const accepted = [];
    groupById(records, label, issues).forEach(({ record, path }) => {
      const id = record.id;
      if (reserved.has(id)) {
        addIssue(issues, ISSUE_CODES.RESERVED_ID, path + '.id',
          'Placement id collides with a base or progression id.', { id });
        return;
      }
      if (id.indexOf(USER_ID_PREFIX) !== 0 || id.length <= USER_ID_PREFIX.length) {
        addIssue(issues, ISSUE_CODES.INVALID_RECORD, path + '.id',
          'Placement id must use the "user:" namespace.');
        return;
      }
      const owned = context.ownedById.get(record.ownedId);
      if (!owned) {
        addIssue(issues, ISSUE_CODES.INVALID_OWNER, path + '.ownedId',
          'Placement must reference an owned instance.', { id: record.ownedId });
        return;
      }
      const item = knownItemId(owned.catalogId);
      if (!item || item.kind !== record.kind) {
        addIssue(issues, ISSUE_CODES.INVALID_OWNER, path + '.kind',
          'Placement kind must match its owned catalog item.', { id: owned.catalogId });
        return;
      }
      if (!world.biomeCatalog.supportsItem(context.biomeId, owned.catalogId)) {
        addIssue(issues, ISSUE_CODES.INCOMPATIBLE_ITEM, path,
          'Owned item is not compatible with this biome.', { id: owned.catalogId, biome: context.biomeId });
        return;
      }
      if (!Number.isSafeInteger(record.col) || !Number.isSafeInteger(record.row) ||
          record.col < 0 || record.col >= world.map.WIDTH ||
          record.row < 0 || record.row >= world.map.HEIGHT) {
        addIssue(issues, ISSUE_CODES.OUT_OF_BOUNDS, path,
          'Placement anchor must be inside the base grid.');
        return;
      }
      if (!isNonNegativeInteger(record.salt)) {
        addIssue(issues, ISSUE_CODES.INVALID_SALT, path + '.salt',
          'Placement salt must be a non-negative safe integer.');
        return;
      }
      if (context.seenIds.has(id)) {
        addIssue(issues, ISSUE_CODES.DUPLICATE_PLACEMENT, path + '.id',
          'Placement id is already used in another biome.', { id });
        return;
      }
      if (context.seenOwners.has(owned.id)) {
        addIssue(issues, ISSUE_CODES.DUPLICATE_PLACEMENT, path + '.ownedId',
          'An owned instance may be placed at most once across all biomes.', { id: owned.id });
        return;
      }
      context.seenIds.set(id, path);
      context.seenOwners.set(owned.id, path);
      accepted.push(Object.freeze({
        id,
        ownedId: owned.id,
        kind: record.kind,
        col: record.col,
        row: record.row,
        salt: record.salt
      }));
    });
    return accepted;
  }

  function validateV2Delta(rawDelta, label, issues, context, biomeId) {
    const placedContext = Object.assign({}, context, { biomeId });
    const delta = {
      objects: {
        placed: validateV2Placed(rawDelta.objects.placed, issues,
          label + '.objects.placed', placedContext),
        moved: validateMoved(rawDelta.objects.moved, issues, label + '.objects.moved'),
        removed: validateRemoved(rawDelta.objects.removed, issues, label + '.objects.removed')
      },
      terrain: validateTerrain(rawDelta.terrain, issues, label + '.terrain')
    };
    const before = delta.objects.placed.slice();
    resolveConflicts(delta, issues, label);
    const kept = new Set(delta.objects.placed.map((record) => record.id));
    before.forEach((record) => {
      if (!kept.has(record.id)) {
        placedContext.seenIds.delete(record.id);
        placedContext.seenOwners.delete(record.ownedId);
      }
    });
    return delta;
  }

  function validateV2State(raw) {
    const structural = [];
    if (!isRecord(raw)) return failV2(['world state is not an object']);
    if (raw.schemaVersion !== SCHEMA_VERSION_V2) {
      return failV2(['unsupported world schemaVersion: ' + String(raw.schemaVersion)]);
    }

    const allowed = [
      'schemaVersion', 'worldId', 'baseMapId', 'name', 'createdAt', 'updatedAt',
      'activeBiome', 'unlocks', 'ownership', 'biomes'
    ];
    Object.keys(raw).forEach((key) => {
      if (allowed.indexOf(key) === -1) {
        addIssue(structural, ISSUE_CODES.UNEXPECTED_FIELD, key,
          'Unexpected world state field. Derived application state must not be persisted.');
      }
    });
    if (!isNonEmptyString(raw.worldId)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'worldId', 'World id must be a non-empty string.');
    }
    if (!isNonEmptyString(raw.baseMapId)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'baseMapId', 'Base map id must be a non-empty string.');
    }
    if (!isNonEmptyString(raw.name)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'name', 'World name must be a non-empty string.');
    }
    if (!isTimestamp(raw.createdAt)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'createdAt', 'createdAt must be an ISO timestamp or empty.');
    }
    if (!isTimestamp(raw.updatedAt)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'updatedAt', 'updatedAt must be an ISO timestamp or empty.');
    }
    if (biomeIds().indexOf(raw.activeBiome) === -1) {
      addIssue(structural, ISSUE_CODES.UNKNOWN_BIOME, 'activeBiome', 'Active biome is not defined.');
    }
    if (!Array.isArray(raw.unlocks)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'unlocks', 'unlocks must be an array.');
    }
    if (!isRecord(raw.ownership)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'ownership', 'ownership must be an object.');
    } else {
      if (!Array.isArray(raw.ownership.items)) {
        addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'ownership.items', 'ownership.items must be an array.');
      }
      Object.keys(raw.ownership).forEach((key) => {
        if (key !== 'items') {
          addIssue(structural, ISSUE_CODES.UNEXPECTED_FIELD, 'ownership.' + key, 'Unexpected ownership field.');
        }
      });
    }
    if (!isRecord(raw.biomes)) {
      addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'biomes', 'biomes must be an object.');
    } else {
      const ids = biomeIds();
      Object.keys(raw.biomes).forEach((key) => {
        if (ids.indexOf(key) === -1) {
          addIssue(structural, ISSUE_CODES.UNKNOWN_BIOME, 'biomes.' + key, 'Unknown biome bucket.');
        }
      });
      ids.forEach((id) => {
        const delta = raw.biomes[id];
        if (!isRecord(delta)) {
          addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'biomes.' + id, 'Biome delta must be an object.');
          return;
        }
        Object.keys(delta).forEach((key) => {
          if (['objects', 'terrain'].indexOf(key) === -1) {
            addIssue(structural, ISSUE_CODES.UNEXPECTED_FIELD, 'biomes.' + id + '.' + key,
              'Unexpected biome delta field.');
          }
        });
        if (!isRecord(delta.objects)) {
          addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'biomes.' + id + '.objects',
            'Biome objects must be an object.');
        } else {
          ['placed', 'moved', 'removed'].forEach((key) => {
            if (!Array.isArray(delta.objects[key])) {
              addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'biomes.' + id + '.objects.' + key,
                'Biome object list must be an array.');
            }
          });
          Object.keys(delta.objects).forEach((key) => {
            if (['placed', 'moved', 'removed'].indexOf(key) === -1) {
              addIssue(structural, ISSUE_CODES.UNEXPECTED_FIELD,
                'biomes.' + id + '.objects.' + key, 'Unexpected biome object field.');
            }
          });
        }
        if (!Array.isArray(delta.terrain)) {
          addIssue(structural, ISSUE_CODES.INVALID_FIELD, 'biomes.' + id + '.terrain',
            'Biome terrain must be an array.');
        }
      });
    }
    if (structural.length) return failV2(structural);

    const issues = [];
    const ownership = validateOwnership(raw.ownership.items, issues);
    const unlocks = validateGrants(raw.unlocks, issues);
    const context = {
      ownedById: ownership.byId,
      seenIds: new Map(),
      seenOwners: new Map()
    };
    const biomes = {};
    biomeIds().forEach((id) => {
      biomes[id] = validateV2Delta(raw.biomes[id], 'biomes.' + id, issues, context, id);
    });

    const state = {
      schemaVersion: SCHEMA_VERSION_V2,
      worldId: raw.worldId,
      baseMapId: raw.baseMapId,
      name: raw.name,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      activeBiome: raw.activeBiome,
      unlocks,
      ownership: { items: ownership.items },
      biomes
    };
    return Object.freeze({
      ok: true,
      state: Object.freeze(state),
      issues: Object.freeze(issues.slice()),
      structural: false
    });
  }

  function validateAnyState(raw) {
    if (!isRecord(raw)) return validateState(raw);
    return raw.schemaVersion === SCHEMA_VERSION_V2 ? validateV2State(raw) : validateState(raw);
  }

  function migrateV1State(raw, options) {
    const checked = validateState(raw);
    if (!checked.ok) {
      return Object.freeze({
        ok: false,
        state: emptyV2State(),
        issues: Object.freeze(checked.issues.slice()),
        structural: checked.structural
      });
    }
    const v1 = checked.state;
    const issues = checked.issues.slice();
    const migrated = emptyV2State();
    migrated.worldId = v1.worldId;
    migrated.baseMapId = v1.baseMapId;
    migrated.name = v1.name;
    migrated.createdAt = v1.createdAt;
    migrated.updatedAt = v1.updatedAt;
    migrated.activeBiome = DEFAULT_BIOME;

    const acquiredAt = v1.updatedAt || v1.createdAt || '';
    const items = [];
    const placed = [];
    v1.objects.placed.forEach((record) => {
      const catalogId = world.contentCatalog.catalogIdForKind(record.kind);
      if (!catalogId) {
        addIssue(issues, ISSUE_CODES.UNKNOWN_CATALOG_ID, 'objects.placed.' + record.id,
          'Legacy placement has no catalog mapping.', { kind: record.kind });
        return;
      }
      const owned = Object.freeze({
        id: ownedIdForLegacy(record.id),
        catalogId,
        acquiredAt,
        source: 'migration'
      });
      items.push(owned);
      placed.push(Object.freeze({
        id: record.id,
        ownedId: owned.id,
        kind: record.kind,
        col: record.col,
        row: record.row,
        salt: record.salt
      }));
    });
    migrated.ownership.items = items;
    migrated.biomes[DEFAULT_BIOME].objects.placed = placed;
    migrated.biomes[DEFAULT_BIOME].objects.moved = cloneValue(v1.objects.moved);
    migrated.biomes[DEFAULT_BIOME].objects.removed = v1.objects.removed.slice();
    migrated.biomes[DEFAULT_BIOME].terrain = cloneValue(v1.terrain);

    const verified = validateV2State(migrated);
    if (!verified.ok) {
      return Object.freeze({
        ok: false,
        state: emptyV2State(),
        issues: Object.freeze(issues.concat(verified.issues.slice())),
        structural: verified.structural
      });
    }
    return Object.freeze({
      ok: true,
      state: verified.state,
      issues: Object.freeze(issues.concat(verified.issues.slice())),
      structural: false
    });
  }

  function parseRaw(raw) {
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return { ok: false, value: null };
    }
  }

  function quarantine(storage, raw, now) {
    if (typeof raw !== 'string') return null;
    const key = INVALID_PREFIX + now;
    try {
      storage.setItem(key, raw);
      return key;
    } catch {
      return null;
    }
  }

  function loadState(storage, options = {}) {
    const now = options.now || new Date().toISOString();
    let raw = null;
    try {
      raw = storage.getItem(KEY);
    } catch (error) {
      return {
        state: emptyState(),
        issues: ['unable to read world state: ' + error.message],
        source: 'empty',
        quarantinedKey: null
      };
    }

    if (raw === null) {
      return { state: emptyState(), issues: [], source: 'empty', quarantinedKey: null };
    }

    const parsed = parseRaw(raw);
    if (!parsed.ok) {
      const key = quarantine(storage, raw, now);
      return {
        state: emptyState(),
        issues: ['stored world state is not valid JSON' + (key ? ' (quarantined as ' + key + ')' : '')],
        source: 'invalid',
        quarantinedKey: key
      };
    }

    const checked = validateState(parsed.value);
    if (!checked.ok) {
      const key = quarantine(storage, raw, now);
      return {
        state: emptyState(),
        issues: checked.issues.concat(key ? ['quarantined as ' + key] : []),
        source: 'invalid',
        quarantinedKey: key
      };
    }

    return {
      state: checked.state,
      issues: checked.issues.slice(),
      source: 'v1',
      quarantinedKey: null
    };
  }

  function saveState(storage, state) {
    const checked = validateState(state);
    if (!checked.ok) return { ok: false, issues: checked.issues.slice() };
    try {
      storage.setItem(KEY, JSON.stringify(checked.state));
      return { ok: true, issues: checked.issues.slice() };
    } catch (error) {
      return { ok: false, issues: ['world storage write failed: ' + error.message] };
    }
  }

  function backupState(storage, state, options = {}) {
    const now = options.now || new Date().toISOString();
    const checked = validateState(state);
    if (!checked.ok) return { ok: false, issues: checked.issues.slice(), key: null };
    const key = BACKUP_PREFIX + now;
    try {
      storage.setItem(key, JSON.stringify(checked.state));
      if (typeof storage.keys === 'function') {
        const keys = storage.keys()
          .filter((item) => item.indexOf(BACKUP_PREFIX) === 0)
          .sort()
          .reverse();
        for (const old of keys.slice(MAX_BACKUPS)) storage.removeItem(old);
      }
      return { ok: true, issues: checked.issues.slice(), key };
    } catch (error) {
      return { ok: false, issues: ['world backup failed: ' + error.message], key: null };
    }
  }

  function loadV2State(storage, options = {}) {
    const now = options.now || new Date().toISOString();
    let raw;
    try {
      raw = storage.getItem(KEY_V2);
    } catch (error) {
      return {
        state: emptyV2State(),
        issues: ['unable to read world state v2: ' + error.message],
        source: 'empty',
        quarantinedKey: null
      };
    }
    if (raw === null || raw === undefined) {
      return { state: emptyV2State(), issues: [], source: 'empty', quarantinedKey: null };
    }
    const parsed = parseRaw(raw);
    if (!parsed.ok) {
      const key = quarantine(storage, raw, now);
      return {
        state: emptyV2State(),
        issues: ['stored world state v2 is not valid JSON' + (key ? ' (quarantined as ' + key + ')' : '')],
        source: 'invalid',
        quarantinedKey: key
      };
    }
    const checked = validateV2State(parsed.value);
    if (!checked.ok) {
      const key = quarantine(storage, raw, now);
      return {
        state: emptyV2State(),
        issues: checked.issues.concat(key ? ['quarantined as ' + key] : []),
        source: 'invalid',
        quarantinedKey: key
      };
    }
    return {
      state: checked.state,
      issues: checked.issues.slice(),
      source: 'v2',
      quarantinedKey: null
    };
  }

  // Reading legacy state is side-effect free: the v1 key is never removed or
  // rewritten. The migrated v2 state returned here is written only by a later
  // explicit save/commit.
  function loadAnyState(storage, options = {}) {
    const loadedV2 = loadV2State(storage, options);
    if (loadedV2.source !== 'empty') return loadedV2;

    const now = options.now || new Date().toISOString();
    let raw;
    try {
      raw = storage.getItem(KEY);
    } catch (error) {
      return {
        state: emptyV2State(),
        issues: ['unable to read world state: ' + error.message],
        source: 'empty',
        quarantinedKey: null
      };
    }
    if (raw === null || raw === undefined) {
      return { state: emptyV2State(), issues: [], source: 'empty', quarantinedKey: null };
    }
    const parsed = parseRaw(raw);
    if (!parsed.ok) {
      const key = quarantine(storage, raw, now);
      return {
        state: emptyV2State(),
        issues: ['stored world state is not valid JSON' + (key ? ' (quarantined as ' + key + ')' : '')],
        source: 'invalid',
        quarantinedKey: key
      };
    }
    const migrated = migrateV1State(parsed.value, options);
    if (!migrated.ok) {
      const key = quarantine(storage, raw, now);
      return {
        state: emptyV2State(),
        issues: migrated.issues.concat(key ? ['quarantined as ' + key] : []),
        source: 'invalid',
        quarantinedKey: key
      };
    }
    return {
      state: migrated.state,
      issues: migrated.issues.slice(),
      source: 'v1-migrated',
      quarantinedKey: null
    };
  }

  function saveV2State(storage, state) {
    const checked = validateV2State(state);
    if (!checked.ok) return { ok: false, issues: checked.issues.slice(), key: null };
    try {
      storage.setItem(KEY_V2, JSON.stringify(checked.state));
      return { ok: true, issues: checked.issues.slice(), key: KEY_V2 };
    } catch (error) {
      return { ok: false, issues: ['world v2 storage write failed: ' + error.message], key: null };
    }
  }

  function saveAnyState(storage, state) {
    return isRecord(state) && state.schemaVersion === SCHEMA_VERSION_V2
      ? saveV2State(storage, state)
      : saveState(storage, state);
  }

  function backupV2State(storage, state, options = {}) {
    const now = options.now || new Date().toISOString();
    const checked = validateV2State(state);
    if (!checked.ok) return { ok: false, issues: checked.issues.slice(), key: null };
    const key = BACKUP_PREFIX + now;
    try {
      storage.setItem(key, JSON.stringify(checked.state));
      if (typeof storage.keys === 'function') {
        const keys = storage.keys()
          .filter((item) => item.indexOf(BACKUP_PREFIX) === 0)
          .sort()
          .reverse();
        for (const old of keys.slice(MAX_BACKUPS)) storage.removeItem(old);
      }
      return { ok: true, issues: checked.issues.slice(), key };
    } catch (error) {
      return { ok: false, issues: ['world v2 backup failed: ' + error.message], key: null };
    }
  }

  function backupAnyState(storage, state, options = {}) {
    return isRecord(state) && state.schemaVersion === SCHEMA_VERSION_V2
      ? backupV2State(storage, state, options)
      : backupState(storage, state, options);
  }

  function createNamespacedId(prefix) {
    return prefix + createId().slice(USER_ID_PREFIX.length);
  }

  function createOwnedId() {
    return createNamespacedId(OWNED_ID_PREFIX);
  }

  function createPlacementId() {
    return createNamespacedId(PLACEMENT_ID_PREFIX);
  }

  function createId() {
    let raw = '';
    try {
      if (root && root.crypto && typeof root.crypto.randomUUID === 'function') {
        raw = root.crypto.randomUUID();
      }
    } catch {
      // Some browsers hide crypto.randomUUID on file:// pages.
    }
    if (!raw) raw = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    return USER_ID_PREFIX + raw;
  }

  return Object.freeze({
    SCHEMA_VERSION,
    SCHEMA_VERSION_V2,
    KEY,
    KEY_V2,
    INVALID_PREFIX,
    BACKUP_PREFIX,
    MAX_BACKUPS,
    OWNED_ID_PREFIX,
    PLACEMENT_ID_PREFIX,
    ISSUE_CODES,
    emptyState,
    emptyV2State,
    validateState,
    validateV2State,
    validateAnyState,
    migrateV1State,
    keyForState,
    loadState,
    loadV2State,
    loadAnyState,
    saveState,
    saveV2State,
    saveAnyState,
    backupState,
    backupV2State,
    backupAnyState,
    createId,
    createOwnedId,
    createPlacementId,
    reservedIds
  });
});
