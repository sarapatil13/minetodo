(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const camera = isNode ? require('./camera.js') : root.CQ.worldCamera;
  const api = factory(camera);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldCameraInput = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (camera) {
  'use strict';

  const WHEEL_SENSITIVITY = 0.0015;
  const PAN_CLASS = 'is-panning';
  const DEFAULT_TAP_THRESHOLDS = Object.freeze({ mouse: 6, touch: 10 });
  const NAVIGATION_KEYS = Object.freeze({
    ArrowRight: 'forward',
    ArrowDown: 'forward',
    ArrowLeft: 'backward',
    ArrowUp: 'backward'
  });

  function clonePoint(point) {
    return { x: point.x, y: point.y };
  }

  function localPoint(canvas, event) {
    const rect = typeof canvas.getBoundingClientRect === 'function'
      ? canvas.getBoundingClientRect()
      : { left: 0, top: 0 };
    const clientX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const clientY = Number.isFinite(event.clientY) ? event.clientY : 0;
    const left = Number.isFinite(rect.left) ? rect.left : 0;
    const top = Number.isFinite(rect.top) ? rect.top : 0;
    return { x: clientX - left, y: clientY - top };
  }

  function pointerId(event) {
    return event && event.pointerId !== undefined ? event.pointerId : 'pointer';
  }

  function prevent(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
  }

  function hasClass(canvas, className) {
    return Boolean(canvas.classList && typeof canvas.classList.contains === 'function' &&
      canvas.classList.contains(className));
  }

  function setPanningClass(canvas, className, active) {
    if (!canvas.classList) return;
    if (active && typeof canvas.classList.add === 'function') {
      canvas.classList.add(className);
    } else if (!active && typeof canvas.classList.remove === 'function') {
      canvas.classList.remove(className);
    }
  }

  function capture(canvas, id) {
    try {
      if (typeof canvas.setPointerCapture === 'function') canvas.setPointerCapture(id);
    } catch (error) {
      // Pointer capture is an enhancement; a lost capture is handled below.
    }
  }

  function release(canvas, id) {
    try {
      if (typeof canvas.hasPointerCapture === 'function' && !canvas.hasPointerCapture(id)) return;
      if (typeof canvas.releasePointerCapture === 'function') canvas.releasePointerCapture(id);
    } catch (error) {
      // Ignore browsers that reject release after the pointer is gone.
    }
  }

  function normalizeWheelDelta(event, viewport) {
    const deltaY = Number.isFinite(event.deltaY) ? event.deltaY : 0;
    if (event.deltaMode === 1) return deltaY * 16;
    if (event.deltaMode === 2) return deltaY * (viewport && viewport.contentHeight > 0 ? viewport.contentHeight : 1);
    return deltaY;
  }

  function zoomStep(current) {
    const limits = current && current.limits;
    return limits && Number.isFinite(limits.zoomStep) && limits.zoomStep > 1
      ? limits.zoomStep
      : camera.DEFAULT_ZOOM_STEP;
  }

  function tapThresholds(settings) {
    const values = settings && settings.tapThresholds;
    return Object.freeze({
      mouse: values && Number.isFinite(values.mouse) && values.mouse >= 0
        ? values.mouse
        : DEFAULT_TAP_THRESHOLDS.mouse,
      touch: values && Number.isFinite(values.touch) && values.touch >= 0
        ? values.touch
        : DEFAULT_TAP_THRESHOLDS.touch
    });
  }

  function attach(canvas, handlers) {
    const inputHandlers = handlers || {};
    const settings = inputHandlers.options || {};
    const className = typeof settings.panningClass === 'string' ? settings.panningClass : PAN_CLASS;
    const thresholds = tapThresholds(settings);
    const pointers = new Map();
    const gestures = new Map();
    let lastSingle = null;
    let lastMidpoint = null;
    let lastDistance = null;
    let destroyed = false;

    function getCamera() {
      return typeof inputHandlers.getCamera === 'function' ? inputHandlers.getCamera() : null;
    }

    function setCamera(next) {
      if (typeof inputHandlers.setCamera === 'function') inputHandlers.setCamera(next);
    }

    function getViewport() {
      return typeof inputHandlers.getViewport === 'function' ? inputHandlers.getViewport() : null;
    }

    function getBounds() {
      return typeof inputHandlers.getBounds === 'function' ? inputHandlers.getBounds() : null;
    }

    function requestRender() {
      if (typeof inputHandlers.requestRender === 'function') inputHandlers.requestRender();
    }

    function emitHoverMove(point, event, pointerType) {
      if (typeof inputHandlers.onHoverMove === 'function') {
        inputHandlers.onHoverMove(point, event, pointerType);
      }
    }

    function emitHoverEnd(event) {
      if (typeof inputHandlers.onHoverEnd === 'function') inputHandlers.onHoverEnd(event);
    }

    function emitTap(point, event, pointerType) {
      if (typeof inputHandlers.onTap === 'function') {
        inputHandlers.onTap(point, event, pointerType);
      }
    }

    function emitNavigate(direction, event) {
      if (typeof inputHandlers.onNavigate === 'function') inputHandlers.onNavigate(direction, event);
    }

    function emitActivate(event) {
      if (typeof inputHandlers.onActivate === 'function') inputHandlers.onActivate(event);
    }

    function emitClear(event) {
      if (typeof inputHandlers.onClear === 'function') inputHandlers.onClear(event);
    }

    function resetBaselines() {
      const values = [...pointers.values()];
      if (values.length === 1) {
        lastSingle = clonePoint(values[0]);
        lastMidpoint = null;
        lastDistance = null;
      } else if (values.length >= 2) {
        lastSingle = null;
        lastMidpoint = {
          x: (values[0].x + values[1].x) / 2,
          y: (values[0].y + values[1].y) / 2
        };
        lastDistance = Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y);
      } else {
        lastSingle = null;
        lastMidpoint = null;
        lastDistance = null;
      }
    }

    function updateCursor() {
      setPanningClass(canvas, className, pointers.size > 0);
    }

    function onPointerDown(event) {
      if (destroyed) return;
      if (event.pointerType === 'mouse' && Number.isFinite(event.button) && event.button !== 0) return;

      prevent(event);
      const id = pointerId(event);
      const point = localPoint(canvas, event);
      if (pointers.size === 0) emitHoverEnd(event);
      pointers.set(id, point);
      gestures.set(id, {
        pointerType: event.pointerType || 'mouse',
        start: clonePoint(point),
        moved: false,
        multi: false
      });
      if (pointers.size > 1) {
        for (const gesture of gestures.values()) gesture.multi = true;
      }
      capture(canvas, id);
      resetBaselines();
      updateCursor();
      requestRender();
    }

    function onPointerMove(event) {
      if (destroyed) return;
      const id = pointerId(event);
      if (!pointers.has(id)) {
        if (pointers.size === 0) {
          const pointerType = event.pointerType || 'mouse';
          emitHoverMove(localPoint(canvas, event), event, pointerType);
        }
        return;
      }

      prevent(event);
      const point = localPoint(canvas, event);
      pointers.set(id, point);

      const gesture = gestures.get(id);
      if (gesture) {
        const limit = thresholds[gesture.pointerType] || thresholds.mouse;
        if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > limit) {
          gesture.moved = true;
        }
      }

      if (pointers.size === 1) {
        if (lastSingle) {
          setCamera(camera.panCamera(
            getCamera(),
            { x: point.x - lastSingle.x, y: point.y - lastSingle.y },
            getViewport(),
            getBounds()
          ));
        }
        lastSingle = clonePoint(point);
      } else if (pointers.size >= 2) {
        const values = [...pointers.values()];
        const midpoint = {
          x: (values[0].x + values[1].x) / 2,
          y: (values[0].y + values[1].y) / 2
        };
        const distance = Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y);

        if (lastMidpoint && lastDistance > 0 && distance > 0) {
          let next = camera.zoomCamera(
            getCamera(),
            distance / lastDistance,
            lastMidpoint,
            getViewport(),
            getBounds()
          );
          next = camera.panCamera(
            next,
            { x: midpoint.x - lastMidpoint.x, y: midpoint.y - lastMidpoint.y },
            getViewport(),
            getBounds()
          );
          setCamera(next);
        }

        lastMidpoint = midpoint;
        lastDistance = distance;
        lastSingle = null;
      }

      requestRender();
    }

    function onPointerEnd(event) {
      if (destroyed) return;
      const id = pointerId(event);
      if (!pointers.has(id)) return;

      prevent(event);
      const gesture = gestures.get(id);
      const shouldTap = event.type === 'pointerup' && gesture &&
        !gesture.moved && !gesture.multi && pointers.size === 1 &&
        !(event.pointerType === 'mouse' && Number.isFinite(event.button) && event.button !== 0);
      if (shouldTap) emitTap(localPoint(canvas, event), event, gesture.pointerType);

      pointers.delete(id);
      gestures.delete(id);
      release(canvas, id);
      resetBaselines();
      updateCursor();
      requestRender();
    }

    function onLostPointerCapture(event) {
      if (destroyed) return;
      const id = pointerId(event);
      if (!pointers.has(id)) return;
      pointers.delete(id);
      gestures.delete(id);
      resetBaselines();
      updateCursor();
      requestRender();
    }

    function onPointerLeave(event) {
      if (destroyed || pointers.size > 0) return;
      emitHoverEnd(event);
    }

    function onWheel(event) {
      if (destroyed) return;
      prevent(event);
      const viewport = getViewport();
      const delta = normalizeWheelDelta(event, viewport);
      const factor = Math.exp(-delta * WHEEL_SENSITIVITY);
      setCamera(camera.zoomCamera(
        getCamera(),
        factor,
        localPoint(canvas, event),
        viewport,
        getBounds()
      ));
      requestRender();
    }

    function onKeyDown(event) {
      if (destroyed || settings.enableKeyboard === false) return;
      const key = event.key;

      const navigation = NAVIGATION_KEYS[key];
      if (navigation || key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 'Escape') {
        prevent(event);
        if (navigation) emitNavigate(navigation === 'forward' ? 1 : -1, event);
        else if (key === 'Enter' || key === ' ' || key === 'Spacebar') emitActivate(event);
        else emitClear(event);
        return;
      }

      if (key !== '+' && key !== '=' && key !== '-' && key !== '_' && key !== '0') return;

      prevent(event);
      const current = getCamera();
      const viewport = getViewport() || camera.createViewport(null, 1, null);
      const bounds = getBounds();

      if (key === '0') {
        setCamera(camera.resetCamera(current, bounds));
      } else {
        const step = zoomStep(current);
        const factor = key === '+' || key === '=' ? step : 1 / step;
        setCamera(camera.zoomCamera(
          current,
          factor,
          { x: viewport.centerX, y: viewport.centerY },
          viewport,
          bounds
        ));
      }

      requestRender();
    }

    function suppress(event) {
      if (!destroyed) prevent(event);
    }

    const listeners = [
      ['pointerdown', onPointerDown, false],
      ['pointermove', onPointerMove, false],
      ['pointerup', onPointerEnd, false],
      ['pointercancel', onPointerEnd, false],
      ['lostpointercapture', onLostPointerCapture, false],
      ['pointerleave', onPointerLeave, false],
      ['wheel', onWheel, { passive: false }],
      ['keydown', onKeyDown, false],
      ['contextmenu', suppress, false],
      ['dragstart', suppress, false]
    ];

    if (!canvas || typeof canvas.addEventListener !== 'function') {
      return {
        destroy() {
          return false;
        }
      };
    }

    for (const [type, handler, options] of listeners) {
      canvas.addEventListener(type, handler, options);
    }

    return {
      destroy() {
        if (destroyed) return false;
        destroyed = true;
        for (const [type, handler] of listeners) {
          if (typeof canvas.removeEventListener === 'function') {
            canvas.removeEventListener(type, handler, false);
          }
        }
        const ids = [...pointers.keys()];
        for (const id of ids) release(canvas, id);
        pointers.clear();
        gestures.clear();
        resetBaselines();
        if (hasClass(canvas, className)) updateCursor();
        return true;
      }
    };
  }

  return { attach, DEFAULT_TAP_THRESHOLDS };
});
