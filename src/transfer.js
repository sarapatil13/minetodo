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

  const APP_NAME = 'CozyQuest';
  const MAX_BYTES = 1024 * 1024;

  function byteLength(text) {
    return new TextEncoder().encode(text).length;
  }

  function exportState(state, options = {}) {
    const validate = options.validateState || storage.validateState;
    const checked = validate(state);
    if (!checked.ok) throw new Error('Cannot export invalid state: ' + checked.issues.join('; '));
    return JSON.stringify({
      app: APP_NAME,
      schemaVersion: storage.SCHEMA_VERSION,
      exportedAt: options.now || new Date().toISOString(),
      state: checked.state
    }, null, 2);
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
    return { ok: true, state: checked.state, summary, issues: checked.issues };
  }

  return { APP_NAME, MAX_BYTES, exportState, parseImport, byteLength };
});
