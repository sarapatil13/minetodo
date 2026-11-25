const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const calendarModule = fs.readFileSync(path.join(root, 'src/calendar.js'), 'utf8');
const timerModule = fs.readFileSync(path.join(root, 'src/focusTimer.js'), 'utf8');
const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)).map((match) => match[1]);

test('widget module scripts load once, before the app, as classic scripts', () => {
  assert.equal(scripts.filter((source) => source === 'src/calendar.js').length, 1);
  assert.equal(scripts.filter((source) => source === 'src/focusTimer.js').length, 1);
  assert.ok(scripts.indexOf('src/calendar.js') < scripts.indexOf('app.js'));
  assert.ok(scripts.indexOf('src/focusTimer.js') < scripts.indexOf('app.js'));
  assert.doesNotMatch(html, /type="module"/);
});

test('the shell exposes functional calendar and focus controls instead of placeholders', () => {
  for (const id of [
    'calendar-widget', 'calendar-prev', 'calendar-next', 'calendar-month-label',
    'calendar-grid', 'calendar-selection', 'calendar-clear', 'calendar-add',
    'focus-widget', 'focus-display', 'focus-status', 'focus-progress',
    'focus-pomodoro', 'focus-minutes', 'focus-custom', 'focus-start',
    'focus-pause', 'focus-resume', 'focus-reset', 'focus-feedback'
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' is missing from index.html');
  }
  assert.doesNotMatch(html, /will appear here in the next milestone/);
  assert.doesNotMatch(html, /Pomodoro and custom timers are coming next/);
  assert.match(html, /id="calendar-grid"[^>]*role="grid"/);
  assert.match(html, /id="focus-display"[^>]*role="timer"/);
  assert.match(html, /id="focus-feedback"[^>]*hidden/);
});

test('calendar selection filters the existing task list and can be cleared', () => {
  for (const fn of ['renderCalendar', 'shiftCalendarMonth', 'selectCalendarDate', 'clearCalendarSelection']) {
    assert.match(app, new RegExp('function ' + fn + '\\('), fn + ' is missing');
  }
  assert.match(app, /const month = calendar\.buildMonth/);
  const visible = app.match(/function visibleTasks\(\) \{[\s\S]*?\n\}/);
  assert.ok(visible, 'visibleTasks is missing');
  assert.match(visible[0], /state\.tasks\.filter\(\(t\) => t\.date === selectedDateKey\)/);
  assert.match(visible[0], /activeFilter === 'all'/);

  const select = app.match(/function selectCalendarDate\([\s\S]*?\n\}/);
  assert.ok(select, 'selectCalendarDate is missing');
  assert.match(select[0], /renderCalendar\(\);/);
  assert.match(select[0], /renderTasks\(\);/);
  assert.doesNotMatch(select[0], /\brender\(\)/);

  assert.match(app, /\$\('calendar-grid'\)\.addEventListener\('click'/);
  assert.match(app, /\$\('calendar-clear'\)\.addEventListener\('click', clearCalendarSelection\)/);
  assert.match(app, /\$\('calendar-prev'\)\.addEventListener\('click', \(\) => shiftCalendarMonth\(-1\)\)/);
  assert.match(app, /\$\('calendar-next'\)\.addEventListener\('click', \(\) => shiftCalendarMonth\(1\)\)/);

  const render = app.match(/function render\(\) \{[\s\S]*?\n\}/);
  assert.ok(render, 'render is missing');
  assert.match(render[0], /renderCalendar\(\);/);
});

test('calendar quick add reuses the shared dialog and task creation path', () => {
  assert.match(app, /function openDialog\(task = null, defaults = \{\}\)/);
  assert.match(app, /\$\('calendar-add'\)\.addEventListener\('click', \(\) => openDialog\(null, \{/);
  assert.match(app, /date: selectedDateKey \|\| calendar\.localDateKey\(new Date\(\)\)/);
  assert.equal((app.match(/rules\.createTask\(/g) || []).length, 1);
  assert.equal((app.match(/rules\.editTask\(/g) || []).length, 1);
  assert.equal((app.match(/rules\.completeTask\(/g) || []).length, 1);
  assert.doesNotMatch(app, /calendar-add[\s\S]{0,300}createTask/);
});

test('a single time-based focus interval updates timer DOM without a full render', () => {
  for (const fn of ['updateFocusUI', 'stopFocusInterval', 'syncFocusInterval', 'applyFocusState']) {
    assert.match(app, new RegExp('function ' + fn + '\\('), fn + ' is missing');
  }
  const sync = app.match(/function syncFocusInterval\([\s\S]*?\n\}/);
  assert.ok(sync, 'syncFocusInterval is missing');
  assert.match(sync[0], /focusTimer\.tick\(\)/);
  assert.match(sync[0], /updateFocusUI\(next\)/);
  assert.match(sync[0], /if \(next\.completed\) stopFocusInterval\(\)/);
  assert.doesNotMatch(sync[0], /\brender\(/);
  assert.doesNotMatch(sync[0], /renderTasks\(/);
  assert.match(sync[0], /\}, 250\)/);

  const update = app.match(/function updateFocusUI\([\s\S]*?\n\}/);
  assert.ok(update, 'updateFocusUI is missing');
  assert.doesNotMatch(update[0], /task-list|task-count|xp'|ledger/);

  assert.equal((app.match(/setInterval\(/g) || []).length, 1);
  assert.match(app, /clearInterval\(focusInterval\)/);
  assert.equal((app.match(/addEventListener\('pagehide', stopFocusInterval\)/g) || []).length, 1);
  for (const id of ['focus-pomodoro', 'focus-custom', 'focus-start', 'focus-pause', 'focus-resume', 'focus-reset']) {
    assert.match(app, new RegExp("\\$\\('" + id + "'\\)\\.addEventListener\\('click'"));
  }
  assert.match(app, /focusTimerModule\.normalizeDurationSeconds\(Number\(\$\('focus-minutes'\)\.value\) \* 60\)/);
  assert.match(app, /focusTimer\.setDuration\(focusTimerModule\.POMODORO_SECONDS\)/);
});

test('pure modules avoid storage, timers, listeners and UTC date drift', () => {
  for (const source of [calendarModule, timerModule]) {
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
    assert.doesNotMatch(source, /setInterval|setTimeout|addEventListener/);
    assert.doesNotMatch(source, /Date\.UTC|toISOString\(\)/);
  }
  assert.match(calendarModule, /date\.getFullYear\(\)/);
  assert.match(calendarModule, /date\.getMonth\(\)/);
  assert.match(calendarModule, /date\.getDate\(\)/);
  assert.match(timerModule, /targetAt - timestamp/);
  assert.match(timerModule, /typeof options\.now === 'function'/);
});

test('calendar and focus widgets have styled, responsive states', () => {
  for (const rule of [
    '.calendar-nav {', '.calendar-weekdays,.calendar-week {', '.calendar-day {',
    '.calendar-day.is-today {', '.calendar-day.is-selected {', '.calendar-task-dot {',
    '.calendar-footer {', '.calendar-quick-add {', '.focus-clock {',
    '.focus-progress-track {', '.focus-progress-fill {', '.focus-presets {',
    '.focus-controls {', '.focus-feedback {', '.focus-widget[data-state="paused"] .focus-clock {'
  ]) {
    assert.ok(css.includes(rule), rule + ' has no style rule');
  }
  assert.match(css, /@media\(max-width:1180px\)[\s\S]*?\.focus-controls \{[\s\S]*?grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
});
