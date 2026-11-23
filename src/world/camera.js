(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const coords = isNode ? require('./coords.js') : root.CQ.worldCoords;
  const api = factory(coords);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldCamera = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (coords) {
  'use strict';

  // Zoom limits live inside the camera state. A camera created with custom
  // limits therefore carries them through every later camera operation.
  const DEFAULT_MIN_ZOOM = 0.6;
  const DEFAULT_MAX_ZOOM = 3;
  const DEFAULT_ZOOM_STEP = 1.15;
  const DEFAULT_PADDING = 8;
  const DEFAULT_BOTTOM_RESERVE = 24;
  const MAX_FACTOR = 1.18;
  const MIN_FACTOR = 1 / MAX_FACTOR;
  const MIN_OVERLAP_PX = 64;
  const EPSILON = 1e-9;

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function positiveOr(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function normalizeZoomLimits(options) {
    const source = isRecord(options) ? options : {};
    let nested = null;
    if (isRecord(source.zoomLimits)) nested = source.zoomLimits;
    else if (isRecord(source.limits)) nested = source.limits;

    const values = nested || source;
    const rawMin = positiveOr(values.minZoom, DEFAULT_MIN_ZOOM);
    const rawMax = positiveOr(values.maxZoom, DEFAULT_MAX_ZOOM);
    const reversed = rawMin > rawMax;
    const minZoom = reversed ? DEFAULT_MIN_ZOOM : rawMin;
    const maxZoom = reversed ? DEFAULT_MAX_ZOOM : rawMax;
    const zoomStep = Math.max(
      1 + EPSILON,
      positiveOr(values.zoomStep, DEFAULT_ZOOM_STEP)
    );

    return Object.freeze({ minZoom, maxZoom, zoomStep });
  }

  function readZoomLimits(camera) {
    return normalizeZoomLimits(camera);
  }

  function clampZoom(zoom, limits) {
    return clamp(zoom, limits.minZoom, limits.maxZoom);
  }

  function cameraState(focusX, focusY, zoom, limits) {
    return Object.freeze({
      focusX: finiteOr(focusX, 0),
      focusY: finiteOr(focusY, 0),
      zoom: clampZoom(zoom, limits),
      limits
    });
  }

  function normalizeBounds(bounds) {
    const source = isRecord(bounds) ? bounds : {};
    const hasX = Number.isFinite(source.minX) || Number.isFinite(source.maxX);
    const hasY = Number.isFinite(source.minY) || Number.isFinite(source.maxY);
    let minX = hasX ? finiteOr(source.minX, 0) : 0;
    let maxX = hasX ? finiteOr(source.maxX, minX) : positiveOr(source.width, 0);
    let minY = hasY ? finiteOr(source.minY, 0) : 0;
    let maxY = hasY ? finiteOr(source.maxY, minY) : positiveOr(source.height, 0);

    if (minX > maxX) {
      const swap = minX;
      minX = maxX;
      maxX = swap;
    }
    if (minY > maxY) {
      const swap = minY;
      minY = maxY;
      maxY = swap;
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  function boundsCenter(bounds) {
    const normalized = normalizeBounds(bounds);
    return {
      x: (normalized.minX + normalized.maxX) / 2,
      y: (normalized.minY + normalized.maxY) / 2
    };
  }

  function createCamera(bounds, options) {
    const limits = normalizeZoomLimits(options);
    const center = boundsCenter(bounds);
    return cameraState(center.x, center.y, 1, limits);
  }

  function cloneCamera(camera) {
    const source = isRecord(camera) ? camera : {};
    const limits = readZoomLimits(source);
    return cameraState(source.focusX, source.focusY, source.zoom, limits);
  }

  function resetCamera(camera, bounds) {
    const limits = readZoomLimits(camera);
    const center = boundsCenter(bounds);
    return cameraState(center.x, center.y, 1, limits);
  }

  function normalizeCamera(camera, bounds, viewport) {
    const source = isRecord(camera) ? camera : {};
    const limits = readZoomLimits(source);
    const center = boundsCenter(bounds);
    const next = cameraState(
      finiteOr(source.focusX, center.x),
      finiteOr(source.focusY, center.y),
      source.zoom,
      limits
    );
    if (!isRecord(viewport)) return next;
    return clampCamera(next, bounds, viewport);
  }

  function createViewport(size, baseViewScale, settings) {
    const source = isRecord(size) ? size : {};
    const options = isRecord(settings) ? settings : {};
    const padding = finiteOr(options.padding, DEFAULT_PADDING);
    const bottomReserve = finiteOr(options.bottomReserve, DEFAULT_BOTTOM_RESERVE);
    const width = positiveOr(source.width, 1);
    const height = positiveOr(source.height, 1);
    const contentWidth = Math.max(1, width - padding * 2);
    const contentHeight = Math.max(1, height - bottomReserve - padding * 2);

    return Object.freeze({
      width,
      height,
      padding,
      bottomReserve,
      contentWidth,
      contentHeight,
      centerX: padding + contentWidth / 2,
      centerY: padding + contentHeight / 2,
      baseScale: positiveOr(baseViewScale, 1)
    });
  }

  function normalizeViewport(viewport) {
    if (isRecord(viewport)) return viewport;
    return createViewport(null, 1, null);
  }

  function viewTransform(viewport, cameraStateValue) {
    const view = normalizeViewport(viewport);
    const state = normalizeCamera(cameraStateValue, null, null);
    const scale = view.baseScale * state.zoom;
    return Object.freeze({
      x: view.centerX - state.focusX * scale,
      y: view.centerY - state.focusY * scale,
      scale
    });
  }

  function readPoint(value, fallbackY) {
    if (isRecord(value)) {
      return {
        x: finiteOr(value.x, 0),
        y: finiteOr(value.y, 0)
      };
    }
    return {
      x: finiteOr(value, 0),
      y: finiteOr(fallbackY, 0)
    };
  }

  function sceneToScreen(point, viewport, cameraStateValue) {
    const view = normalizeViewport(viewport);
    const state = normalizeCamera(cameraStateValue, null, null);
    const scene = readPoint(point);
    const scale = view.baseScale * state.zoom;
    return {
      x: view.centerX + (scene.x - state.focusX) * scale,
      y: view.centerY + (scene.y - state.focusY) * scale
    };
  }

  function screenToScene(point, viewport, cameraStateValue, fallbackY) {
    const view = normalizeViewport(viewport);
    const state = normalizeCamera(cameraStateValue, null, null);
    const screen = readPoint(point, fallbackY);
    const scale = view.baseScale * state.zoom;
    return {
      x: state.focusX + (screen.x - view.centerX) / scale,
      y: state.focusY + (screen.y - view.centerY) / scale
    };
  }

  function sceneOptionsFrom(options) {
    const source = isRecord(options) ? options : {};
    return {
      origin: coords.normalizeOrigin(source.origin),
      tile: coords.normalizeTile(source.tile)
    };
  }

  function gridToScreen(col, row, viewport, cameraStateValue, sceneOptions) {
    const settings = sceneOptionsFrom(sceneOptions);
    const point = coords.gridToScreen(col, row, settings.origin, settings.tile);
    return sceneToScreen(point, viewport, cameraStateValue);
  }

  function screenToGrid(x, y, viewport, cameraStateValue, sceneOptions, fallbackY) {
    const settings = sceneOptionsFrom(sceneOptions);
    const point = screenToScene({ x, y }, viewport, cameraStateValue, fallbackY);
    return coords.screenToGrid(point.x, point.y, settings.origin, settings.tile);
  }

  function screenToTile(x, y, viewport, cameraStateValue, sceneOptions, fallbackY) {
    const settings = sceneOptionsFrom(sceneOptions);
    const point = screenToScene({ x, y }, viewport, cameraStateValue, fallbackY);
    return coords.tileAt(point.x, point.y, settings.origin, settings.tile);
  }

  function clampAxis(focus, boundMin, boundMax, contentSize, scale, minOverlap) {
    const center = (boundMin + boundMax) / 2;
    const size = Math.max(0, boundMax - boundMin);
    const transformedSize = size * scale;

    if (!Number.isFinite(transformedSize) || transformedSize <= contentSize) {
      return center;
    }

    const halfRange = (contentSize / 2 - minOverlap) / scale + size / 2;
    if (!Number.isFinite(halfRange) || halfRange <= 0) return center;
    return clamp(focus, center - halfRange, center + halfRange);
  }

  function clampCamera(cameraStateValue, bounds, viewport) {
    const source = isRecord(cameraStateValue) ? cameraStateValue : {};
    const limits = readZoomLimits(source);
    const center = boundsCenter(bounds);
    const zoom = clampZoom(source.zoom, limits);
    const focusX = finiteOr(source.focusX, center.x);
    const focusY = finiteOr(source.focusY, center.y);

    // With no bounds or viewport this is a pure state/zoom clamp. Callers that
    // test unconstrained zoom can omit world boundaries explicitly.
    if (!isRecord(bounds) || !isRecord(viewport)) {
      return cameraState(focusX, focusY, zoom, limits);
    }

    const view = normalizeViewport(viewport);
    const scale = Math.max(EPSILON, view.baseScale * zoom);
    const overlapX = Math.min(MIN_OVERLAP_PX, view.contentWidth * 0.25);
    const overlapY = Math.min(MIN_OVERLAP_PX, view.contentHeight * 0.25);
    const normalizedBounds = normalizeBounds(bounds);

    return cameraState(
      clampAxis(focusX, normalizedBounds.minX, normalizedBounds.maxX, view.contentWidth, scale, overlapX),
      clampAxis(focusY, normalizedBounds.minY, normalizedBounds.maxY, view.contentHeight, scale, overlapY),
      zoom,
      limits
    );
  }

  function panCamera(cameraStateValue, deltaCss, viewport, bounds) {
    const start = normalizeCamera(cameraStateValue, bounds, viewport);
    const view = normalizeViewport(viewport);
    const delta = readPoint(deltaCss);
    const scale = Math.max(EPSILON, view.baseScale * start.zoom);

    return clampCamera(
      cameraState(
        start.focusX - delta.x / scale,
        start.focusY - delta.y / scale,
        start.zoom,
        start.limits
      ),
      bounds,
      viewport
    );
  }

  function zoomCamera(cameraStateValue, factor, anchorCss, viewport, bounds) {
    const start = normalizeCamera(cameraStateValue, bounds, viewport);
    const view = normalizeViewport(viewport);
    const boundedFactor = clamp(finiteOr(factor, 1), MIN_FACTOR, MAX_FACTOR);
    const nextZoom = clampZoom(start.zoom * boundedFactor, start.limits);

    if (Math.abs(nextZoom - start.zoom) <= EPSILON) return start;

    const anchor = readPoint(anchorCss);
    const offsetX = anchor.x - view.centerX;
    const offsetY = anchor.y - view.centerY;
    const reciprocalDelta = 1 / start.zoom - 1 / nextZoom;

    return clampCamera(
      cameraState(
        start.focusX + (offsetX / view.baseScale) * reciprocalDelta,
        start.focusY + (offsetY / view.baseScale) * reciprocalDelta,
        nextZoom,
        start.limits
      ),
      bounds,
      viewport
    );
  }

  return {
    DEFAULT_MIN_ZOOM,
    DEFAULT_MAX_ZOOM,
    DEFAULT_ZOOM_STEP,
    DEFAULT_PADDING,
    DEFAULT_BOTTOM_RESERVE,
    MAX_FACTOR,
    MIN_FACTOR,
    createCamera,
    cloneCamera,
    resetCamera,
    normalizeCamera,
    createViewport,
    viewTransform,
    sceneToScreen,
    screenToScene,
    gridToScreen,
    screenToGrid,
    screenToTile,
    panCamera,
    zoomCamera,
    clampCamera
  };
});
