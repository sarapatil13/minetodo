(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).storage = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const rules = typeof module === 'object' && module.exports ? require('./rules.js') : root.CQ.rules;

  const SCHEMA_VERSION = 2;
  const V1_KEY = 'cozyquest.mvp.v1';
  const V2_KEY = 'cozyquest.task-engine.v2';
  const INVALID_PREFIX = 'cozyquest.invalid-backup.';
  const BACKUP_PREFIX = 'cozyquest.backup.';
  const MAX_BACKUPS = 3;
  const RESOURCE_KEYS = ['wood', 'stone', 'iron'];

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function isTimestamp(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  function isValidDate(value) {
    return value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
  }

  function emptyResources() {
    return { wood: 0, stone: 0, iron: 0 };
  }

  function emptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      baseline: { xp: 0, coins: 0, resources: emptyResources() },
      tasks: [],
      ledger: []
    };
  }

  function validateResources(raw, label, issues) {
    const result = emptyResources();
    if (!isPlainObject(raw)) {
      issues.push(label + ' resources missing');
      return result;
    }
    const keys = Object.keys(raw).sort().join(',');
    if (keys !== RESOURCE_KEYS.slice().sort().join(',')) {
      issues.push(label + ' resources have unexpected keys');
    }
    for (const key of RESOURCE_KEYS) {
      if (isNonNegativeInteger(raw[key])) result[key] = raw[key];
      else issues.push(label + ' resource ' + key + ' invalid');
    }
    return result;
  }

  function validateState(raw) {
    const issues = [];
    if (!isPlainObject(raw)) return { ok: false, state: emptyState(), issues: ['state is not an object'] };
    if (raw.schemaVersion !== SCHEMA_VERSION) {
      issues.push('unsupported schemaVersion');
      return { ok: false, state: emptyState(), issues };
    }

    const baseline = raw.baseline;
    if (!isPlainObject(baseline)) {
      issues.push('baseline missing');
      return { ok: false, state: emptyState(), issues };
    }
    const cleanBaseline = {
      xp: isNonNegativeInteger(baseline.xp) ? baseline.xp : 0,
      coins: isNonNegativeInteger(baseline.coins) ? baseline.coins : 0,
      resources: validateResources(baseline.resources, 'baseline', issues)
    };
    if (!isNonNegativeInteger(baseline.xp)) issues.push('baseline xp invalid');
    if (!isNonNegativeInteger(baseline.coins)) issues.push('baseline coins invalid');

    if (!Array.isArray(raw.tasks)) {
      issues.push('tasks is not an array');
      return { ok: false, state: emptyState(), issues };
    }
    if (!Array.isArray(raw.ledger)) {
      issues.push('ledger is not an array');
      return { ok: false, state: emptyState(), issues };
    }

    const tasks = [];
    const taskIds = new Set();
    for (const item of raw.tasks) {
      if (!isPlainObject(item)) { issues.push('invalid task skipped'); continue; }
      const id = typeof item.id === 'string' && item.id ? item.id : '';
      if (!id || taskIds.has(id)) { issues.push('task id missing or duplicated'); continue; }
      if (typeof item.title !== 'string' || !item.title.trim() || item.title.trim().length > 90) {
        issues.push('task title invalid'); continue;
      }
      if (!rules.isValidPriority(item.priority)) { issues.push('task priority invalid'); continue; }
      if (!rules.TASK_TYPES.includes(item.type)) { issues.push('task type invalid'); continue; }
      if (!isValidDate(item.date)) { issues.push('task date invalid'); continue; }
      if (typeof item.done !== 'boolean' || typeof item.rewardClaimed !== 'boolean') {
        issues.push('task flags invalid'); continue;
      }
      if (!isTimestamp(item.createdAt)) { issues.push('task createdAt invalid'); continue; }
      taskIds.add(id);
      tasks.push({
        id,
        title: item.title.trim(),
        type: item.type,
        date: item.date,
        priority: rules.normalizePriority(item.priority),
        done: item.done,
        createdAt: item.createdAt,
        rewardClaimed: item.rewardClaimed
      });
    }

    const ledger = [];
    const entryIds = new Set();
    for (const item of raw.ledger) {
      if (!isPlainObject(item)) { issues.push('invalid ledger entry'); continue; }
      const id = typeof item.id === 'string' && item.id ? item.id : '';
      if (!id || entryIds.has(id)) { issues.push('ledger id missing or duplicated'); continue; }
      if (typeof item.taskId !== 'string' || !item.taskId) { issues.push('ledger taskId invalid'); continue; }
      if (!rules.isValidPriority(item.prioritySnapshot)) { issues.push('ledger priority snapshot invalid'); continue; }
      if (!isTimestamp(item.claimedAt)) { issues.push('ledger claimedAt invalid'); continue; }
      if (!isPlainObject(item.reward)) { issues.push('ledger reward invalid'); continue; }

      const expected = rules.rewardFor(item.prioritySnapshot);
      const reward = item.reward;
      if (
        reward.xp !== expected.xp ||
        reward.coins !== expected.coins ||
        reward.resource !== expected.resource ||
        reward.amount !== expected.amount ||
        !rules.RESOURCES.includes(reward.resource) ||
        !isNonNegativeInteger(reward.xp) ||
        !isNonNegativeInteger(reward.coins) ||
        !isNonNegativeInteger(reward.amount)
      ) {
        // Never trust arbitrary or imported reward values.
        issues.push('ledger reward does not match its priority snapshot');
        continue;
      }
      entryIds.add(id);
      ledger.push({
        id,
        taskId: item.taskId,
        prioritySnapshot: rules.normalizePriority(item.prioritySnapshot),
        reward: { xp: reward.xp, coins: reward.coins, resource: reward.resource, amount: reward.amount },
        claimedAt: item.claimedAt
      });
    }

    const state = { schemaVersion: SCHEMA_VERSION, baseline: cleanBaseline, tasks, ledger };
    const invariant = rules.assertInvariants(state);
    issues.push(...invariant.issues);
    return { ok: issues.length === 0, state, issues };
  }

  function migrateV1(raw, options = {}) {
    const now = options.now || new Date().toISOString();
    const issues = [];
    if (!isPlainObject(raw) || !Array.isArray(raw.tasks)) {
      return { ok: false, state: emptyState(), issues: ['v1 state is not an object with tasks'] };
    }

    const state = emptyState();
    let rewardXp = 0;
    let rewardCoins = 0;
    const rewardResources = emptyResources();

    raw.tasks.forEach((item, index) => {
      if (!isPlainObject(item) || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || !item.title.trim()) {
        issues.push('v1 task ' + index + ' skipped');
        return;
      }
      const priority = rules.legacyPriorityToPriority(item.priority) || { tier: 'medium', urgent: false, important: false };
      if (!rules.legacyPriorityToPriority(item.priority)) issues.push('v1 task ' + index + ' had unknown priority');
      const reward = rules.rewardFor(priority);
      const done = item.done === true;
      const rewardClaimed = item.rewardGranted === true;

      const task = {
        id: item.id,
        title: item.title.trim().slice(0, 90),
        type: rules.TASK_TYPES.includes(item.type) ? item.type : 'Quick task',
        date: isValidDate(item.date) ? item.date : '',
        priority,
        done,
        createdAt: isTimestamp(item.createdAt) ? item.createdAt : now,
        rewardClaimed
      };
      state.tasks.push(task);

      if (rewardClaimed) {
        state.ledger.push({
          id: 'migrated-' + index + '-' + item.id,
          taskId: item.id,
          prioritySnapshot: { ...priority },
          reward: { xp: reward.xp, coins: reward.coins, resource: reward.resource, amount: reward.amount },
          claimedAt: task.createdAt
        });
        rewardXp += reward.xp;
        rewardCoins += reward.coins;
        rewardResources[reward.resource] += reward.amount;
      }
    });

    const storedXp = isNonNegativeInteger(raw.xp) ? raw.xp : 0;
    const storedCoins = isNonNegativeInteger(raw.coins) ? raw.coins : 0;
    const storedResources = validateResources(raw.resources, 'v1', issues);
    state.baseline = {
      xp: Math.max(0, storedXp - rewardXp),
      coins: Math.max(0, storedCoins - rewardCoins),
      resources: {
        wood: Math.max(0, storedResources.wood - rewardResources.wood),
        stone: Math.max(0, storedResources.stone - rewardResources.stone),
        iron: Math.max(0, storedResources.iron - rewardResources.iron)
      }
    };
    if (state.baseline.xp !== storedXp - rewardXp) issues.push('v1 xp baseline clamped');
    if (state.baseline.coins !== storedCoins - rewardCoins) issues.push('v1 coin baseline clamped');
    for (const key of RESOURCE_KEYS) {
      if (state.baseline.resources[key] !== storedResources[key] - rewardResources[key]) {
        issues.push('v1 ' + key + ' baseline clamped');
      }
    }

    const check = rules.assertInvariants(state);
    issues.push(...check.issues);
    return { ok: check.ok, state, issues };
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
    try { raw = storage.getItem(V2_KEY); } catch { raw = null; }

    if (raw !== null) {
      const parsed = parseRaw(raw);
      if (parsed.ok) {
        const checked = validateState(parsed.value);
        if (checked.ok) return { state: checked.state, issues: checked.issues, source: 'v2', migrated: false };
        quarantine(storage, raw, now);
      } else {
        quarantine(storage, raw, now);
      }
    }

    try { raw = storage.getItem(V1_KEY); } catch { raw = null; }
    if (raw !== null) {
      const parsed = parseRaw(raw);
      if (parsed.ok) {
        const migrated = migrateV1(parsed.value, { now });
        if (migrated.ok) {
          saveState(storage, migrated.state);
          return { state: migrated.state, issues: migrated.issues, source: 'v1', migrated: true };
        }
      }
      quarantine(storage, raw, now);
    }

    return { state: emptyState(), issues: ['no valid stored state found'], source: 'empty', migrated: false };
  }

  function saveState(storage, state) {
    const checked = validateState(state);
    if (!checked.ok) return { ok: false, issues: checked.issues };
    try {
      storage.setItem(V2_KEY, JSON.stringify(checked.state));
      return { ok: true, issues: checked.issues };
    } catch (error) {
      return { ok: false, issues: ['storage write failed: ' + error.message] };
    }
  }

  function backupState(storage, state, options = {}) {
    const now = options.now || new Date().toISOString();
    const checked = validateState(state);
    if (!checked.ok) return { ok: false, issues: checked.issues, key: null };
    const key = BACKUP_PREFIX + now;
    try {
      storage.setItem(key, JSON.stringify(checked.state));
      if (typeof storage.keys === 'function') {
        const keys = storage.keys().filter((item) => item.startsWith(BACKUP_PREFIX)).sort().reverse();
        for (const old of keys.slice(MAX_BACKUPS)) storage.removeItem(old);
      }
      return { ok: true, issues: [], key };
    } catch (error) {
      return { ok: false, issues: ['backup failed: ' + error.message], key: null };
    }
  }

  return {
    SCHEMA_VERSION,
    V1_KEY,
    V2_KEY,
    INVALID_PREFIX,
    BACKUP_PREFIX,
    MAX_BACKUPS,
    emptyState,
    validateState,
    migrateV1,
    loadState,
    saveState,
    backupState
  };
});
