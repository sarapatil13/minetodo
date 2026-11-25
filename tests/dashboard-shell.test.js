const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const templateMatch = html.match(/<template id="cozyquest-world-template">([\s\S]*?)<\/template>/);
const htmlOutsideTemplate = templateMatch ? html.replace(templateMatch[0], '') : html;

test('the dashboard is the default live view and points reuse accumulated XP', () => {
  assert.match(html, /id="view-dashboard" class="view view-dashboard"/);
  assert.doesNotMatch(html, /id="view-dashboard"[^>]*\bhidden\b/);
  assert.match(html, /class="points-chip"[^>]*>[\s\S]*?<b id="xp">0<\/b>[\s\S]*?<small>points<\/small>/);
  assert.match(app, /const totals = rules\.computeTotals\(state\);/);
  assert.match(app, /\$\('xp'\)\.textContent = totals\.xp;/);
});

test('CozyQuest markup is inert at startup and mounts only inside the enter lifecycle', () => {
  assert.ok(templateMatch, 'cozyquest-world-template is missing');
  assert.match(templateMatch[1], /id="world-canvas"/);
  assert.match(templateMatch[1], /id="world-controls-panel"/);
  assert.match(templateMatch[1], /id="reset-world"/);
  assert.doesNotMatch(htmlOutsideTemplate, /id="world-canvas"/);
  assert.match(htmlOutsideTemplate, /id="view-cozyquest"[^>]*\bhidden\b/);

  const enterSource = app.match(/function enterCozyQuest\(\) \{[\s\S]*?\n\}/);
  assert.ok(enterSource, 'enterCozyQuest is missing from app.js');
  assert.match(enterSource[0], /cozyView\.hidden = false/);
  assert.match(enterSource[0], /template\.content\.cloneNode\(true\)/);
  assert.match(enterSource[0], /worldHandle\s*=\s*world\.mount\(/);

  const applySource = app.match(/function applyWorldComposition\([\s\S]*?\n\}/);
  assert.ok(applySource, 'applyWorldComposition is missing from app.js');
  assert.doesNotMatch(applySource[0], /world\.mount\(/);
  assert.match(applySource[0], /activeView !== 'cozyquest' \|\| !worldHandle/);
});

test('dashboard shell has welcome, daily-progress and widget layout hooks', () => {
  for (const id of ['daily-progress-text', 'daily-progress-fill', 'daily-progress-note']) {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' is missing from index.html');
  }
  for (const className of ['sidebar', 'welcome-grid', 'welcome-card', 'dashboard-grid', 'widget-slot', 'widget-stack']) {
    assert.match(html, new RegExp('class="[^"]*\\b' + className + '\\b'), className + ' is missing from index.html');
  }
  for (const rule of ['[hidden]', '.sidebar', '.welcome-grid', '.daily-progress', '.dashboard-grid', '.widget-slot']) {
    assert.ok(css.includes(rule + ' {') || css.startsWith(rule + ' {'), rule + ' has no style rule');
  }
  assert.match(html, /<b>Today's progress<\/b>/);
  assert.match(html, /Add a task scheduled for today\./);
  assert.match(app, /function localDateKey\(date\)/);
  assert.match(app, /const today = localDateKey\(new Date\(\)\);/);
  assert.match(app, /task\.date === today/);
  assert.doesNotMatch(app, /const dailyTotal = state\.tasks\.length;/);
  assert.doesNotMatch(app, /const dailyDone = rules\.countCompleted\(state\);/);
});

test("today's progress counts only today's scheduled tasks and reports undated tasks separately", () => {
  const keySource = app.match(/function localDateKey\(date\) \{[\s\S]*?\n\}/);
  const progressSource = app.match(/function todayProgress\(\) \{[\s\S]*?\n\}/);
  assert.ok(keySource, 'localDateKey is missing from app.js');
  assert.ok(progressSource, 'todayProgress is missing from app.js');

  function FixedDate() {
    return { getFullYear: () => 2026, getMonth: () => 10, getDate: () => 5 };
  }
  const sandbox = {
    Date: FixedDate,
    state: {
      tasks: [
        { date: '2026-11-05', done: true },
        { date: '2026-11-05', done: false },
        { date: '', done: true },
        { date: '2026-11-06', done: false },
        { date: '2026-11-04', done: true }
      ]
    }
  };
  const result = vm.runInNewContext(
    `${keySource[0]}\n${progressSource[0]}\n({ key: localDateKey(new Date()), progress: todayProgress() })`,
    sandbox
  );
  assert.equal(result.key, '2026-11-05');
  assert.equal(result.progress.total, 2);
  assert.equal(result.progress.done, 1);
  assert.equal(result.progress.unscheduled, 1);
});

test('all IDs remain unique after the shell restructure', () => {
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g)).map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id found in index.html');
});

test('existing task, dialog, backup and progress IDs are preserved', () => {
  for (const id of [
    'open-add', 'task-dialog', 'task-form', 'task-title', 'task-type', 'task-date',
    'priority-urgent', 'priority-important', 'reward-preview', 'save-task',
    'task-list', 'task-count', 'export-json', 'import-json', 'import-file',
    'toast', 'level-label', 'level-name', 'level-progress-text', 'xp-bar',
    'next-level', 'world-growth', 'coins', 'wood', 'stone', 'iron'
  ]) {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' is missing from index.html');
  }
});
