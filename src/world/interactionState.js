(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldInteractionState = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isValidId(id) {
    return id === null || (typeof id === 'string' && id.trim().length > 0);
  }

  function hasTargets(state) {
    return Number.isInteger(state.targetCount) && state.targetCount > 0;
  }

  function copy(state, changes) {
    return Object.freeze(Object.assign({}, state, changes));
  }

  function createState(targetCount) {
    return Object.freeze({
      hoverId: null,
      selectedId: null,
      keyboardFocusId: null,
      lastPointerCss: null,
      lastPointerType: null,
      pointerInside: false,
      targetCount: Number.isInteger(targetCount) && targetCount >= 0 ? targetCount : 0
    });
  }

  function setHover(state, id) {
    if (!isRecord(state) || !isValidId(id)) return state;
    if (id !== null && !hasTargets(state)) return state;
    if (state.hoverId === id) return state;
    return copy(state, { hoverId: id });
  }

  function setSelected(state, id) {
    if (!isRecord(state) || !isValidId(id)) return state;
    if (id !== null && !hasTargets(state)) return state;
    if (state.selectedId === id) return state;
    return copy(state, { selectedId: id });
  }

  function setKeyboardFocus(state, index) {
    if (!isRecord(state) || !Number.isInteger(index)) return state;
    if (index < 0 || index >= state.targetCount) return state;
    if (state.keyboardFocusId !== null && state.keyboardFocusId === index) return state;
    return copy(state, { keyboardFocusId: index });
  }

  function moveFocus(state, targets, step) {
    if (!isRecord(state) || !Array.isArray(targets) || targets.length === 0) return state;
    if (!Number.isFinite(step) || step === 0) return state;

    const direction = step > 0 ? 1 : -1;
    let currentIndex = -1;
    if (typeof state.keyboardFocusId === 'number') {
      currentIndex = state.keyboardFocusId;
    } else if (typeof state.keyboardFocusId === 'string') {
      currentIndex = targets.findIndex((target) => target && target.id === state.keyboardFocusId);
    }

    const nextIndex = Math.min(
      targets.length - 1,
      Math.max(0, currentIndex + direction)
    );
    const nextId = targets[nextIndex] && targets[nextIndex].id;
    if (typeof nextId !== 'string' || state.keyboardFocusId === nextId) return state;

    return copy(state, { keyboardFocusId: nextId });
  }

  function setPointer(state, point, pointerType, inside) {
    if (!isRecord(state)) return state;

    let nextPoint = null;
    if (isRecord(point) && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      nextPoint = Object.freeze({ x: point.x, y: point.y });
    }

    const type = typeof pointerType === 'string' && pointerType ? pointerType : null;
    const isInside = Boolean(inside && nextPoint);
    const samePoint = (state.lastPointerCss === null && nextPoint === null) ||
      (state.lastPointerCss && nextPoint &&
        state.lastPointerCss.x === nextPoint.x && state.lastPointerCss.y === nextPoint.y);

    if (samePoint && state.lastPointerType === type && state.pointerInside === isInside) {
      return state;
    }

    return copy(state, {
      lastPointerCss: nextPoint,
      lastPointerType: type,
      pointerInside: isInside
    });
  }

  return {
    createState,
    setHover,
    setSelected,
    setKeyboardFocus,
    moveFocus,
    setPointer
  };
});
