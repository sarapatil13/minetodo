const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const scripts = Array.from(html.matchAll(/<script\b([^>]*)>/g)).map((match) => match[1]);

function scriptSource(tag) {
  const match = tag.match(/\bsrc="([^"]+)"/);
  return match ? match[1] : null;
}

test('index.html loads every classic script exactly once', () => {
  const sources = scripts.map(scriptSource);
  assert.equal(sources.includes(null), false);
  assert.equal(new Set(sources).size, sources.length);
  assert.ok(sources.every((source) => !/\btype="module"/.test(scripts[sources.indexOf(source)])));
  assert.ok(sources.includes('app.js'));
});

test('world content loads before the public adapter and persistence modules load before the app', () => {
  const sources = scripts.map(scriptSource);
  const contentIndex = sources.indexOf('src/world/content.js');
  const adapterIndex = sources.indexOf('src/world/index.js');
  const worldStateIndex = sources.indexOf('src/worldState.js');
  const commitIndex = sources.indexOf('src/stateCommit.js');
  const appIndex = sources.indexOf('app.js');

  assert.ok(contentIndex !== -1 && contentIndex < adapterIndex);
  assert.ok(worldStateIndex !== -1 && worldStateIndex < appIndex);
  assert.ok(commitIndex !== -1 && commitIndex < appIndex);
  assert.ok(worldStateIndex < commitIndex);
});

test('Phase 2.7 catalog scripts load before the public world adapter', () => {
  const sources = scripts.map(scriptSource);
  const catalogIndex = sources.indexOf('src/world/contentCatalog.js');
  const unlocksIndex = sources.indexOf('src/world/unlocks.js');
  const biomesIndex = sources.indexOf('src/world/biomeCatalog.js');
  const adapterIndex = sources.indexOf('src/world/index.js');

  assert.ok(catalogIndex !== -1 && catalogIndex < unlocksIndex);
  assert.ok(unlocksIndex !== -1 && unlocksIndex < biomesIndex);
  assert.ok(biomesIndex !== -1 && biomesIndex < adapterIndex);
});

test('the world reset control has a matching style rule', () => {
  assert.match(html, /id="reset-world"/);
  assert.match(css, /\.world-reset\b/);
});
