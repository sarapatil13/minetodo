(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const coords = isNode ? require('./coords.js') : root.CQ.worldCoords;
  const api = factory(coords);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldSelectableTargets = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (coords) {
  'use strict';

  const DEFAULT_TERRAIN_TYPES = Object.freeze(['pond', 'water']);
  const ISSUE_CODES = Object.freeze({
    INVALID_SCENE: 'INVALID_SCENE',
    INVALID_TARGET_ID: 'INVALID_TARGET_ID',
    DUPLICATE_TARGET_ID: 'DUPLICATE_TARGET_ID',
    UNSUPPORTED_OBJECT_KIND: 'UNSUPPORTED_OBJECT_KIND',
    INVALID_TARGET_ANCHOR: 'INVALID_TARGET_ANCHOR'
  });

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function addIssue(issues, code, path, message, details) {
    issues.push(Object.freeze({
      code,
      path,
      message,
      details: details || {}
    }));
  }

  function compareText(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  function compareTargets(a, b) {
    if (a.order !== b.order) return a.order - b.order;
    return compareText(a.id, b.id);
  }

  function compareTileKey(a, b) {
    const left = a.split(',');
    const right = b.split(',');
    const rowCompare = Number(left[1]) - Number(right[1]);
    if (rowCompare !== 0) return rowCompare;
    return Number(left[0]) - Number(right[0]);
  }

  function tileKey(col, row) {
    return col + ',' + row;
  }

  function cloneDiamond(diamond) {
    if (!Array.isArray(diamond)) return null;
    return Object.freeze(diamond.map((point) => Object.freeze({
      x: point.x,
      y: point.y
    })));
  }

  function buildObjectTarget(command, index, objectKinds, issues) {
    const path = 'commands[' + index + ']';
    const object = command.object;
    const sourceId = object && object.id;

    if (typeof sourceId !== 'string' || sourceId.trim().length === 0) {
      addIssue(issues, ISSUE_CODES.INVALID_TARGET_ID, path + '.object.id',
        'Object target id must be a non-empty string.');
      return null;
    }

    if (objectKinds.indexOf(command.kind) === -1) {
      addIssue(issues, ISSUE_CODES.UNSUPPORTED_OBJECT_KIND, path + '.kind',
        'Object target kind is not supported.', { actual: String(command.kind) });
      return null;
    }

    if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) {
      addIssue(issues, ISSUE_CODES.INVALID_TARGET_ANCHOR, path,
        'Object command must have a finite scene anchor.');
      return null;
    }

    return Object.freeze({
      id: 'object:' + sourceId,
      category: 'object',
      sourceId,
      commandId: command.id,
      commandIds: Object.freeze([command.id]),
      commandIndexes: Object.freeze([index]),
      kind: command.kind,
      col: command.col,
      row: command.row,
      variant: command.variant,
      order: index,
      focusPoint: Object.freeze({ x: command.x, y: command.y }),
      command
    });
  }

  function buildTerrainTargets(commands, terrainTypes, issues) {
    const byCell = new Map();

    commands.forEach((command, index) => {
      if (!isRecord(command) || command.layer !== 'ground') return;
      if (terrainTypes.indexOf(command.type) === -1) return;
      if (!Number.isSafeInteger(command.col) || !Number.isSafeInteger(command.row)) return;

      const key = tileKey(command.col, command.row);
      if (byCell.has(key)) {
        addIssue(issues, ISSUE_CODES.DUPLICATE_TARGET_ID, 'commands[' + index + ']',
          'Duplicate terrain tile command was ignored.', { key });
        return;
      }
      byCell.set(key, { command, index, key });
    });

    const visited = new Set();
    const targets = [];

    for (const entry of byCell.values()) {
      if (visited.has(entry.key)) continue;

      const component = [];
      const queue = [entry];
      visited.add(entry.key);

      while (queue.length > 0) {
        const current = queue.shift();
        component.push(current);

        const neighbours = [
          tileKey(current.command.col + 1, current.command.row),
          tileKey(current.command.col - 1, current.command.row),
          tileKey(current.command.col, current.command.row + 1),
          tileKey(current.command.col, current.command.row - 1)
        ];

        for (const key of neighbours) {
          if (!visited.has(key) && byCell.has(key)) {
            visited.add(key);
            queue.push(byCell.get(key));
          }
        }
      }

      component.sort((a, b) => compareTileKey(a.key, b.key));
      const keys = component.map((item) => item.key);
      const type = component[0].command.type;
      const tiles = Object.freeze(component.map((item) => Object.freeze({
        col: item.command.col,
        row: item.command.row,
        type: item.command.type,
        variant: item.command.variant,
        commandId: item.command.id,
        commandIndex: item.index,
        x: item.command.x,
        y: item.command.y,
        diamond: cloneDiamond(item.command.diamond)
      })));
      const commandIndexes = Object.freeze(component.map((item) => item.index));
      const first = tiles[0];

      targets.push(Object.freeze({
        id: 'terrain:' + type + ':' + keys.join('|'),
        category: 'terrain',
        sourceId: type,
        kind: type === 'pond' ? 'pond' : type,
        type,
        commandIds: Object.freeze(component.map((item) => item.command.id)),
        commandIndexes,
        tiles,
        order: Math.min.apply(null, commandIndexes),
        focusPoint: Object.freeze({ x: first.x, y: first.y })
      }));
    }

    return targets;
  }

  function buildSelectableTargets(scene, options) {
    const settings = options || {};
    const issues = [];
    const objectKinds = Array.isArray(settings.objectKinds)
      ? settings.objectKinds.slice()
      : Object.keys(coords.OBJECT_EXTENTS);
    const terrainTypes = Array.isArray(settings.terrainTypes)
      ? settings.terrainTypes.slice()
      : DEFAULT_TERRAIN_TYPES.slice();

    if (!isRecord(scene) || !Array.isArray(scene.commands)) {
      addIssue(issues, ISSUE_CODES.INVALID_SCENE, 'scene',
        'Scene must contain a command array.');
      return Object.freeze({
        targets: Object.freeze([]),
        byId: Object.freeze(Object.create(null)),
        issues: Object.freeze(issues)
      });
    }

    const targets = [];
    const byId = Object.create(null);

    scene.commands.forEach((command, index) => {
      if (!isRecord(command) || command.layer !== 'object') return;
      const target = buildObjectTarget(command, index, objectKinds, issues);
      if (!target) return;

      if (byId[target.id]) {
        addIssue(issues, ISSUE_CODES.DUPLICATE_TARGET_ID, 'commands[' + index + ']',
          'Object target id must be unique.', { id: target.id });
        return;
      }

      byId[target.id] = target;
      targets.push(target);
    });

    for (const target of buildTerrainTargets(scene.commands, terrainTypes, issues)) {
      if (byId[target.id]) {
        addIssue(issues, ISSUE_CODES.DUPLICATE_TARGET_ID, target.id,
          'Terrain target id collided with another target.', { id: target.id });
        continue;
      }
      byId[target.id] = target;
      targets.push(target);
    }

    targets.sort(compareTargets);
    return Object.freeze({
      targets: Object.freeze(targets),
      byId: Object.freeze(byId),
      issues: Object.freeze(issues)
    });
  }

  function capitalize(value) {
    const text = String(value || '');
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  function prettifyId(value) {
    return String(value || '')
      .split(/[-_]+/)
      .filter(Boolean)
      .map(capitalize)
      .join(' ');
  }

  function describeTarget(target) {
    if (!isRecord(target)) return null;

    if (target.category === 'terrain') {
      const variants = target.tiles
        .map((tile) => tile.variant)
        .filter((variant) => Number.isFinite(variant))
        .sort((a, b) => a - b);
      const coordinates = target.tiles
        .map((tile) => tile.col + ',' + tile.row)
        .join(' · ');

      return Object.freeze({
        name: target.kind === 'pond' ? 'Pond' : capitalize(target.kind),
        typeLabel: 'Terrain · ' + (target.kind === 'pond' ? 'Water' : capitalize(target.kind)),
        facts: Object.freeze([
          Object.freeze({ label: 'Tiles', value: String(target.tiles.length) }),
          Object.freeze({ label: 'Coordinates', value: coordinates }),
          Object.freeze({ label: 'Variants', value: variants.join(', ') })
        ])
      });
    }

    return Object.freeze({
      name: prettifyId(target.sourceId),
      typeLabel: capitalize(target.kind),
      facts: Object.freeze([
        Object.freeze({ label: 'ID', value: String(target.sourceId) }),
        Object.freeze({ label: 'Kind', value: String(target.kind) }),
        Object.freeze({ label: 'Grid', value: 'col ' + target.col + ', row ' + target.row }),
        Object.freeze({ label: 'Variant', value: String(target.variant) })
      ])
    });
  }

  return {
    ISSUE_CODES,
    buildSelectableTargets,
    describeTarget,
    prettifyId
  };
});
