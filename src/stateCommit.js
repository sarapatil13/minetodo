(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const taskStorage = isNode ? require('./storage.js') : root.CQ.storage;
  const rules = isNode ? require('./rules.js') : root.CQ.rules;
  const worldState = isNode ? require('./worldState.js') : root.CQ.worldState;
  const world = isNode ? require('./world/index.js') : root.CQ.world;
  const api = factory(taskStorage, rules, worldState, world);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).stateCommit = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (taskStorage, rules, worldState, world) {
  'use strict';

  const RECOVERY_KEY = 'cozyquest.commit-recovery.v1';
  const RECOVERY_SCHEMA = 1;
  const DOMAINS = Object.freeze(['task', 'world']);

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function describe(error) {
    if (error && typeof error.message === 'string') return error.message;
    return String(error);
  }

  function issueText(issue) {
    if (typeof issue === 'string') return issue;
    if (!isRecord(issue)) return String(issue);
    return (issue.path ? issue.path + ': ' : '') + (issue.message || 'invalid');
  }

  function normalizeDomains(raw) {
    if (Array.isArray(raw)) {
      return {
        task: raw.indexOf('task') !== -1,
        world: raw.indexOf('world') !== -1
      };
    }
    if (isRecord(raw)) {
      return { task: raw.task === true, world: raw.world === true };
    }
    return { task: true, world: false };
  }

  function activeDomains(domains) {
    return DOMAINS.filter((domain) => domains[domain]);
  }

  function boundsEqual(left, right) {
    if (!isRecord(left) || !isRecord(right)) return false;
    return ['minX', 'minY', 'maxX', 'maxY', 'width', 'height'].every((key) =>
      left[key] === right[key]
    );
  }

  function readRaw(store, key) {
    try {
      return { ok: true, value: store.getItem(key) };
    } catch (error) {
      return { ok: false, error, issues: ['unable to read ' + key + ': ' + describe(error)] };
    }
  }

  function writeRaw(store, key, value) {
    try {
      if (value === null || value === undefined) store.removeItem(key);
      else store.setItem(key, String(value));
      return { ok: true, issues: [] };
    } catch (error) {
      return { ok: false, error, issues: ['unable to write ' + key + ': ' + describe(error)] };
    }
  }

  function domainKey(domain) {
    return domain === 'task' ? taskStorage.V2_KEY : worldState.KEY;
  }

  function failure(phase, issues, extra) {
    return Object.freeze(Object.assign({
      ok: false,
      phase,
      issues: Object.freeze(issues.slice())
    }, extra || {}));
  }

  // localStorage has no cross-key transaction. Every value needed to undo a
  // partial commit is captured before the first write, and rollback is
  // best-effort with an explicit durable marker when it cannot complete.
  function preserveRawValues(store, domains) {
    const values = {};
    const issues = [];
    for (const domain of activeDomains(domains)) {
      const read = readRaw(store, domainKey(domain));
      if (!read.ok) issues.push(...read.issues);
      values[domain] = read.ok ? read.value : null;
    }
    return { ok: issues.length === 0, values, issues };
  }

  function preflightScene(scene) {
    const issues = [];
    if (!isRecord(scene) || !isRecord(scene.map) || !Array.isArray(scene.commands)) {
      return { ok: false, issues: ['composed scene is incomplete'] };
    }

    world.validateMap(scene.map).forEach((error) => issues.push('map: ' + issueText(error)));

    const targetIndex = world.selectableTargets.buildSelectableTargets(scene);
    targetIndex.issues.forEach((error) => issues.push('targets: ' + issueText(error)));

    const bounds = world.worldBounds(scene.map);
    if (!boundsEqual(bounds, scene.bounds)) {
      issues.push('scene bounds do not match the validated map');
    }

    return { ok: issues.length === 0, issues, targetIndex };
  }

  function writeBackups(store, domains, states, now, backup) {
    if (!backup) return { ok: true, issues: [], keys: {} };

    const keys = {};
    const issues = [];
    for (const domain of activeDomains(domains)) {
      const result = domain === 'task'
        ? taskStorage.backupState(store, states.task, { now })
        : worldState.backupState(store, states.world, { now });
      if (!result.ok) {
        issues.push(domain + ' backup failed: ' + result.issues.map(issueText).join('; '));
        return { ok: false, issues, keys };
      }
      keys[domain] = result.key;
    }
    return { ok: true, issues, keys };
  }

  function writeRecoveryMarker(store, domains, values, now) {
    const payload = {
      schemaVersion: RECOVERY_SCHEMA,
      createdAt: now,
      domains: {
        task: domains.task === true,
        world: domains.world === true
      },
      values: {
        task: values.task === undefined ? null : values.task,
        world: values.world === undefined ? null : values.world
      }
    };
    try {
      store.setItem(RECOVERY_KEY, JSON.stringify(payload));
      return { ok: true, issues: [] };
    } catch (error) {
      return {
        ok: false,
        issues: ['unable to write commit recovery marker: ' + describe(error)]
      };
    }
  }

  function rollback(store, domains, values, now, description) {
    const restored = [];
    const issues = [];

    for (const domain of activeDomains(domains)) {
      const result = writeRaw(store, domainKey(domain), values[domain]);
      if (!result.ok) issues.push(domain + ' rollback failed: ' + result.issues.map(issueText).join('; '));
      else restored.push(domain);
    }

    const recoveryRequired = issues.length > 0;
    let recoveryMarkerWritten = false;
    if (recoveryRequired) {
      const marker = writeRecoveryMarker(store, domains, values, now);
      recoveryMarkerWritten = marker.ok;
      if (!marker.ok) issues.push(...marker.issues);
    }

    return Object.freeze({
      ok: !recoveryRequired,
      description,
      restored: Object.freeze(restored),
      issues: Object.freeze(issues.slice()),
      recoveryRequired,
      recoveryKey: recoveryRequired && recoveryMarkerWritten ? RECOVERY_KEY : null
    });
  }

  function commit(options) {
    const settings = options || {};
    const store = settings.store;
    const now = settings.now || new Date().toISOString();
    const domains = normalizeDomains(settings.domains);

    if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function' ||
        typeof store.removeItem !== 'function') {
      return failure('store', ['commit requires a localStorage-like store']);
    }
    if (!domains.task && !domains.world) {
      return failure('domains', ['commit must include at least one state domain']);
    }

    const current = settings.current || {};
    const next = settings.next || {};
    const currentTask = current.taskState === undefined ? taskStorage.emptyState() : current.taskState;
    const currentWorld = current.worldState === undefined ? worldState.emptyState() : current.worldState;
    const nextTask = domains.task
      ? (next.taskState === undefined ? currentTask : next.taskState)
      : currentTask;
    const nextWorld = domains.world
      ? (next.worldState === undefined ? currentWorld : next.worldState)
      : currentWorld;

    let checkedTask;
    let checkedWorld;
    try {
      checkedTask = taskStorage.validateState(nextTask);
    } catch (error) {
      return failure('validate-task', ['task state validation threw: ' + describe(error)]);
    }
    if (!checkedTask.ok) {
      return failure('validate-task', checkedTask.issues.map(issueText));
    }

    try {
      checkedWorld = worldState.validateState(nextWorld);
    } catch (error) {
      return failure('validate-world', ['world state validation threw: ' + describe(error)]);
    }
    if (!checkedWorld.ok) {
      return failure('validate-world', checkedWorld.issues.map(issueText));
    }

    let xp;
    let composition;
    try {
      xp = rules.computeTotals(checkedTask.state).xp;
      composition = world.content.compose({
        baseMap: world.createSampleMeadow(),
        xp,
        state: checkedWorld.state
      });
    } catch (error) {
      return failure('compose', ['world composition threw: ' + describe(error)]);
    }
    if (!composition.ok) {
      return failure('compose', [composition.error].concat(composition.issues.map(issueText)));
    }

    let preflight;
    try {
      preflight = preflightScene(composition.scene);
    } catch (error) {
      return failure('preflight', ['scene preflight threw: ' + describe(error)]);
    }
    if (!preflight.ok) {
      return failure('preflight', preflight.issues);
    }

    const preserved = preserveRawValues(store, domains);
    if (!preserved.ok) {
      return failure('preserve', preserved.issues);
    }

    const previousStates = Object.freeze({
      task: currentTask,
      world: currentWorld
    });
    const backups = writeBackups(store, domains, previousStates, now, settings.backup === true);
    if (!backups.ok) {
      return failure('backup', backups.issues, { backupKeys: Object.freeze(backups.keys) });
    }

    const written = { task: false, world: false };
    let writeResult;
    if (domains.task) {
      writeResult = taskStorage.saveState(store, checkedTask.state);
      if (!writeResult.ok) {
        const undone = rollback(store, written, preserved.values, now, 'task write failure');
        return failure('write-task', writeResult.issues.map(issueText).concat(undone.issues), {
          rollback: undone,
          recoveryRequired: undone.recoveryRequired,
          recoveryKey: undone.recoveryKey
        });
      }
      written.task = true;
    }

    if (domains.world) {
      writeResult = worldState.saveState(store, checkedWorld.state);
      if (!writeResult.ok) {
        const undone = rollback(store, written, preserved.values, now, 'world write failure');
        return failure('write-world', writeResult.issues.map(issueText).concat(undone.issues), {
          rollback: undone,
          recoveryRequired: undone.recoveryRequired,
          recoveryKey: undone.recoveryKey
        });
      }
      written.world = true;
    }

    const issues = checkedTask.issues
      .concat(checkedWorld.issues.map(issueText))
      .concat(composition.issues.map(issueText))
      .concat(preflight.issues)
      .concat(backups.issues);

    return Object.freeze({
      ok: true,
      phase: 'complete',
      domains: Object.freeze({ task: domains.task, world: domains.world }),
      taskState: checkedTask.state,
      worldState: checkedWorld.state,
      xp,
      composition,
      previousRaw: Object.freeze({ ...preserved.values }),
      backupKeys: Object.freeze(backups.keys),
      issues: Object.freeze(issues),
      rollback: () => rollback(store, written, preserved.values, now, 'caller-requested rollback')
    });
  }

  function recover(store) {
    if (!store || typeof store.getItem !== 'function' || typeof store.setItem !== 'function' ||
        typeof store.removeItem !== 'function') {
      return { ok: false, recovered: false, issues: ['recovery requires a localStorage-like store'] };
    }

    let raw;
    try {
      raw = store.getItem(RECOVERY_KEY);
    } catch (error) {
      return { ok: false, recovered: false, issues: ['unable to read recovery marker: ' + describe(error)] };
    }
    if (raw === null || raw === undefined) {
      return { ok: true, recovered: false, restored: Object.freeze({}), issues: Object.freeze([]) };
    }

    let marker;
    try {
      marker = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        recovered: false,
        issues: ['commit recovery marker is not valid JSON; stored state was left untouched']
      };
    }

    if (!isRecord(marker) || marker.schemaVersion !== RECOVERY_SCHEMA ||
        !isRecord(marker.domains) || !isRecord(marker.values)) {
      return {
        ok: false,
        recovered: false,
        issues: ['commit recovery marker has an unsupported shape; stored state was left untouched']
      };
    }

    const restored = [];
    const issues = [];
    for (const domain of DOMAINS) {
      if (marker.domains[domain] !== true) continue;
      if (!Object.prototype.hasOwnProperty.call(marker.values, domain)) {
        issues.push(domain + ' recovery value is missing');
        continue;
      }
      const result = writeRaw(store, domainKey(domain), marker.values[domain]);
      if (!result.ok) issues.push(...result.issues);
      else restored.push(domain);
    }

    if (issues.length) {
      return Object.freeze({
        ok: false,
        recovered: false,
        restored: Object.freeze(restored),
        issues: Object.freeze(issues),
        recoveryKey: RECOVERY_KEY
      });
    }

    const cleared = writeRaw(store, RECOVERY_KEY, null);
    if (!cleared.ok) {
      return Object.freeze({
        ok: false,
        recovered: true,
        restored: Object.freeze(restored),
        issues: Object.freeze(cleared.issues),
        recoveryKey: RECOVERY_KEY
      });
    }

    return Object.freeze({
      ok: true,
      recovered: true,
      restored: Object.freeze(restored),
      issues: Object.freeze([])
    });
  }

  return Object.freeze({
    RECOVERY_KEY,
    RECOVERY_SCHEMA,
    DOMAINS,
    commit,
    recover
  });
});
