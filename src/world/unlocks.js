(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const rules = isNode ? require('../rules.js') : root.CQ.rules;
  const catalog = isNode ? require('./contentCatalog.js') : root.CQ.worldContentCatalog;
  const api = factory(rules, catalog);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldUnlocks = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rules, catalog) {
  'use strict';

  const REQUIREMENT_TYPES = Object.freeze([
    'always',
    'xp',
    'completed-tasks',
    'ledger-entries',
    'achievement',
    'grant',
    'event',
    'purchase',
    'all',
    'any'
  ]);

  const GRANT_SOURCES = Object.freeze(['event', 'purchase', 'achievement']);

  const ACHIEVEMENTS = Object.freeze({
    'achievement:ten-tasks': Object.freeze({
      id: 'achievement:ten-tasks',
      label: 'Ten small steps',
      requirement: Object.freeze({ type: 'completed-tasks', count: 10 })
    }),
    'achievement:twenty-rewards': Object.freeze({
      id: 'achievement:twenty-rewards',
      label: 'Twenty rewards earned',
      requirement: Object.freeze({ type: 'ledger-entries', count: 20 })
    })
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

  function addIssue(issues, code, path, message) {
    issues.push(Object.freeze({ code, path, message }));
  }

  // No string is ever parsed or evaluated. Requirements are closed, typed
  // objects, and unknown shapes are rejected rather than interpreted.
  function validateRequirement(requirement, issues, path) {
    const location = path || 'unlock';
    if (!isRecord(requirement)) {
      if (issues) addIssue(issues, 'INVALID_REQUIREMENT', location, 'Unlock requirement must be an object.');
      return false;
    }
    if (REQUIREMENT_TYPES.indexOf(requirement.type) === -1) {
      if (issues) addIssue(issues, 'UNKNOWN_REQUIREMENT_TYPE', location + '.type', 'Unsupported unlock requirement type.');
      return false;
    }

    switch (requirement.type) {
      case 'always':
        return true;
      case 'xp':
        if (!isNonNegativeInteger(requirement.minXp)) {
          if (issues) addIssue(issues, 'INVALID_REQUIREMENT', location + '.minXp', 'XP threshold must be a non-negative safe integer.');
          return false;
        }
        return true;
      case 'completed-tasks':
      case 'ledger-entries':
        if (!isNonNegativeInteger(requirement.count)) {
          if (issues) addIssue(issues, 'INVALID_REQUIREMENT', location + '.count', 'Count must be a non-negative safe integer.');
          return false;
        }
        return true;
      case 'achievement':
        if (!isNonEmptyString(requirement.achievementId) ||
            !Object.prototype.hasOwnProperty.call(ACHIEVEMENTS, requirement.achievementId)) {
          if (issues) addIssue(issues, 'UNKNOWN_ACHIEVEMENT', location + '.achievementId', 'Achievement id is not defined.');
          return false;
        }
        return true;
      case 'grant':
        if (GRANT_SOURCES.indexOf(requirement.source) === -1 ||
            (requirement.eventId !== undefined && !isNonEmptyString(requirement.eventId)) ||
            (requirement.sku !== undefined && !isNonEmptyString(requirement.sku))) {
          if (issues) addIssue(issues, 'INVALID_REQUIREMENT', location, 'Grant requirement has an invalid source or identifier.');
          return false;
        }
        return true;
      case 'event':
        return isNonEmptyString(requirement.eventId);
      case 'purchase':
        return isNonEmptyString(requirement.sku);
      case 'all':
      case 'any': {
        if (!Array.isArray(requirement.requirements) || requirement.requirements.length === 0) {
          if (issues) addIssue(issues, 'INVALID_REQUIREMENT', location + '.requirements', 'Composite requirement must be a non-empty array.');
          return false;
        }
        return requirement.requirements.every((child, index) =>
          validateRequirement(child, issues, location + '.requirements[' + index + ']')
        );
      }
      default:
        return false;
    }
  }

  function describeRequirement(requirement) {
    if (!validateRequirement(requirement)) return 'Unavailable';
    switch (requirement.type) {
      case 'always': return 'Always available';
      case 'xp': return 'Reach ' + requirement.minXp + ' XP';
      case 'completed-tasks': return 'Complete ' + requirement.count + ' task' + (requirement.count === 1 ? '' : 's');
      case 'ledger-entries': return 'Earn ' + requirement.count + ' reward' + (requirement.count === 1 ? '' : 's');
      case 'achievement': {
        const achievement = ACHIEVEMENTS[requirement.achievementId];
        return achievement ? achievement.label : 'Achievement unlock';
      }
      case 'grant': return requirement.source + ' unlock';
      case 'event': return 'Event: ' + requirement.eventId;
      case 'purchase': return 'Purchase: ' + requirement.sku;
      case 'all': return requirement.requirements.map(describeRequirement).join(' + ');
      case 'any': return requirement.requirements.map(describeRequirement).join(' or ');
      default: return 'Unavailable';
    }
  }

  function grantKey(catalogId, source, detail) {
    return catalogId + '\u0000' + source + '\u0000' + (detail || '');
  }

  function grantDetail(record) {
    if (isNonEmptyString(record.eventId)) return record.eventId;
    if (isNonEmptyString(record.sku)) return record.sku;
    return '';
  }

  function collectGrants(worldState, issues) {
    const grants = new Set();
    const source = isRecord(worldState) && Array.isArray(worldState.unlocks) ? worldState.unlocks : [];
    source.forEach((record, index) => {
      const path = 'unlocks[' + index + ']';
      if (!isRecord(record) || !isNonEmptyString(record.id) ||
          !isNonEmptyString(record.catalogId) || GRANT_SOURCES.indexOf(record.source) === -1) {
        if (issues) addIssue(issues, 'INVALID_GRANT', path, 'Unlock grant has an invalid shape.');
        return;
      }
      grants.add(grantKey(record.catalogId, record.source, grantDetail(record)));
    });
    return grants;
  }

  function evaluateRequirement(requirement, context, issues, path) {
    if (!validateRequirement(requirement, issues, path)) return false;
    const settings = context || {};
    const grants = settings.grants instanceof Set ? settings.grants : new Set();
    const catalogId = isNonEmptyString(settings.catalogId) ? settings.catalogId : '';
    const xp = isNonNegativeInteger(settings.xp) ? settings.xp : 0;
    const completedTasks = isNonNegativeInteger(settings.completedTasks) ? settings.completedTasks : 0;
    const ledgerEntries = isNonNegativeInteger(settings.ledgerEntries) ? settings.ledgerEntries : 0;

    switch (requirement.type) {
      case 'always':
        return true;
      case 'xp':
        return xp >= requirement.minXp;
      case 'completed-tasks':
        return completedTasks >= requirement.count;
      case 'ledger-entries':
        return ledgerEntries >= requirement.count;
      case 'achievement':
        return evaluateRequirement(
          ACHIEVEMENTS[requirement.achievementId].requirement,
          settings,
          issues,
          path + '.requirement'
        );
      case 'grant':
        return grants.has(grantKey(catalogId, requirement.source,
          requirement.eventId || requirement.sku || ''));
      case 'event':
        return grants.has(grantKey(catalogId, 'event', requirement.eventId));
      case 'purchase':
        return grants.has(grantKey(catalogId, 'purchase', requirement.sku));
      case 'all':
        return requirement.requirements.every((child, index) =>
          evaluateRequirement(child, settings, issues, path + '.requirements[' + index + ']')
        );
      case 'any':
        return requirement.requirements.some((child, index) =>
          evaluateRequirement(child, settings, issues, path + '.requirements[' + index + ']')
        );
      default:
        return false;
    }
  }

  function contextFromState(options) {
    const settings = options || {};
    const taskState = settings.taskState || null;
    const issues = [];
    const xp = settings.xp !== undefined
      ? settings.xp
      : (taskState && rules ? rules.computeTotals(taskState).xp : 0);
    const ledgerEntries = settings.ledgerEntries !== undefined
      ? settings.ledgerEntries
      : (taskState && Array.isArray(taskState.ledger) ? taskState.ledger.length : 0);
    // Completion unlocks must follow the permanent reward ledger, not the live
    // task list: reopening or deleting a completed task cannot revoke them.
    const completedTasks = settings.completedTasks !== undefined
      ? settings.completedTasks
      : ledgerEntries;
    return {
      xp: isNonNegativeInteger(xp) ? xp : 0,
      completedTasks: isNonNegativeInteger(completedTasks) ? completedTasks : 0,
      ledgerEntries: isNonNegativeInteger(ledgerEntries) ? ledgerEntries : 0,
      grants: settings.grants instanceof Set
        ? settings.grants
        : collectGrants(settings.worldState, issues),
      issues
    };
  }

  // Entries are { id, unlock } records. Passing entries explicitly lets the
  // biome catalog reuse the same evaluator without coupling it to item IDs.
  function evaluateEntries(entries, options) {
    const settings = options || {};
    const context = contextFromState(settings);
    const issues = context.issues.slice();
    const available = Object.create(null);
    const evaluated = Object.create(null);
    const knownCatalog = settings.catalog && typeof settings.catalog.getItem === 'function'
      ? settings.catalog
      : null;

    (Array.isArray(entries) ? entries : []).forEach((entry, index) => {
      const path = 'entries[' + index + ']';
      if (!isRecord(entry) || !isNonEmptyString(entry.id)) {
        addIssue(issues, 'UNKNOWN_CATALOG_ID', path, 'Catalog entry must have an id.');
        return;
      }
      if (Object.prototype.hasOwnProperty.call(evaluated, entry.id)) {
        addIssue(issues, 'DUPLICATE_CATALOG_ID', path, 'Duplicate catalog id was ignored.', { id: entry.id });
        return;
      }
      if (knownCatalog && !knownCatalog.getItem(entry.id)) {
        addIssue(issues, 'UNKNOWN_CATALOG_ID', path, 'Catalog id is not defined.', { id: entry.id });
        evaluated[entry.id] = true;
        available[entry.id] = false;
        return;
      }
      const unlocked = evaluateRequirement(entry.unlock, Object.assign({ catalogId: entry.id }, context),
        issues, path + '.unlock');
      evaluated[entry.id] = true;
      available[entry.id] = unlocked;
    });

    return Object.freeze({
      xp: context.xp,
      completedTasks: context.completedTasks,
      ledgerEntries: context.ledgerEntries,
      available: Object.freeze(available),
      issues: Object.freeze(issues)
    });
  }

  function evaluate(options) {
    const settings = options || {};
    const source = settings.catalog || catalog;
    const entries = settings.entries || (source && typeof source.all === 'function'
      ? source.all().map((item) => ({ id: item.id, unlock: item.unlock }))
      : []);
    return evaluateEntries(entries, settings);
  }

  function isUnlocked(id, evaluation) {
    return Boolean(evaluation && isNonEmptyString(id) &&
      Object.prototype.hasOwnProperty.call(evaluation.available, id) &&
      evaluation.available[id] === true);
  }

  function requirementFor(id, source) {
    const catalogModule = source || catalog;
    const item = catalogModule && typeof catalogModule.getItem === 'function'
      ? catalogModule.getItem(id)
      : null;
    return item ? item.unlock : null;
  }

  return Object.freeze({
    REQUIREMENT_TYPES,
    GRANT_SOURCES,
    ACHIEVEMENTS,
    validateRequirement,
    describeRequirement,
    collectGrants,
    grantKey,
    evaluateRequirement,
    evaluateEntries,
    evaluate,
    isUnlocked,
    requirementFor
  });
});
