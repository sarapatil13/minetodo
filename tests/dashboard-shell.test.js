const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('CozyQuest markup is inert at startup so no live canvas or controller is created', () => {
  assert.ok(templateMatch, 'cozyquest-world-template is missing');
  assert.match(templateMatch[1], /id="world-canvas"/);
  assert.match(templateMatch[1], /id="world-controls-panel"/);
  assert.match(templateMatch[1], /id="reset-world"/);
  assert.doesNotMatch(htmlOutsideTemplate, /id="world-canvas"/);
  assert.doesNotMatch(app, /worldHandle\s*=\s*world\.mount\(/);
  assert.doesNotMatch(app, /function applyWorldComposition[\s\S]*?world\.mount\(/);
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
  assert.match(app, /const dailyTotal = state\.tasks\.length;/);
  assert.match(app, /const dailyDone = rules\.countCompleted\(state\);/);
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
