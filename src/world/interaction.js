(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const hitTest = isNode ? require('./hitTest.js') : root.CQ.worldHitTest;
  const selectableTargets = isNode
    ? require('./selectableTargets.js')
    : root.CQ.worldSelectableTargets;
  const interactionState = isNode
    ? require('./interactionState.js')
    : root.CQ.worldInteractionState;
  const infoPanel = isNode ? require('./infoPanel.js') : root.CQ.worldInfoPanel;
  const api = factory(root, hitTest, selectableTargets, interactionState, infoPanel);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldInteraction = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  root,
  hitTest,
  selectableTargets,
  interactionState,
  infoPanel
) {
  'use strict';

  const HOVER_CLASS = 'has-hover';

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function visualKey(state) {
    return [state.hoverId, state.selectedId, state.keyboardFocusId].join('\u0000');
  }

  function create(canvas, dependencies) {
    if (!isRecord(canvas) || !isRecord(dependencies) || !isRecord(dependencies.scene)) {
      return null;
    }

    const deps = dependencies;
    let index = selectableTargets.buildSelectableTargets(deps.scene, deps.targetOptions);
    let ids = Object.freeze(index.targets.map((target) => target.id));
    let state = interactionState.createState(index.targets.length);
    let destroyed = false;
    let panelHandle = infoPanel.attach(deps.infoPanel, {
      onClose() {
        clearSelection();
      }
    });

    function requestRender() {
      if (typeof deps.requestRender === 'function') deps.requestRender();
    }

    function focusCanvas() {
      if (typeof canvas.focus === 'function') canvas.focus();
    }

    function syncHoverClass() {
      if (!canvas.classList || typeof canvas.classList.contains !== 'function') return;
      const shouldHover = typeof state.hoverId === 'string';
      if (canvas.classList.contains(HOVER_CLASS) === shouldHover) return;
      if (shouldHover && typeof canvas.classList.add === 'function') {
        canvas.classList.add(HOVER_CLASS);
      } else if (!shouldHover && typeof canvas.classList.remove === 'function') {
        canvas.classList.remove(HOVER_CLASS);
      }
    }

    // Pointer position is cached but only visual state changes schedule a
    // redraw. This keeps hover movement over the same target allocation-free
    // from the renderer's point of view.
    function commit(nextState, options) {
      const settings = options || {};
      if (nextState === state) return false;
      const changed = visualKey(nextState) !== visualKey(state);
      state = nextState;
      syncHoverClass();
      if (changed && settings.scheduleRender !== false) requestRender();
      return changed;
    }

    function descriptionFor(id) {
      const target = typeof id === 'string' ? index.byId[id] : null;
      if (!target) return null;
      const description = selectableTargets.describeTarget(target);
      if (!description) return null;
      return Object.assign({}, description, { id: target.id });
    }

    function syncPanel() {
      if (panelHandle && typeof panelHandle.update === 'function') {
        panelHandle.update(descriptionFor(state.selectedId));
      }
    }

    // Progression updates rebuild the target index in place. The interaction
    // handle, its camera callbacks, canvas listeners and panel handle all stay
    // alive; only index-derived state is replaced.
    function setScene(nextScene) {
      if (destroyed || !isRecord(nextScene) || !Array.isArray(nextScene.commands)) return false;

      const nextIndex = selectableTargets.buildSelectableTargets(nextScene, deps.targetOptions);
      if (nextIndex.issues.length) return false;

      index = nextIndex;
      ids = Object.freeze(nextIndex.targets.map((target) => target.id));

      function stillExists(id) {
        return typeof id === 'string' && Boolean(index.byId[id]);
      }

      const changes = { targetCount: nextIndex.targets.length };
      if (!stillExists(state.hoverId)) changes.hoverId = null;
      if (!stillExists(state.selectedId)) changes.selectedId = null;
      if (!stillExists(state.keyboardFocusId)) changes.keyboardFocusId = null;

      commit(Object.freeze(Object.assign({}, state, changes)), { scheduleRender: false });
      syncPanel();
      requestRender();
      return true;
    }

    function setSelection(id) {
      const targetId = typeof id === 'string' && index.byId[id] ? id : null;
      if (state.selectedId === targetId) return false;
      const changed = commit(interactionState.setSelected(state, targetId));
      syncPanel();
      if (targetId !== null) focusCanvas();
      return changed;
    }

    function clearSelection() {
      const changed = setSelection(null);
      focusCanvas();
      return changed;
    }

    function pickTarget(point, pointerType) {
      if (!isRecord(point)) return null;
      // Resolving the viewport first lets the controller refresh any pending
      // size/clamp change before the camera is read for coordinate conversion.
      const viewport = typeof deps.getViewport === 'function' ? deps.getViewport() : null;
      const cameraState = typeof deps.getCamera === 'function' ? deps.getCamera() : null;
      const context = {
        camera: cameraState,
        viewport,
        targets: index.targets
      };
      if (Number.isFinite(deps.toleranceCss)) context.toleranceCss = deps.toleranceCss;
      return hitTest.pick(point, context, pointerType);
    }

    function handleTap(point, event, pointerType) {
      if (destroyed) return false;
      const target = pickTarget(point, pointerType);
      return setSelection(target ? target.id : null);
    }

    function handleHoverMove(point, event, pointerType) {
      if (destroyed) return false;
      const previousId = state.hoverId;
      const target = pickTarget(point, pointerType);
      let next = interactionState.setPointer(
        state,
        point,
        pointerType,
        Boolean(target || isRecord(point))
      );
      next = interactionState.setHover(next, target ? target.id : null);
      const changed = commit(next);
      return changed || previousId !== state.hoverId;
    }

    function handleHoverEnd(event) {
      if (destroyed) return false;
      let next = interactionState.setHover(state, null);
      next = interactionState.setPointer(next, null, null, false);
      return commit(next);
    }

    function refreshHover(options) {
      if (destroyed || !state.pointerInside || !state.lastPointerCss) return false;
      const target = pickTarget(state.lastPointerCss, state.lastPointerType);
      const next = interactionState.setHover(state, target ? target.id : null);
      return commit(next, options);
    }

    function handleNavigate(direction, event) {
      if (destroyed || index.targets.length === 0) return false;
      const step = direction >= 0 ? 1 : -1;
      const next = interactionState.moveFocus(state, index.targets, step);
      const changed = commit(next);
      if (changed) focusCanvas();
      return changed;
    }

    function handleActivate(event) {
      if (destroyed || typeof state.keyboardFocusId !== 'string') return false;
      return setSelection(state.keyboardFocusId);
    }

    function handleClear(event) {
      if (destroyed) return false;
      return clearSelection();
    }

    function feedback() {
      return Object.freeze({
        hoverId: state.hoverId,
        selectedId: state.selectedId,
        keyboardFocusId: state.keyboardFocusId,
        targetsById: index.byId
      });
    }

    function inspect() {
      return Object.freeze({
        hoverId: state.hoverId,
        selectedId: state.selectedId,
        keyboardFocusId: state.keyboardFocusId,
        lastPointerCss: state.lastPointerCss,
        lastPointerType: state.lastPointerType,
        pointerInside: state.pointerInside,
        targetCount: state.targetCount,
        targets: ids,
        issues: index.issues,
        panelOpen: Boolean(panelHandle && typeof panelHandle.isOpen === 'function' && panelHandle.isOpen())
      });
    }

    return {
      handleTap,
      handleHoverMove,
      handleHoverEnd,
      refreshHover,
      handleNavigate,
      handleActivate,
      handleClear,
      setScene,
      feedback,
      inspect,
      destroy() {
        if (destroyed) return false;
        destroyed = true;
        state = interactionState.createState(0);
        if (canvas.classList && typeof canvas.classList.remove === 'function') {
          canvas.classList.remove(HOVER_CLASS);
        }
        if (panelHandle && typeof panelHandle.destroy === 'function') panelHandle.destroy();
        panelHandle = null;
        return true;
      }
    };
  }

  return { create };
});
