const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const templateMatch = html.match(/<template id="cozyquest-world-template">[\s\S]*?<\/template>/);

function functionSource(name) {
  const match = app.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(match, name + ' is missing from app.js');
  return match[0];
}

test('the CozyQuest template adds a hero, introduction and clear return control', () => {
  assert.ok(templateMatch, 'CozyQuest template is missing');
  const template = templateMatch[0];

  assert.match(template, /id="cozy-hero-title"/);
  assert.match(template, /Welcome home to your meadow/);
  assert.match(template, /id="cozy-hero-description"/);
  assert.match(template, /Every task you finish in Minetodo/);

  const back = template.match(/<button[^>]*id="back-to-dashboard"[^>]*>[\s\S]*?<\/button>/);
  assert.ok(back, 'return-to-dashboard button is missing');
  assert.match(back[0], /aria-label="Return to Minetodo Dashboard"/);
  assert.match(back[0], /Minetodo Dashboard/);
  assert.match(back[0], /type="button"/);
});

test('CozyQuest progress IDs are present and the world controls are unchanged', () => {
  const template = templateMatch[0];
  for (const id of [
    'cozy-xp', 'cozy-level', 'cozy-stage-name', 'cozy-stage-xp',
    'cozy-progress-track', 'cozy-progress-fill', 'cozy-next-unlock'
  ]) {
    assert.match(template, new RegExp('id="' + id + '"'), id + ' is missing from the template');
  }
  for (const id of [
    'world-canvas', 'world-info-panel', 'world-controls-panel', 'biome-select',
    'biome-hint', 'decor-catalog', 'decor-owned', 'decor-placed', 'place-col',
    'place-row', 'placement-hint', 'reset-world'
  ]) {
    assert.match(template, new RegExp('id="' + id + '"'), id + ' must stay in the template');
  }
  assert.doesNotMatch(template, /task-flower|flowerFor|CQ\.flowers/);
});

test('view transitions toggle one shared body-level CozyQuest identity', () => {
  const enter = functionSource('enterCozyQuest');
  const leave = functionSource('leaveCozyQuest');

  assert.equal((app.match(/document\.body\.classList\.add\('is-cozyquest'\)/g) || []).length, 1);
  assert.equal((app.match(/document\.body\.classList\.remove\('is-cozyquest'\)/g) || []).length, 2);
  assert.match(enter, /document\.body\.classList\.add\('is-cozyquest'\)/);
  assert.match(enter, /document\.body\.classList\.remove\('is-cozyquest'\)/);
  assert.match(leave, /document\.body\.classList\.remove\('is-cozyquest'\)/);
  assert.match(enter, /cozyView\.replaceChildren\(template\.content\.cloneNode\(true\)\)/);
  assert.match(app, /cozyView\.replaceChildren\(\);/);
  assert.match(app, /worldHandle = null;/);
  assert.match(app, /handle\.destroy\(\)/);
});

test('the return control uses the existing delegated listener and router', () => {
  assert.equal((app.match(/document\.addEventListener\('click'/g) || []).length, 1);
  assert.match(app, /target\.closest\('#back-to-dashboard'\)/);
  assert.match(app, /cozyView\.contains\(backBtn\)/);
  assert.match(app, /requestView\('dashboard'\)/);
  assert.doesNotMatch(app, /\$\('back-to-dashboard'\)\.addEventListener/);
});

test('CozyQuest XP and level come from the same derived stats as the dashboard', () => {
  const stats = functionSource('renderStats');
  const enter = functionSource('enterCozyQuest');

  assert.ok(stats.includes('const totals = rules.computeTotals(state);'));
  assert.ok(stats.includes('const levelNumber = progressionConfig.LEVELS.findIndex'));
  assert.ok(stats.includes("$('cozy-xp').textContent = totals.xp;"));
  assert.ok(stats.includes("$('cozy-level').textContent = `Level ${levelNumber} · ${level.name}`;"));
  assert.match(enter, /renderStats\(\);/);
});

test('CozyQuest stage progress comes from the existing world progression result', () => {
  const growth = functionSource('updateWorldGrowth');
  const cozyGrowth = functionSource('updateCozyQuestGrowth');
  const synthetic = functionSource('syntheticGrowthResult');

  assert.ok(growth.includes('const nextUnlock = nextUnlockText(progress);'));
  assert.ok(growth.includes('updateCozyQuestGrowth(progress);'));
  assert.ok(cozyGrowth.includes('progress.percent'));
  assert.ok(cozyGrowth.includes('fill.style.width = `${percent}%`;'));
  assert.ok(cozyGrowth.includes("setAttribute('aria-valuenow'"));
  assert.ok(cozyGrowth.includes('nextUnlockText(progress)'));
  assert.ok(synthetic.includes('worldProgression.worldProgress(xp)'));

  assert.equal((app.match(/rules\.computeTotals\(/g) || []).length, 2);
  assert.equal((app.match(/worldProgression\.worldProgress\(/g) || []).length, 1);
  assert.match(app, /const xp = currentXp\(\);[\s\S]{0,220}composeWorldScene\(xp, savedWorldState\)/);
});

test('CozyQuest has an immersive visual identity with responsive hero and progress CSS', () => {
  assert.match(css, /body\.is-cozyquest \{[\s\S]*?background:/);
  assert.match(css, /body\.is-cozyquest \.quest-chip \{[\s\S]*?display: none/);
  assert.match(css, /\.cozy-hero \{[\s\S]*?display: flex/);
  assert.match(css, /\.cozy-hero h2 \{[\s\S]*?Fraunces/);
  assert.match(css, /\.cozy-return:focus-visible \{/);
  assert.match(css, /\.cozy-progress-panel \{[\s\S]*?display: grid/);
  assert.match(css, /\.cozy-progress-panel \.cozy-progress-track \{[\s\S]*?height: 10px/);
  assert.match(css, /\.cozyquest-view \.world-scene \{[\s\S]*?height: clamp/);

  const tablet = css.slice(css.indexOf('@media(max-width:1180px)'), css.indexOf('@media(max-width:440px)'));
  assert.match(tablet, /\.cozy-hero \{[\s\S]*?flex-direction: column/);
  assert.match(tablet, /\.cozy-progress-panel \{[\s\S]*?grid-template-columns: 1fr 1fr/);
  assert.match(tablet, /\.cozyquest-view \.world-scene \{[\s\S]*?height: 280px/);

  const mobile = css.slice(css.indexOf('@media(max-width:440px)'));
  assert.match(mobile, /\.cozy-return \{[\s\S]*?width: 100%/);
  assert.match(mobile, /\.cozy-progress-panel \{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(mobile, /\.cozyquest-view \.world-scene \{[\s\S]*?height: 210px/);
});

test('the identity slice stays classic-script, vanilla and reward-neutral', () => {
  const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)).map((match) => match[1]);
  assert.equal(new Set(scripts).size, scripts.length);
  assert.equal(scripts.filter((source) => source.includes('cozy')).length, 0);
  assert.doesNotMatch(html, /type="module"/);
  assert.match(app, /const world = window\.CQ\.world;/);
  assert.match(app, /requestView\('dashboard'\)/);
  assert.doesNotMatch(functionSource('updateCozyQuestGrowth'), /computeTotals|reward|ledger|localStorage/i);
});
