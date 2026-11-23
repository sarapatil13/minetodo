const test = require('node:test');
const assert = require('node:assert/strict');
const interactionState = require('../src/world/interactionState.js');

const TARGETS = [
  { id: 'object:tree-north' },
  { id: 'object:starter-house' },
  { id: 'terrain:pond:8,5|9,5|8,6|9,6' }
];

test('createState starts with no hover, selection or keyboard focus', () => {
  const state = interactionState.createState(TARGETS.length);
  assert.deepEqual(state, {
    hoverId: null,
    selectedId: null,
    keyboardFocusId: null,
    lastPointerCss: null,
    lastPointerType: null,
    pointerInside: false,
    targetCount: 3
  });
  assert.ok(Object.isFrozen(state));
});

test('hover and selection transitions return new frozen state only when changed', () => {
  const initial = interactionState.createState(TARGETS.length);
  const hovered = interactionState.setHover(initial, 'object:starter-house');

  assert.notStrictEqual(hovered, initial);
  assert.equal(hovered.hoverId, 'object:starter-house');
  assert.strictEqual(interactionState.setHover(hovered, 'object:starter-house'), hovered);

  const selected = interactionState.setSelected(hovered, 'object:starter-house');
  assert.equal(selected.selectedId, 'object:starter-house');
  assert.strictEqual(interactionState.setSelected(selected, 'object:starter-house'), selected);

  const cleared = interactionState.setSelected(selected, null);
  assert.equal(cleared.selectedId, null);
  assert.ok(Object.isFrozen(cleared));
});

test('invalid or unknown target ids are ignored', () => {
  const initial = interactionState.createState(TARGETS.length);
  assert.strictEqual(interactionState.setSelected(initial, 'object:missing'), initial);
  assert.strictEqual(interactionState.setHover(initial, ''), initial);
  assert.strictEqual(interactionState.setKeyboardFocus(initial, 42), initial);
});

test('keyboard focus moves through targets without wrapping', () => {
  const initial = interactionState.createState(TARGETS.length);
  const first = interactionState.moveFocus(initial, TARGETS, 1);
  assert.equal(first.keyboardFocusId, TARGETS[0].id);

  const second = interactionState.moveFocus(first, TARGETS, 1);
  assert.equal(second.keyboardFocusId, TARGETS[1].id);

  const third = interactionState.moveFocus(second, TARGETS, 1);
  assert.equal(third.keyboardFocusId, TARGETS[2].id);

  const last = interactionState.moveFocus(third, TARGETS, 1);
  assert.strictEqual(last, third);

  const back = interactionState.moveFocus(last, TARGETS, -1);
  assert.equal(back.keyboardFocusId, TARGETS[1].id);
});

test('pointer cache records CSS point, pointer type and inside state', () => {
  const initial = interactionState.createState(TARGETS.length);
  const point = { x: 120.5, y: 84.25 };
  const next = interactionState.setPointer(initial, point, 'touch', true);

  assert.deepEqual(next.lastPointerCss, point);
  assert.equal(next.lastPointerType, 'touch');
  assert.equal(next.pointerInside, true);
  assert.notStrictEqual(next.lastPointerCss, point);
  assert.ok(Object.isFrozen(next.lastPointerCss));

  const outside = interactionState.setPointer(next, null, null, false);
  assert.equal(outside.lastPointerCss, null);
  assert.equal(outside.pointerInside, false);
});
