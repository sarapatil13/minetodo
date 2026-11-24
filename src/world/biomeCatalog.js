(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const mapData = isNode ? require('./map.js') : root.CQ.worldMap;
  const tiles = isNode ? require('./tiles.js') : root.CQ.worldTiles;
  const catalog = isNode ? require('./contentCatalog.js') : root.CQ.worldContentCatalog;
  const unlocks = isNode ? require('./unlocks.js') : root.CQ.worldUnlocks;
  const api = factory(mapData, tiles, catalog, unlocks);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldBiomeCatalog = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (mapData, tiles, catalog, unlocks) {
  'use strict';

  const TERRAIN_SALT = 11;

  const BIOMES = Object.freeze([
    Object.freeze({
      id: 'meadow',
      name: 'Meadow Haven',
      baseMapId: 'sample-meadow-v1',
      unlock: Object.freeze({ type: 'always' }),
      palette: null,
      terrainPreset: 'meadow'
    }),
    Object.freeze({
      id: 'forest',
      name: 'Whispering Forest',
      baseMapId: 'forest-v1',
      unlock: Object.freeze({ type: 'achievement', achievementId: 'achievement:ten-tasks' }),
      palette: Object.freeze({
        skyTop: '#e3eee0',
        skyBottom: '#d2e2d1',
        grass: Object.freeze(['#8fbd83', '#99c58c', '#86b57c', '#9cc990', '#91c086']),
        grassSide: '#679264',
        grassEdge: '#78a673',
        path: Object.freeze(['#cbb58d', '#c7b086', '#d0bc95', '#c3ab7f', '#cdb78d']),
        pathInner: '#dfcda8',
        pathSide: '#9c805e',
        leafDark: '#3e6a49',
        leafMid: '#4f8055',
        leafLight: '#639565',
        leafHighlight: '#7dae75'
      }),
      terrainPreset: 'forest'
    }),
    Object.freeze({
      id: 'lakeside',
      name: 'Lakeside Rest',
      baseMapId: 'lakeside-v1',
      unlock: Object.freeze({ type: 'xp', minXp: 500 }),
      palette: Object.freeze({
        skyTop: '#e7f2f1',
        skyBottom: '#d6e9e8',
        grass: Object.freeze(['#a7c9a0', '#b1d2a7', '#9ec395', '#adcfa3', '#a5c99c']),
        grassSide: '#7da281',
        grassEdge: '#8db48d',
        path: Object.freeze(['#e1cda4', '#ddc89e', '#e5d2ac', '#d9c397', '#e0cc9f']),
        pathInner: '#f0e0bd',
        pathSide: '#b49a70',
        water: Object.freeze(['#79bbc3', '#83c3ca', '#72b4bd', '#8ac8cc', '#7bbec6']),
        waterInner: '#b3dedf',
        waterSide: '#568f98'
      }),
      terrainPreset: 'lakeside'
    }),
    Object.freeze({
      id: 'autumn',
      name: 'Amber Hollow',
      baseMapId: 'autumn-v1',
      unlock: Object.freeze({ type: 'xp', minXp: 900 }),
      palette: Object.freeze({
        skyTop: '#f4ead8',
        skyBottom: '#e8d8bd',
        grass: Object.freeze(['#c3b46f', '#cabd76', '#b9a865', '#c6b674', '#bfae6c']),
        grassSide: '#8e7947',
        grassEdge: '#a08a53',
        path: Object.freeze(['#d8b17d', '#d3aa74', '#ddb985', '#cda56e', '#d5b079']),
        pathInner: '#e9cda3',
        pathSide: '#a37c50',
        leafDark: '#a76039',
        leafMid: '#c1763c',
        leafLight: '#d59043',
        leafHighlight: '#e5ad55',
        flowerPetal: Object.freeze(['#fff0c6', '#f3b9ad', '#e8c9e2', '#fff6d8'])
      }),
      terrainPreset: 'autumn'
    }),
    Object.freeze({
      id: 'snowy',
      name: 'Snowy Village',
      baseMapId: 'snowy-v1',
      unlock: Object.freeze({ type: 'achievement', achievementId: 'achievement:twenty-rewards' }),
      palette: Object.freeze({
        skyTop: '#edf3f6',
        skyBottom: '#dce8ee',
        grass: Object.freeze(['#e7eef0', '#edf3f4', '#e0e9ed', '#eaf1f3', '#e4edf0']),
        grassSide: '#b8c8cf',
        grassEdge: '#cbd9dd',
        path: Object.freeze(['#cbd9dc', '#c6d5d9', '#d2dfe2', '#c1d1d6', '#cedbe0']),
        pathInner: '#edf4f5',
        pathSide: '#9eb3bb',
        water: Object.freeze(['#8fb9c8', '#99c2cd', '#87b3c2', '#a0c8d1', '#92bac8']),
        waterInner: '#c7e0e6',
        waterSide: '#6f9aa9',
        leafDark: '#67837d',
        leafMid: '#78948d',
        leafLight: '#8fa8a0',
        leafHighlight: '#b8cac1'
      }),
      terrainPreset: 'snowy'
    })
  ]);

  const BY_ID = Object.freeze(BIOMES.reduce((map, biome) => {
    map[biome.id] = biome;
    return map;
  }, Object.create(null)));

  const PRESETS = Object.freeze({
    meadow: Object.freeze({}),
    forest: Object.freeze({
      path: Object.freeze([[3, 7], [4, 7], [4, 6], [5, 6], [5, 5], [6, 5], [6, 4], [6, 3]]),
      pond: Object.freeze([]),
      stone: Object.freeze([[1, 5], [2, 5], [3, 6]])
    }),
    lakeside: Object.freeze({
      path: Object.freeze([[3, 7], [4, 7], [4, 6], [5, 6], [5, 5], [6, 5], [6, 4], [6, 3]]),
      pond: Object.freeze([[8, 5], [9, 5], [8, 6], [9, 6], [7, 6], [7, 5], [9, 7]]),
      stone: Object.freeze([])
    }),
    autumn: Object.freeze({
      path: Object.freeze([[3, 7], [4, 7], [4, 6], [5, 6], [5, 5], [6, 5], [6, 4], [6, 3], [2, 6], [2, 5]]),
      pond: Object.freeze([[9, 6]]),
      stone: Object.freeze([[1, 6], [10, 5]])
    }),
    snowy: Object.freeze({
      path: Object.freeze([[3, 7], [4, 7], [4, 6], [5, 6], [5, 5], [6, 5], [6, 4], [6, 3]]),
      pond: Object.freeze([[8, 5], [9, 5], [8, 6], [9, 6], [0, 7], [1, 7]]),
      stone: Object.freeze([[2, 4], [3, 4], [10, 3]])
    })
  });

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (isRecord(value)) {
      const clone = {};
      Object.keys(value).forEach((key) => { clone[key] = cloneValue(value[key]); });
      return clone;
    }
    return value;
  }

  function cellSet(cells) {
    const result = new Set();
    cells.forEach(([col, row]) => result.add(col + ',' + row));
    return result;
  }

  function getBiome(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BY_ID, id)
      ? BY_ID[id]
      : null;
  }

  function all() {
    return BIOMES;
  }

  function paletteFor(id) {
    const biome = getBiome(id);
    return biome && biome.palette ? cloneValue(biome.palette) : null;
  }

  function applyTerrainPreset(map, biome) {
    if (biome.terrainPreset === 'meadow') return map;
    const preset = PRESETS[biome.terrainPreset] || PRESETS.meadow;
    const path = cellSet(preset.path);
    const pond = cellSet(preset.pond);
    const stone = cellSet(preset.stone);

    for (let row = 0; row < map.height; row += 1) {
      for (let col = 0; col < map.width; col += 1) {
        const key = col + ',' + row;
        let type = 'grass';
        if (path.has(key)) type = 'path';
        if (pond.has(key)) type = 'pond';
        if (stone.has(key)) type = 'path';
        const definition = tiles.getTerrainDefinition(type);
        map.tiles[row][col] = {
          type,
          variant: tiles.variantFor(col, row, TERRAIN_SALT, definition.variants)
        };
      }
    }
    return map;
  }

  function createBaseMap(id) {
    const biome = getBiome(id);
    if (!biome) throw new Error('Unknown biome id: ' + String(id));
    const map = id === 'meadow'
      ? mapData.createSampleMeadow()
      : cloneValue(mapData.createSampleMeadow());
    map.name = biome.name;
    return applyTerrainPreset(map, biome);
  }

  function supportsItem(biomeId, itemOrId) {
    const biome = getBiome(biomeId);
    if (!biome) return false;
    return catalog.supportsBiome(itemOrId, biomeId);
  }

  function entries() {
    return BIOMES.map((biome) => ({ id: biome.id, unlock: biome.unlock }));
  }

  function evaluateUnlocks(options) {
    const settings = options || {};
    return unlocks.evaluateEntries(entries(), Object.assign({ catalog: api }, settings));
  }

  const api = Object.freeze({
    BIOMES,
    TERRAIN_SALT,
    getBiome,
    all,
    paletteFor,
    createBaseMap,
    supportsItem,
    entries,
    evaluateUnlocks
  });

  return api;
});
