(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).focusTimer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const POMODORO_SECONDS = 25 * 60;
  const MIN_SECONDS = 1;
  const MAX_SECONDS = 24 * 60 * 60;

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function normalizeDurationSeconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return POMODORO_SECONDS;
    return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(seconds)));
  }

  function formatClock(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${Math.floor(totalSeconds / 60)}:${pad2(totalSeconds % 60)}`;
  }

  function createTimer(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    let durationMs = normalizeDurationSeconds(
      options.durationSeconds === undefined ? POMODORO_SECONDS : options.durationSeconds
    ) * 1000;
    let status = 'idle';
    let remainingMs = durationMs;
    let targetAt = null;
    let completedAt = null;

    function settle(timestamp) {
      if (status !== 'running' || targetAt === null || timestamp < targetAt) return false;
      completedAt = targetAt;
      remainingMs = 0;
      targetAt = null;
      status = 'complete';
      return true;
    }

    function snapshot(timestamp = now()) {
      let remaining = remainingMs;
      if (status === 'running' && targetAt !== null) {
        remaining = Math.max(0, targetAt - timestamp);
      }
      return {
        status,
        durationMs,
        durationSeconds: durationMs / 1000,
        remainingMs: remaining,
        remainingSeconds: Math.ceil(remaining / 1000),
        clock: formatClock(remaining),
        progress: durationMs ? Math.min(1, Math.max(0, 1 - remaining / durationMs)) : 0,
        completedAt,
        targetAt
      };
    }

    function start() {
      const timestamp = now();
      if (status === 'running') {
        settle(timestamp);
        return snapshot(timestamp);
      }
      if (status !== 'paused') {
        remainingMs = durationMs;
        completedAt = null;
      }
      status = 'running';
      targetAt = timestamp + remainingMs;
      return snapshot(timestamp);
    }

    function pause() {
      const timestamp = now();
      if (status !== 'running') return snapshot(timestamp);
      if (settle(timestamp)) return snapshot(timestamp);
      remainingMs = Math.max(0, targetAt - timestamp);
      targetAt = null;
      status = 'paused';
      return snapshot(timestamp);
    }

    function resume() {
      const timestamp = now();
      if (status !== 'paused') return snapshot(timestamp);
      status = 'running';
      targetAt = timestamp + remainingMs;
      return snapshot(timestamp);
    }

    function reset() {
      status = 'idle';
      remainingMs = durationMs;
      targetAt = null;
      completedAt = null;
      return snapshot(now());
    }

    function setDuration(seconds) {
      durationMs = normalizeDurationSeconds(seconds) * 1000;
      return reset();
    }

    function tick() {
      const timestamp = now();
      const completed = settle(timestamp);
      const state = snapshot(timestamp);
      state.completed = completed;
      return state;
    }

    return {
      start,
      pause,
      resume,
      reset,
      setDuration,
      tick,
      snapshot
    };
  }

  return {
    POMODORO_SECONDS,
    MIN_SECONDS,
    MAX_SECONDS,
    normalizeDurationSeconds,
    formatClock,
    createTimer
  };
});
