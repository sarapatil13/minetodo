const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rules = require('../src/rules.js');

const root = path.join(__dirname, '..');
const prd = fs.readFileSync(path.join(root, 'PRODUCT_REQUIREMENTS.md'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

test('the PRD reward table covers every implemented priority combination', () => {
  const tierLabels = { low: 'Low', medium: 'Medium', high: 'High' };
  const flags = [
    ['none', false, false],
    ['urgent', true, false],
    ['important', false, true],
    ['urgent + important', true, true]
  ];

  for (const tier of ['low', 'medium', 'high']) {
    for (const [label, urgent, important] of flags) {
      const reward = rules.rewardFor({ tier, urgent, important });
      const row = `| ${tierLabels[tier]} | ${label} | ${reward.xp} | ${reward.coins} | ${reward.amount} ${reward.resource} |`;
      assert.ok(prd.includes(row), row + ' is missing from PRODUCT_REQUIREMENTS.md');
    }
  }
});

test('README attributes occupied-cell detection to composition and placement', () => {
  assert.doesNotMatch(readme, /bad kinds, coordinates, salts, terrain, or occupied cells are reported/);
  assert.match(readme,
    /Occupied-cell collisions are detected later by `CQ\.world\.content\.compose\(\)` and `CQ\.world\.decorations\.place\(\)`/);
});
