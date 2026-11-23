(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const coords = isNode ? require('./coords.js') : root.CQ.worldCoords;
  const mapData = isNode ? require('./map.js') : root.CQ.worldMap;
  const renderer = isNode ? require('./renderer.js') : root.CQ.worldRenderer;
  const sceneData = isNode ? require('./scene.js') : root.CQ.worldScene;
  const camera = isNode ? require('./camera.js') : root.CQ.worldCamera;
  const cameraInput = isNode ? require('./cameraInput.js') : root.CQ.worldCameraInput;
  const interaction = isNode ? require('./interaction.js') : root.CQ.worldInteraction;
  const api = factory(root, coords, mapData, renderer, sceneData, camera, cameraInput, interaction);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, coords, mapData, renderer, sceneData, camera, cameraInput, interaction) {
  'use strict';

  const MAX_DPR = 3;

  function devicePixelRatio() {
    const value = root && root.devicePixelRatio;
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function computeCanvasMetrics(cssWidth, cssHeight, dpr, maxDpr) {
    const width = Number.isFinite(cssWidth) && cssWidth > 0 ? cssWidth : 1;
    const height = Number.isFinite(cssHeight) && cssHeight > 0 ? cssHeight : 1;
    const limit = Number.isFinite(maxDpr) && maxDpr > 0 ? maxDpr : MAX_DPR;
    const ratio = Math.min(Math.max(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, 0.1), limit);
    return {
      dpr: ratio,
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio))
    };
  }

  function computeView(bounds, width, height, options) {
    const settings = options || {};
    const padding = Number.isFinite(settings.padding) ? settings.padding : 8;
    const bottomReserve = Number.isFinite(settings.bottomReserve) ? settings.bottomReserve : 24;
    const maxScale = Number.isFinite(settings.maxScale) ? settings.maxScale : 1.4;
    const availableWidth = Math.max(1, width - padding * 2);
    const availableHeight = Math.max(1, height - bottomReserve - padding * 2);
    const scale = Math.min(
      availableWidth / Math.max(1, bounds.width),
      availableHeight / Math.max(1, bounds.height),
      maxScale
    );

    return {
      scale,
      x: padding + (availableWidth - bounds.width * scale) / 2 - bounds.minX * scale,
      y: padding + (availableHeight - bounds.height * scale) / 2 - bounds.minY * scale
    };
  }

  function createController(canvas, options) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;

    const settings = options || {};
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const world = settings.scene || sceneData.createScene(
      settings.map || mapData.createSampleMeadow(),
      { origin: settings.origin, tile: settings.tile }
    );
    const maxDpr = Number.isFinite(settings.maxDpr) ? settings.maxDpr : MAX_DPR;
    const observeTarget = settings.observeTarget || canvas.parentElement || canvas;

    // The camera is view state, not world state. Its configuration is fixed at
    // creation and every later operation reads it from this single object.
    let cameraState = camera.createCamera(world.bounds, settings.camera || {});
    let cameraInputHandle = null;
    let interactionHandle = null;
    let destroyed = false;
    let frame = 0;
    let observer = null;
    let dprQuery = null;
    let lastMetrics = null;
    let lastView = null;
    let lastViewport = null;
    let lastSize = { width: 0, height: 0 };

    function readSize() {
      const rect = typeof canvas.getBoundingClientRect === 'function'
        ? canvas.getBoundingClientRect()
        : null;
      const parent = canvas.parentElement;
      const width = (rect && rect.width) || (parent && parent.clientWidth) || 300;
      const height = (rect && rect.height) || (parent && parent.clientHeight) || 180;
      return { width: Math.max(1, width), height: Math.max(1, height) };
    }

    function resizeBackingStore(size) {
      const metrics = computeCanvasMetrics(size.width, size.height, devicePixelRatio(), maxDpr);
      if (canvas.width !== metrics.width) canvas.width = metrics.width;
      if (canvas.height !== metrics.height) canvas.height = metrics.height;
      return metrics;
    }

    function syncViewport() {
      const size = readSize();
      const baseView = computeView(world.bounds, size.width, size.height, settings);
      const viewport = camera.createViewport(size, baseView.scale, settings);
      cameraState = camera.clampCamera(cameraState, world.bounds, viewport);
      const view = camera.viewTransform(viewport, cameraState);

      lastSize = size;
      lastViewport = viewport;
      lastView = view;
      return { size, viewport, view };
    }

    function draw() {
      if (destroyed) return;
      const current = syncViewport();
      const size = current.size;
      const view = current.view;
      const metrics = resizeBackingStore(size);

      // Hover is screen-position state. A resize or camera clamp can move the
      // target under the cached pointer, so refresh before drawing without
      // scheduling another frame from inside the draw itself.
      if (interactionHandle) interactionHandle.refreshHover({ scheduleRender: false });

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, metrics.width, metrics.height);
      ctx.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
      renderer.drawBackdrop(ctx, size.width, size.height);

      ctx.save();
      ctx.translate(view.x, view.y);
      ctx.scale(view.scale, view.scale);
      renderer.drawWorld(ctx, world, interactionHandle ? interactionHandle.feedback() : null);
      ctx.restore();

      lastMetrics = metrics;
    }

    function requestRender() {
      if (destroyed || frame) return frame;
      const schedule = root && typeof root.requestAnimationFrame === 'function'
        ? root.requestAnimationFrame.bind(root)
        : (callback) => setTimeout(callback, 0);
      frame = schedule(() => {
        frame = 0;
        draw();
      });
      return frame;
    }

    function currentViewport() {
      if (destroyed) return lastViewport;
      return syncViewport().viewport;
    }

    function applyCamera(next) {
      if (destroyed) return;
      const viewport = currentViewport();
      cameraState = camera.normalizeCamera(next, world.bounds, viewport);
      lastView = camera.viewTransform(viewport, cameraState);
      requestRender();
    }

    function removeDprListener(query, handler) {
      if (!query || !handler) return;
      if (typeof query.removeEventListener === 'function') {
        query.removeEventListener('change', handler);
      } else if (typeof query.removeListener === 'function') {
        query.removeListener(handler);
      }
    }

    function addDprListener(query, handler) {
      if (!query) return;
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', handler);
      } else if (typeof query.addListener === 'function') {
        query.addListener(handler);
      }
    }

    function onDprChange() {
      removeDprListener(dprQuery, onDprChange);
      watchDpr();
      requestRender();
    }

    function watchDpr() {
      if (!root || typeof root.matchMedia !== 'function') return;
      dprQuery = root.matchMedia('(resolution: ' + devicePixelRatio() + 'dppx)');
      addDprListener(dprQuery, onDprChange);
    }

    function onResize() {
      requestRender();
    }

    // Establish the first valid viewport/backing store before input can run.
    const initial = syncViewport();
    lastMetrics = resizeBackingStore(initial.size);

    // Interaction owns semantic hover/tap/keyboard decisions; cameraInput
    // remains the only owner of canvas event listeners.
    interactionHandle = interaction && typeof interaction.create === 'function'
      ? interaction.create(canvas, {
        scene: world,
        infoPanel: settings.infoPanel,
        targetOptions: settings.targetOptions,
        toleranceCss: settings.toleranceCss,
        getCamera: () => cameraState,
        getViewport: currentViewport,
        requestRender
      })
      : null;

    cameraInputHandle = cameraInput.attach(canvas, {
      getCamera: () => cameraState,
      setCamera: applyCamera,
      getViewport: currentViewport,
      getBounds: () => world.bounds,
      requestRender,
      options: settings,
      onHoverMove: (point, event, pointerType) => {
        if (interactionHandle) interactionHandle.handleHoverMove(point, event, pointerType);
      },
      onHoverEnd: (event) => {
        if (interactionHandle) interactionHandle.handleHoverEnd(event);
      },
      onTap: (point, event, pointerType) => {
        if (interactionHandle) interactionHandle.handleTap(point, event, pointerType);
      },
      onNavigate: (direction, event) => {
        if (interactionHandle) interactionHandle.handleNavigate(direction, event);
      },
      onActivate: (event) => {
        if (interactionHandle) interactionHandle.handleActivate(event);
      },
      onClear: (event) => {
        if (interactionHandle) interactionHandle.handleClear(event);
      }
    });

    if (root && typeof root.addEventListener === 'function') {
      root.addEventListener('resize', onResize);
    }
    if (root && typeof root.ResizeObserver === 'function') {
      observer = new root.ResizeObserver(onResize);
      observer.observe(observeTarget);
    }
    watchDpr();
    requestRender();

    const handle = {
      world,
      requestRender,
      resize: requestRender,
      redraw: draw,
      inspect() {
        return {
          cssWidth: lastSize.width,
          cssHeight: lastSize.height,
          dpr: lastMetrics ? lastMetrics.dpr : devicePixelRatio(),
          backingWidth: lastMetrics ? lastMetrics.width : canvas.width,
          backingHeight: lastMetrics ? lastMetrics.height : canvas.height,
          view: lastView
            ? { x: lastView.x, y: lastView.y, scale: lastView.scale }
            : null,
          viewport: lastViewport,
          camera: camera.cloneCamera(cameraState),
          interaction: interactionHandle ? interactionHandle.inspect() : null
        };
      },
      destroy() {
        if (destroyed) return false;
        destroyed = true;
        if (cameraInputHandle && typeof cameraInputHandle.destroy === 'function') {
          cameraInputHandle.destroy();
        }
        cameraInputHandle = null;
        if (interactionHandle && typeof interactionHandle.destroy === 'function') {
          interactionHandle.destroy();
        }
        if (frame && root && typeof root.cancelAnimationFrame === 'function') {
          root.cancelAnimationFrame(frame);
        }
        frame = 0;
        if (observer && typeof observer.disconnect === 'function') observer.disconnect();
        observer = null;
        if (root && typeof root.removeEventListener === 'function') {
          root.removeEventListener('resize', onResize);
        }
        removeDprListener(dprQuery, onDprChange);
        dprQuery = null;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        return true;
      }
    };

    canvas.__cozyQuestWorldController = handle;
    return handle;
  }

  return {
    MAX_DPR,
    devicePixelRatio,
    computeCanvasMetrics,
    computeView,
    createController
  };
});
