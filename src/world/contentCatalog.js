(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const tiles = isNode ? require('./tiles.js') : root.CQ.worldTiles;
  const api = factory(tiles);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldContentCatalog = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (tiles) {
  'use strict';

  const DEFAULT_VARIANTS = tiles.DEFAULT_VARIANTS;
  const ALL_BIOMES = Object.freeze([
    'meadow',
    'forest',
    'lakeside',
    'autumn',
    'snowy'
  ]);

  // Catalog entries describe *what* an item is. They never describe an owned
  // copy or a placed instance; those identities live in world state.
  const ITEMS = Object.freeze([
    Object.freeze({
      id: 'decor:flower:daisy',
      label: 'Daisy Cluster',
      category: 'decoration',
      kind: 'flowers',
      variants: DEFAULT_VARIANTS,
      footprint: 'single-cell',
      biomes: Object.freeze(['meadow', 'forest', 'lakeside', 'autumn']),
      unlock: Object.freeze({ type: 'xp', minXp: 100 }),
      autoGrant: false,
      rotatable: false,
      rarity: 'common',
      migrationDefault: true
    }),
    Object.freeze({
      id: 'decor:shrub:lavender',
      label: 'Lavender Bush',
      category: 'decoration',
      kind: 'bush',
      variants: DEFAULT_VARIANTS,
      footprint: 'single-cell',
      biomes: Object.freeze(['meadow', 'forest', 'autumn']),
      unlock: Object.freeze({ type: 'xp', minXp: 250 }),
      autoGrant: false,
      rotatable: false,
      rarity: 'common',
      migrationDefault: true
    }),
    Object.freeze({
      id: 'decor:tree:oak',
      label: 'Little Oak',
      category: 'decoration',
      kind: 'tree',
      variants: DEFAULT_VARIANTS,
      footprint: 'single-cell',
      biomes: Object.freeze(['meadow', 'forest', 'lakeside', 'autumn']),
      unlock: Object.freeze({ type: 'xp', minXp: 500 }),
      autoGrant: false,
      rotatable: false,
      rarity: 'uncommon',
      migrationDefault: true
    }),
    Object.freeze({
      id: 'decor:reeds:cattail',
      label: 'Cattail Reeds',
      category: 'decoration',
      kind: 'reeds',
      variants: DEFAULT_VARIANTS,
      footprint: 'single-cell',
      biomes: Object.freeze(['meadow', 'lakeside', 'forest']),
      unlock: Object.freeze({ type: 'xp', minXp: 900 }),
      autoGrant: false,
      rotatable: false,
      rarity: 'common',
      migrationDefault: true
    }),
    Object.freeze({
      id: 'decor:fence:picket',
      label: 'Picket Fence',
      category: 'structure',
      kind: 'fence',
      variants: DEFAULT_VARIANTS,
      footprint: 'single-cell',
      biomes: Object.freeze(ALL_BIOMES),
      unlock: Object.freeze({ type: 'xp', minXp: 1400 }),
      autoGrant: false,
      rotatable: false,
      rarity: 'common',
      migrationDefault: true
    }),
    Object.freeze({
      id: 'decor:structure:cottage',
      label: 'Cottage Accent',
      category: 'structure',
      kind: 'house',
      variants: DEFAULT_VARIANTS,
      footprint: 'single-cell',
      biomes: Object.freeze(['meadow', 'forest', 'lakeside', 'autumn', 'snowy']),
      unlock: Object.freeze({ type: 'achievement', achievementId: 'achievement:ten-tasks' }),
      autoGrant: false,
      rotatable: false,
      rarity: 'uncommon',
      migrationDefault: true
    }),
    Object.freeze({
      id: 'decor:flower:snowdrop',
      label: 'Snowdrop Cluster',
      category: 'decoration',
      kind: 'flowers',
      variants: DEFAULT_VARIANTS,
      footprint: 'single-cell',
      biomes: Object.freeze(['snowy', 'meadow']),
      unlock: Object.freeze({ type: 'achievement', achievementId: 'achievement:twenty-rewards' }),
      autoGrant: false,
      rotatable: false,
      rarity: 'rare',
      migrationDefault: false
    })
  ]);

  const BY_ID = Object.freeze(ITEMS.reduce((map, item) => {
    map[item.id] = item;
    return map;
  }, Object.create(null)));

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function getItem(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id)
      ? BY_ID[id]
      : null;
  }

  function all() {
    return ITEMS;
  }

  function catalogIdForKind(kind) {
    const item = ITEMS.find((entry) => entry.kind === kind && entry.migrationDefault === true);
    return item ? item.id : null;
  }

  function supportsBiome(itemOrId, biomeId) {
    const item = typeof itemOrId === 'string' ? getItem(itemOrId) : itemOrId;
    if (!item || !isNonEmptyString(biomeId)) return false;
    if (!Array.isArray(item.biomes) || item.biomes.length === 0) return true;
    return item.biomes.indexOf(biomeId) !== -1;
  }

  function itemsForBiome(biomeId) {
    return ITEMS.filter((item) => supportsBiome(item, biomeId));
  }

  function isValidVariant(itemOrId, variant) {
    const item = typeof itemOrId === 'string' ? getItem(itemOrId) : itemOrId;
    return Boolean(item) && Number.isSafeInteger(variant) && variant >= 0 && variant < item.variants;
  }

  function validateDefinition(definition) {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return false;
    if (!isNonEmptyString(definition.id) || !getItem(definition.id)) return false;
    const item = getItem(definition.id);
    return item === definition;
  }

  return Object.freeze({
    ALL_BIOMES,
    ITEMS,
    getItem,
    all,
    catalogIdForKind,
    supportsBiome,
    itemsForBiome,
    isValidVariant,
    validateDefinition
  });
});
