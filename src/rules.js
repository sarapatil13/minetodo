(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).rules = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TIERS = ['low', 'medium', 'high'];
  const TASK_TYPES = ['Quick task', 'Daily habit', 'Recurring task', 'Project', 'Self-care'];
  const RESOURCES = ['wood', 'stone', 'iron'];
  const RESOURCE_LABELS = { wood: 'Wood', stone: 'Stone', iron: 'Iron' };

  // Base effort tier plus the two independent dimensions.
  const XP_MATRIX = {
    low: { none: 10, urgent: 16, important: 19, both: 25 },
    medium: { none: 20, urgent: 26, important: 29, both: 35 },
    high: { none: 35, urgent: 41, important: 44, both: 50 }
  };

  const LEGACY_PRIORITIES = {
    low: { tier: 'low', urgent: false, important: false },
    medium: { tier: 'medium', urgent: false, important: false },
    high: { tier: 'high', urgent: false, important: false },
    critical: { tier: 'high', urgent: true, important: true }
  };

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isValidPriority(value) {
    return (
      isPlainObject(value) &&
      TIERS.includes(value.tier) &&
      typeof value.urgent === 'boolean' &&
      typeof value.important === 'boolean'
    );
  }

  function normalizePriority(value) {
    return isValidPriority(value)
      ? { tier: value.tier, urgent: value.urgent, important: value.important }
      : null;
  }

  function legacyPriorityToPriority(value) {
    const mapped = LEGACY_PRIORITIES[value];
    return mapped ? { ...mapped } : null;
  }

  function priorityKey(priority) {
    if (!isValidPriority(priority)) return null;
    if (priority.urgent && priority.important) return 'both';
    if (priority.urgent) return 'urgent';
    if (priority.important) return 'important';
    return 'none';
  }

  function rewardFor(priority) {
    const key = priorityKey(priority);
    if (!key) throw new Error('Invalid priority');
    const xp = XP_MATRIX[priority.tier][key];
    const coins = Math.floor(xp * 0.3);
    let resource;
    let amount;
    if (xp < 20) {
      resource = 'wood';
      amount = 1;
    } else if (xp < 35) {
      resource = 'wood';
      amount = 2;
    } else if (xp < 50) {
      resource = 'stone';
      amount = 2;
    } else {
      resource = 'iron';
      amount = 1;
    }
    return { xp, coins, resource, amount, label: RESOURCE_LABELS[resource] };
  }

  function isValidDate(value) {
    if (value === '') return true;
    if (typeof value !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    date.setFullYear(year);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function computeTotals(state) {
    const totals = {
      xp: state.baseline.xp,
      coins: state.baseline.coins,
      resources: { ...state.baseline.resources }
    };
    for (const entry of state.ledger) {
      totals.xp += entry.reward.xp;
      totals.coins += entry.reward.coins;
      totals.resources[entry.reward.resource] += entry.reward.amount;
    }
    return totals;
  }

  function countCompleted(state) {
    return state.tasks.filter((task) => task.done === true).length;
  }

  function createTask(input, options = {}) {
    if (!isPlainObject(input)) return { ok: false, issues: ['invalid input'] };
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title || title.length > 90) return { ok: false, issues: ['invalid title'] };

    const priority = normalizePriority(input.priority);
    if (!priority) return { ok: false, issues: ['invalid priority'] };

    const type = TASK_TYPES.includes(input.type) ? input.type : 'Quick task';
    const date = input.date === undefined || input.date === null ? '' : input.date;
    if (!isValidDate(date)) return { ok: false, issues: ['invalid date'] };
    const task = {
      id: options.id || String(Date.now()),
      title,
      type,
      date,
      priority,
      done: false,
      createdAt: options.now || new Date().toISOString(),
      rewardClaimed: false
    };
    return { ok: true, task, issues: [] };
  }

  function completeTask(state, id, options = {}) {
    const clone = structuredClone(state);
    const task = clone.tasks.find((item) => item.id === id);
    if (!task) return { ok: false, state, issues: ['task not found'] };
    if (task.done) return { ok: false, state, issues: ['task already completed'] };

    task.done = true;
    if (task.rewardClaimed) {
      return { ok: true, state: clone, entry: null, reason: 'reward-already-claimed', issues: [] };
    }

    const reward = rewardFor(task.priority);
    const entry = {
      id: options.entryId || 'ledger-' + (options.now || new Date().toISOString()),
      taskId: task.id,
      prioritySnapshot: structuredClone(task.priority),
      reward: {
        xp: reward.xp,
        coins: reward.coins,
        resource: reward.resource,
        amount: reward.amount
      },
      claimedAt: options.now || new Date().toISOString()
    };
    clone.ledger.push(entry);
    task.rewardClaimed = true;
    return { ok: true, state: clone, entry, issues: [] };
  }

  function reopenTask(state, id) {
    const clone = structuredClone(state);
    const task = clone.tasks.find((item) => item.id === id);
    if (!task) return { ok: false, state, issues: ['task not found'] };
    if (!task.done) return { ok: false, state, issues: ['task is not completed'] };

    task.done = false;
    // Reward is permanent: rewardClaimed and the ledger entry are untouched.
    return { ok: true, state: clone, issues: [] };
  }

  function editTask(state, id, patch) {
    if (!isPlainObject(patch)) return { ok: false, state, issues: ['invalid patch'] };
    const clone = structuredClone(state);
    const task = clone.tasks.find((item) => item.id === id);
    if (!task) return { ok: false, state, issues: ['task not found'] };

    if (Object.prototype.hasOwnProperty.call(patch, 'priority') && task.done) {
      return { ok: false, state, issues: ['priority locked while task is completed'] };
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'priority')) {
      const priority = normalizePriority(patch.priority);
      if (!priority) return { ok: false, state, issues: ['invalid priority'] };
      task.priority = priority;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
      const title = typeof patch.title === 'string' ? patch.title.trim() : '';
      if (!title || title.length > 90) return { ok: false, state, issues: ['invalid title'] };
      task.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'type')) {
      if (!TASK_TYPES.includes(patch.type)) return { ok: false, state, issues: ['invalid task type'] };
      task.type = patch.type;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'date')) {
      if (!isValidDate(patch.date)) return { ok: false, state, issues: ['invalid date'] };
      task.date = patch.date;
    }
    return { ok: true, state: clone, issues: [] };
  }

  function deleteTask(state, id) {
    const clone = structuredClone(state);
    const before = clone.tasks.length;
    clone.tasks = clone.tasks.filter((item) => item.id !== id);
    if (clone.tasks.length === before) return { ok: false, state, issues: ['task not found'] };
    // Ledger entries are permanent and deliberately survive task deletion.
    return { ok: true, state: clone, issues: [] };
  }

  function assertInvariants(state) {
    const issues = [];
    if (!isPlainObject(state) || !Array.isArray(state.tasks) || !Array.isArray(state.ledger) || !isPlainObject(state.baseline)) {
      return { ok: false, issues: ['invalid state shape'] };
    }

    const seenIds = new Set();
    const claimed = new Set();
    for (const entry of state.ledger) {
      if (seenIds.has(entry.id)) issues.push('duplicate ledger id: ' + entry.id);
      seenIds.add(entry.id);
      const expected = rewardFor(entry.prioritySnapshot);
      const reward = entry.reward;
      if (
        !reward ||
        reward.xp !== expected.xp ||
        reward.coins !== expected.coins ||
        reward.resource !== expected.resource ||
        reward.amount !== expected.amount
      ) {
        issues.push('ledger reward does not match priority snapshot: ' + entry.id);
      }
      claimed.add(entry.taskId);
    }

    for (const task of state.tasks) {
      if (task.rewardClaimed && !claimed.has(task.id)) {
        issues.push('reward claimed without ledger entry: ' + task.id);
      }
      if (!task.rewardClaimed && claimed.has(task.id)) {
        issues.push('ledger entry without claimed flag: ' + task.id);
      }
    }

    const totals = computeTotals(state);
    if (!Number.isFinite(totals.xp) || totals.xp < 0) issues.push('invalid xp total');
    if (!Number.isFinite(totals.coins) || totals.coins < 0) issues.push('invalid coin total');
    for (const resource of RESOURCES) {
      if (!Number.isFinite(totals.resources[resource]) || totals.resources[resource] < 0) {
        issues.push('invalid ' + resource + ' total');
      }
    }
    return { ok: issues.length === 0, issues };
  }

  return {
    TIERS,
    TASK_TYPES,
    RESOURCES,
    XP_MATRIX,
    isValidDate,
    isValidPriority,
    normalizePriority,
    legacyPriorityToPriority,
    priorityKey,
    rewardFor,
    computeTotals,
    countCompleted,
    createTask,
    completeTask,
    reopenTask,
    editTask,
    deleteTask,
    assertInvariants
  };
});
