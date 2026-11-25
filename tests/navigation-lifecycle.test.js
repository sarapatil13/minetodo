const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('sidebar exposes Dashboard, My Tasks, Calendar, Focus and CozyQuest as buttons', () => {
  const navMatch = html.match(/<nav class="sidebar-nav"[\s\S]*?<\/nav>/);
  assert.ok(navMatch, 'sidebar navigation is missing');
  const nav = navMatch[0];

  for (const [view, label] of [
    ['dashboard', 'Dashboard'],
    ['tasks', 'My Tasks'],
    ['calendar', 'Calendar'],
    ['focus', 'Focus'],
    ['cozyquest', 'CozyQuest']
  ]) {
    assert.match(nav, new RegExp('data-view="' + view + '"[^>]*>[\\s\\S]{0,200}<b>' + label + '</b>'), view + ' entry is missing');
  }
  assert.match(nav, /data-view="cozyquest"/);
  assert.doesNotMatch(nav, /aria-disabled/);
  assert.equal(nav.match(/<button\b/g).length, 5);
});

test('a hidden live view is ready while the world template stays inert', () => {
  assert.match(html, /id="view-cozyquest" class="view view-cozyquest"[^>]*\bhidden\b/);
  assert.match(html, /id="view-dashboard" class="view view-dashboard"/);
  assert.doesNotMatch(html, /id="view-dashboard"[^>]*\bhidden\b/);
  assert.match(html, /<template id="cozyquest-world-template">/);
  for (const id of ['page-eyebrow', 'page-title', 'tasks-widget', 'calendar-widget', 'focus-widget']) {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' is missing');
  }
});

test('routing uses one hashchange listener and a safe mount/teardown lifecycle', () => {
  for (const fn of [
    'hashForView', 'viewFromHash', 'isReloadNavigation', 'replaceHash', 'destroyWorld',
    'updatePageHeading', 'updateNavState', 'focusDashboardTarget', 'enterCozyQuest',
    'leaveCozyQuest', 'applyView', 'requestView', 'handleRouteChange'
  ]) {
    assert.match(app, new RegExp('function ' + fn + '\\('), fn + ' is missing');
  }
  assert.equal(app.match(/addEventListener\('hashchange'/g).length, 1);
  assert.match(app, /location\.hash = hash/);
  assert.match(app, /applyView\(initialView\)/);
  assert.match(app, /isReloadNavigation\(\)/);
  assert.match(app, /cozyView\.replaceChildren\(template\.content\.cloneNode\(true\)\)/);
  assert.match(app, /dashboardView\.hidden = true;\s*\n\s*cozyView\.hidden = false/);
  assert.match(app, /worldHandle\s*=\s*world\.mount\(/);
  assert.match(app, /worldHandle = null;/);
  assert.match(app, /handle\.destroy\(\)/);
});

test('world controls use delegated listeners so clones never duplicate bindings', () => {
  assert.match(app, /document\.addEventListener\('change'/);
  assert.match(app, /document\.addEventListener\('click'/);
  assert.doesNotMatch(app, /\$\('biome-select'\)\.addEventListener/);
  assert.doesNotMatch(app, /\$\('world-controls-panel'\)\.addEventListener/);
  assert.doesNotMatch(app, /\$\('reset-world'\)\.addEventListener/);
  assert.match(app, /cozyView\.contains\(target\)/);
  assert.match(app, /cozyView\.contains\(decorBtn\)/);
  assert.match(app, /cozyView\.contains\(resetBtn\)/);
});

test('hash routing maps CozyQuest and every other hash to the correct view', () => {
  const hashSource = app.match(/function hashForView\(view\) \{[\s\S]*?\n\}/);
  const viewSource = app.match(/function viewFromHash\(\) \{[\s\S]*?\n\}/);
  assert.ok(hashSource, 'hashForView is missing from app.js');
  assert.ok(viewSource, 'viewFromHash is missing from app.js');

  const source = `${hashSource[0]}\n${viewSource[0]}\n({ cozyHash: hashForView('cozyquest'), dashHash: hashForView('dashboard'), view: viewFromHash() })`;
  for (const [hash, expectedView] of [
    ['#cozyquest', 'cozyquest'],
    ['#dashboard', 'dashboard'],
    ['', 'dashboard'],
    ['#unknown', 'dashboard']
  ]) {
    const sandbox = {
      location: { hash },
      COZYQUEST_HASH: '#cozyquest',
      DASHBOARD_HASH: '#dashboard'
    };
    const result = vm.runInNewContext(source, sandbox);
    assert.equal(result.cozyHash, '#cozyquest');
    assert.equal(result.dashHash, '#dashboard');
    assert.equal(result.view, expectedView, hash + ' routed incorrectly');
  }
});

test('sidebar styling supports focus, hover and tablet/mobile layouts', () => {
  for (const rule of [
    '.nav-item:focus-visible {',
    '.nav-item:hover {',
    '.nav-item.nav-cozyquest {',
    '.view-cozyquest {',
    '@media(max-width:1180px) {',
    '@media(max-width:440px) {'
  ]) {
    assert.ok(css.includes(rule), rule + ' has no style rule');
  }
  const tablet = css.slice(css.indexOf('@media(max-width:1180px)'), css.indexOf('@media(max-width:440px)'));
  assert.match(tablet, /\.sidebar-nav \{[\s\S]*?overflow-x: auto/);
  const mobile = css.slice(css.indexOf('@media(max-width:440px)'));
  assert.match(mobile, /\.sidebar-nav \{[\s\S]*?grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
});
