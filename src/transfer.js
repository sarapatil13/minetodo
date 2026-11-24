(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).transfer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const isNode = typeof module === 'object' && module.exports;
  const rules = isNode ? require('./rules.js') : root.CQ.rules;
  const storage = isNode ? require('./storage.js') : root.CQ.storage;
  const worldState = isNode ? require('./worldState.js') : null;

  const APP_NAME = 'CozyQuest';
  const MAX_BYTES = 1024 * 1024;

  function byteLength(text) {
    return new TextEncoder().encode(text).length;
  }

  function issueText(issue) {
    if (typeof issue === 'string') return issue;
    if (issue && typeof issue.message === 'string') return issue.message;
    return String(issue);
  }

  // In classic-script mode worldState is loaded after transfer.js, so it is
  // resolved when export/import runs rather than at script evaluation time.
  function worldValidator(options) {
    if (options.validateWorldState) return options.validateWorldState;
    if (isNode) return worldState.validateState;
    const module = root.CQ && root.CQ.worldState;
    if (!module || typeof module.validateState !== 'function') {
      throw new Error('World state module is unavailable');
    }
    return module.validateState;
  }

  function exportState(state, options = {}) {
    const validate = options.validateState || storage.validateState;
    const checked = validate(state);
    if (!checked.ok) throw new Error('Cannot export invalid state: ' + checked.issues.join('; '));

    const envelope = {
      app: APP_NAME,
      schemaVersion: storage.SCHEMA_VERSION,
      exportedAt: options.now || new Date().toISOString(),
      state: checked.state
    };
    if (Object.prototype.hasOwnProperty.call(options, 'worldState')) {
      const checkedWorld = worldValidator(options)(options.worldState);
      if (!checkedWorld.ok) {
        throw new Error('Cannot export invalid world state: ' +
          checkedWorld.issues.map(issueText).join('; '));
      }
      envelope.world = checkedWorld.state;
    }
    return JSON.stringify(envelope, null, 2);
  }

  function parseImport(text, options = {}) {
    const maxBytes = options.maxBytes || MAX_BYTES;
    const validate = options.validateState || storage.validateState;
    const now = options.now || new Date().toISOString();

    if (typeof text !== 'string') return { ok: false, error: 'Import must be text' };
    if (byteLength(text) > maxBytes) return { ok: false, error: 'Import file is too large' };

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Import file is not valid JSON' };
    }

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, error: 'Import payload must be an object' };
    }
    if (payload.app !== APP_NAME) return { ok: false, error: 'Import file is not a CozyQuest backup' };
    if (payload.schemaVersion !== storage.SCHEMA_VERSION) {
      return { ok: false, error: 'Unsupported backup schema version' };
    }
    if (payload.exportedAt !== undefined && (typeof payload.exportedAt !== 'string' || Number.isNaN(Date.parse(payload.exportedAt)))) {
      return { ok: false, error: 'Invalid export timestamp' };
    }

    const checked = validate(payload.state);
    if (!checked.ok) return { ok: false, error: 'Invalid backup contents: ' + checked.issues.join('; ') };

    // An absent world field means "leave the existing world alone". A present
    // world field is an explicit instruction and must be valid before the
    // caller confirms or writes anything.
    const hasWorld = Object.prototype.hasOwnProperty.call(payload, 'world');
    let worldResult = null;
    if (hasWorld) {
      let checkedWorld;
      try {
        checkedWorld = worldValidator(options)(payload.world);
      } catch (error) {
        return { ok: false, error: 'Invalid world backup contents: ' + error.message };
      }
      if (!checkedWorld.ok) {
        return {
          ok: false,
          error: 'Invalid world backup contents: ' + checkedWorld.issues.map(issueText).join('; ')
        };
      }
      worldResult = checkedWorld;
    }

    const totals = rules.computeTotals(checked.state);
    const summary = {
      taskCount: checked.state.tasks.length,
      doneCount: rules.countCompleted(checked.state),
      ledgerCount: checked.state.ledger.length,
      xp: totals.xp,
      coins: totals.coins,
      resources: totals.resources,
      exportedAt: payload.exportedAt || now
    };
    return Object.freeze({
      ok: true,
      state: checked.state,
      summary,
      issues: checked.issues,
      hasWorld,
      worldState: worldResult ? worldResult.state : undefined,
      worldIssues: worldResult ? worldResult.issues.slice() : [],
      worldStructural: worldResult ? worldResult.structural : false
    });
  }

  return { APP_NAME, MAX_BYTES, exportState, parseImport, byteLength };
});
