(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).flowers = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VARIETIES = Object.freeze([
    Object.freeze({ id: 'blossom', name: 'Cherry blossom', glyph: '🌸' }),
    Object.freeze({ id: 'hibiscus', name: 'Hibiscus', glyph: '🌺' }),
    Object.freeze({ id: 'sunflower', name: 'Sunflower', glyph: '🌻' }),
    Object.freeze({ id: 'tulip', name: 'Tulip', glyph: '🌷' }),
    Object.freeze({ id: 'daisy', name: 'Daisy', glyph: '🌼' }),
    Object.freeze({ id: 'rose', name: 'Rose', glyph: '🌹' }),
    Object.freeze({ id: 'lotus', name: 'Lotus', glyph: '🪷' }),
    Object.freeze({ id: 'rosette', name: 'Rosette', glyph: '🏵️' })
  ]);

  function stableId(id) {
    if (typeof id !== 'string') return null;
    const trimmed = id.trim();
    return trimmed === '' ? null : trimmed;
  }

  // FNV-1a is deterministic across engines and uses only code units, so the
  // same task ID always maps to the same variety without storing anything.
  function hashId(id) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function flowerForId(id) {
    const normalized = stableId(id);
    if (normalized === null) return null;
    return VARIETIES[hashId(normalized) % VARIETIES.length];
  }

  function flowerForTask(task) {
    if (!task || typeof task !== 'object') return null;
    return flowerForId(task.id);
  }

  return {
    VARIETIES,
    flowerForId,
    flowerForTask
  };
});
