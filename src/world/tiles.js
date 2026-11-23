(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldTiles = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_VARIANTS = 5;

  // These are the raw IDs used by the Phase 2.1 renderer and sample meadow.
  // Canonical definitions are separate so aliases never rewrite stored data.
  const LEGACY_TERRAIN_IDS = Object.freeze(['grass', 'path', 'pond']);
  const CANONICAL_TERRAIN_IDS = Object.freeze([
    'grass',
    'dirt',
    'water',
    'stone',
    'sand'
  ]);
  const TERRAIN_ALIASES = Object.freeze({
    path: 'dirt',
    pond: 'water'
  });

  const TERRAIN_DEFINITIONS = Object.freeze([
    Object.freeze({
      id: 'grass',
      label: 'Grass',
      walkable: true,
      visualCategory: 'ground',
      variants: DEFAULT_VARIANTS
    }),
    Object.freeze({
      id: 'dirt',
      label: 'Dirt',
      walkable: true,
      visualCategory: 'ground',
      variants: DEFAULT_VARIANTS
    }),
    Object.freeze({
      id: 'water',
      label: 'Water',
      walkable: false,
      visualCategory: 'water',
      variants: DEFAULT_VARIANTS
    }),
    Object.freeze({
      id: 'stone',
      label: 'Stone',
      walkable: true,
      visualCategory: 'ground',
      variants: DEFAULT_VARIANTS
    }),
    Object.freeze({
      id: 'sand',
      label: 'Sand',
      walkable: true,
      visualCategory: 'ground',
      variants: DEFAULT_VARIANTS
    })
  ]);

  const DEFINITIONS_BY_ID = Object.create(null);
  for (const definition of TERRAIN_DEFINITIONS) {
    DEFINITIONS_BY_ID[definition.id] = definition;
  }

  function resolveTerrainType(type) {
    if (typeof type !== 'string') return null;
    if (Object.prototype.hasOwnProperty.call(DEFINITIONS_BY_ID, type)) {
      return DEFINITIONS_BY_ID[type].id;
    }
    if (Object.prototype.hasOwnProperty.call(TERRAIN_ALIASES, type)) {
      return TERRAIN_ALIASES[type];
    }
    return null;
  }

  function getTerrainDefinition(type) {
    const id = resolveTerrainType(type);
    if (!id) return null;
    const definition = DEFINITIONS_BY_ID[id];
    return {
      id: definition.id,
      label: definition.label,
      walkable: definition.walkable,
      visualCategory: definition.visualCategory,
      variants: definition.variants
    };
  }

  function isAllowedTerrainType(type) {
    return resolveTerrainType(type) !== null;
  }

  function isValidVariant(type, variant) {
    const definition = getTerrainDefinition(type);
    return Boolean(definition) &&
      Number.isInteger(variant) &&
      variant >= 0 &&
      variant < definition.variants;
  }

  function variantFor(col, row, salt, variants) {
    if (!Number.isInteger(col) || !Number.isInteger(row) || !Number.isInteger(salt)) {
      throw new TypeError('Variant coordinates and salt must be integers');
    }

    let variantCount = DEFAULT_VARIANTS;
    if (variants !== undefined) {
      if (!Number.isInteger(variants) || variants <= 0) {
        throw new TypeError('Variant count must be a positive integer');
      }
      variantCount = variants;
    }

    // Preserve the exact Phase 2.1 formula and its implicit five-variant default.
    return (col * 7 + row * 11 + salt * 5) % variantCount;
  }

  return {
    DEFAULT_VARIANTS,
    LEGACY_TERRAIN_IDS,
    CANONICAL_TERRAIN_IDS,
    TERRAIN_ALIASES,
    resolveTerrainType,
    getTerrainDefinition,
    isAllowedTerrainType,
    isValidVariant,
    variantFor
  };
});
