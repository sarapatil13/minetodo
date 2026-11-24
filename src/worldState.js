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
  const KEY = 'cozyquest.world-state.v1';
  const INVALID_PREFIX = 'cozyquest.invalid-world-backup.';
  const BACKUP_PREFIX = 'cozyquest.world-backup.';
  const MAX_BACKUPS = 3;
  const DEFAULT_WORLD_ID = 'meadow-haven';
  const DEFAULT_BASE_MAP_ID = 'sample-meadow-v1';
  const DEFAULT_NAME = 'Meadow Haven';
  const USER_ID_PREFIX = 'user:';

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
    UNSUPPORTED_TERRAIN: 'UNSUPPORTED_TERRAIN'
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

  function validatePlaced(records, issues) {
    const reserved = reservedIds();
    const accepted = [];
    groupById(records, 'objects.placed', issues).forEach(({ record, path }) => {
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

  function validateMoved(records, issues) {
    const accepted = [];
    groupById(records, 'objects.moved', issues).forEach(({ record, path }) => {
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

  function validateRemoved(records, issues) {
    const accepted = [];
    const seen = new Set();
    records.forEach((id, index) => {
      const path = 'objects.removed[' + index + ']';
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

  function validateTerrain(records, issues) {
    const accepted = [];
    groupByCell(records, 'terrain', issues).forEach(({ record, path }) => {
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

  function resolveConflicts(state, issues) {
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
      addIssue(issues, ISSUE_CODES.CONFLICTING_RECORD, 'objects',
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
    KEY,
    INVALID_PREFIX,
    BACKUP_PREFIX,
    MAX_BACKUPS,
    ISSUE_CODES,
    emptyState,
    validateState,
    loadState,
    saveState,
    backupState,
    createId,
    reservedIds
  });
});
