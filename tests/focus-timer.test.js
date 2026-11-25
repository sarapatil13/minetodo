const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const focusTimer = require('../src/focusTimer.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function clockAt(start = 0) {
  let now = start;
  return {
    set: (value) => { now = value; },
    now: () => now
  };
}

test('Pomodoro preset and normalizeDurationSeconds clamp invalid custom durations', () => {
  assert.equal(focusTimer.POMODORO_SECONDS, 1500);
  assert.equal(focusTimer.normalizeDurationSeconds(90), 90);
  assert.equal(focusTimer.normalizeDurationSeconds(90.4), 90);
  assert.equal(focusTimer.normalizeDurationSeconds(0), focusTimer.MIN_SECONDS);
  assert.equal(focusTimer.normalizeDurationSeconds(-10), focusTimer.MIN_SECONDS);
  assert.equal(focusTimer.normalizeDurationSeconds(999999), focusTimer.MAX_SECONDS);
  assert.equal(focusTimer.normalizeDurationSeconds('nope'), focusTimer.POMODORO_SECONDS);
  assert.equal(focusTimer.formatClock(90000), '1:30');
  assert.equal(focusTimer.formatClock(1500000), '25:00');
});

test('start, pause, resume and reset keep an accurate remaining time', () => {
  const clock = clockAt(0);
  const timer = focusTimer.createTimer({ now: clock.now, durationSeconds: 60 });

  assert.equal(timer.snapshot().status, 'idle');
  assert.equal(timer.snapshot().clock, '1:00');

  timer.start();
  clock.set(10000);
  let state = timer.tick();
  assert.equal(state.status, 'running');
  assert.equal(state.remainingMs, 50000);
  assert.equal(state.clock, '0:50');

  clock.set(20000);
  state = timer.pause();
  assert.equal(state.status, 'paused');
  assert.equal(state.remainingMs, 40000);

  clock.set(100000);
  assert.equal(timer.snapshot().remainingMs, 40000, 'paused time must not drift');

  state = timer.resume();
  assert.equal(state.status, 'running');
  assert.equal(state.targetAt, 140000);

  clock.set(110000);
  state = timer.tick();
  assert.equal(state.remainingMs, 30000);
  assert.equal(state.clock, '0:30');

  state = timer.reset();
  assert.equal(state.status, 'idle');
  assert.equal(state.remainingMs, 60000);
  assert.equal(state.targetAt, null);
  assert.equal(state.completedAt, null);
});

test('start from paused resumes instead of restarting the full duration', () => {
  const clock = clockAt(0);
  const timer = focusTimer.createTimer({ now: clock.now, durationSeconds: 60 });
  timer.start();
  clock.set(10000);
  timer.pause();
  clock.set(5000);

  const state = timer.start();
  assert.equal(state.status, 'running');
  assert.equal(state.remainingMs, 50000);
  assert.equal(state.targetAt, 55000);
});

test('custom durations replace the preset and reset to idle', () => {
  const clock = clockAt(0);
  const timer = focusTimer.createTimer({ now: clock.now });
  timer.start();

  let state = timer.setDuration(90);
  assert.equal(state.status, 'idle');
  assert.equal(state.durationSeconds, 90);
  assert.equal(state.clock, '1:30');

  timer.start();
  clock.set(45000);
  state = timer.tick();
  assert.equal(state.remainingSeconds, 45);
  assert.equal(state.progress, 0.5);
});

test('completion is time based and reported once', () => {
  const clock = clockAt(0);
  const timer = focusTimer.createTimer({ now: clock.now, durationSeconds: 60 });
  timer.start();

  clock.set(150000);
  let state = timer.tick();
  assert.equal(state.status, 'complete');
  assert.equal(state.completed, true);
  assert.equal(state.remainingMs, 0);
  assert.equal(state.clock, '0:00');
  assert.equal(state.completedAt, 60000);
  assert.equal(state.progress, 1);

  clock.set(160000);
  state = timer.tick();
  assert.equal(state.status, 'complete');
  assert.equal(state.completed, false);
  assert.equal(state.completedAt, 60000);
});

test('delayed pause after the deadline becomes completion, never a paused timer', () => {
  const clock = clockAt(0);
  const timer = focusTimer.createTimer({ now: clock.now, durationSeconds: 30 });
  timer.start();

  clock.set(45000);
  const state = timer.pause();
  assert.equal(state.status, 'complete');
  assert.equal(state.remainingMs, 0);
  assert.equal(state.completedAt, 30000);

  const restarted = timer.start();
  assert.equal(restarted.status, 'running');
  assert.equal(restarted.remainingSeconds, 30);
});

test('pagehide and pageshow restart the ticking UI without pausing the timer model', () => {
  assert.match(app, /window\.addEventListener\('pagehide', stopFocusInterval\);/);
  assert.match(app, /window\.addEventListener\('pageshow', \(\) => applyFocusState\(focusTimer\.tick\(\)\)\);/);
  assert.equal(app.includes("window.addEventListener('visibilitychange'"), false);
});

test('snapshot does not mutate timer state and durations are bounded', () => {
  const clock = clockAt(0);
  const timer = focusTimer.createTimer({ now: clock.now, durationSeconds: 10 });
  timer.start();
  const first = timer.snapshot();
  first.status = 'tampered';

  assert.equal(timer.snapshot().status, 'running');
  assert.equal(focusTimer.createTimer({ now: clock.now, durationSeconds: -5 }).snapshot().durationSeconds, 1);
  assert.equal(
    focusTimer.createTimer({ now: clock.now, durationSeconds: 100000 }).snapshot().durationSeconds,
    focusTimer.MAX_SECONDS
  );
});
