const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const flowersModule = fs.readFileSync(path.join(root, 'src/flowers.js'), 'utf8');
const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)).map((match) => match[1]);

test('the flowers module loads once as a classic script before the app', () => {
  assert.equal(scripts.filter((source) => source === 'src/flowers.js').length, 1);
  assert.ok(scripts.indexOf('src/flowers.js') < scripts.indexOf('app.js'));
  assert.doesNotMatch(html, /type="module"/);
});

test('flower assignment stays pure, schema-free and reward-free', () => {
  for (const pattern of [
    /localStorage|sessionStorage/, /setInterval|setTimeout|addEventListener/,
    /Date\.now|toISOString/, /ledger|rewardClaimed|\bxp\b|\bcoins\b|resources/,
    /task\.done|task\.type|Recurring|Daily habit/, /inventory|collection|streak|\bscore\b/i
  ]) {
    assert.doesNotMatch(flowersModule, pattern, String(pattern));
  }
  assert.match(flowersModule, /module\.exports/);
  assert.match(flowersModule, /\.flowers = api/);
  assert.match(flowersModule, /task\.id/);
  assert.match(flowersModule, /Math\.imul/);
});

test('completed tasks render a decorative flower beside their title', () => {
  assert.match(app, /const flowers = window\.CQ\.flowers;/);
  for (const fn of ['prefersReducedMotion', 'takeRecentCompletions', 'flowerMarkup']) {
    assert.match(app, new RegExp('function ' + fn + '\\('), fn + ' is missing');
  }

  const render = app.match(/function renderTasks\(\) \{[\s\S]*?\n\}/);
  assert.ok(render, 'renderTasks is missing');
  assert.match(render[0], /const bloomingIds = takeRecentCompletions\(\);/);
  assert.match(render[0], /escapeHtml\(t\.title\)\}\$\{flowerMarkup\(t, bloomingIds\)\}/);

  const markup = app.match(/function flowerMarkup\([\s\S]*?\n\}/);
  assert.ok(markup, 'flowerMarkup is missing');
  assert.match(markup[0], /task\.done !== true/);
  assert.match(markup[0], /flowers\.flowerForTask\(task\)/);
  assert.match(markup[0], /aria-hidden="true"/);
  assert.match(markup[0], /data-flower="\$\{flower\.id\}"/);
  assert.match(markup[0], /bloomingIds\.has\(task\.id\)/);
  assert.match(markup[0], /!prefersReducedMotion\(\)/);
  assert.doesNotMatch(markup[0], /localStorage|ledger|reward/);
});

test('bloom is queued only on completion and consumed by the next render', () => {
  const toggle = app.match(/\$\('task-list'\)\.addEventListener\('click'[\s\S]*?\n\}\);/);
  assert.ok(toggle, 'task-list click handler is missing');
  assert.match(toggle[0], /if \(!task\.done\) \{/);
  assert.match(toggle[0], /recentlyCompletedFlowers\.add\(task\.id\)/);
  assert.match(toggle[0], /if \(!committed\) recentlyCompletedFlowers\.delete\(task\.id\)/);
  assert.match(toggle[0], /recentlyCompletedFlowers\.delete\(task\.id\);[\s\S]{0,240}rules\.reopenTask/);

  const take = app.match(/function takeRecentCompletions\([\s\S]*?\n\}/);
  assert.ok(take, 'takeRecentCompletions is missing');
  assert.match(take[0], /const ids = recentlyCompletedFlowers;/);
  assert.match(take[0], /recentlyCompletedFlowers = new Set\(\);/);
  assert.match(take[0], /return ids;/);

  const sync = app.match(/function syncFocusInterval\([\s\S]*?\n\}/);
  assert.ok(sync, 'syncFocusInterval is missing');
  assert.doesNotMatch(sync[0], /flower|bloom|renderTasks/);
  const calendarSelect = app.match(/function selectCalendarDate\([\s\S]*?\n\}/);
  assert.ok(calendarSelect, 'selectCalendarDate is missing');
  assert.doesNotMatch(calendarSelect[0], /recentlyCompletedFlowers/);
});

test('completion and reopening still use the single reward path untouched', () => {
  assert.equal((app.match(/rules\.completeTask\(/g) || []).length, 1);
  assert.equal((app.match(/rules\.reopenTask\(/g) || []).length, 1);
  assert.doesNotMatch(app, /ledger\.push/);
  assert.doesNotMatch(app, /flower[\s\S]{0,120}ledger|ledger[\s\S]{0,120}flower/i);
  assert.match(app, /Completed again — reward already earned/);
});

test('bloom animation is subtle, CSS-driven and disabled for reduced motion', () => {
  assert.match(css, /\.task-flower \{[\s\S]*?display: inline-flex/);
  assert.match(css, /\.task-flower\.is-blooming \{[\s\S]*?animation: flower-bloom/);
  assert.match(css, /@keyframes flower-bloom/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.task-flower\.is-blooming \{[\s\S]*?animation: none;/);

  const reduced = app.match(/function prefersReducedMotion\([\s\S]*?\n\}/);
  assert.ok(reduced, 'prefersReducedMotion is missing');
  assert.match(reduced[0], /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
});
