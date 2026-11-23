const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/rules.js');

const combinations = [
  ['low', false, false, 10, 3, 'wood', 1],
  ['low', true, false, 16, 4, 'wood', 1],
  ['low', false, true, 19, 5, 'wood', 1],
  ['low', true, true, 25, 7, 'wood', 2],
  ['medium', false, false, 20, 6, 'wood', 2],
  ['medium', true, false, 26, 7, 'wood', 2],
  ['medium', false, true, 29, 8, 'wood', 2],
  ['medium', true, true, 35, 10, 'stone', 2],
  ['high', false, false, 35, 10, 'stone', 2],
  ['high', true, false, 41, 12, 'stone', 2],
  ['high', false, true, 44, 13, 'stone', 2],
  ['high', true, true, 50, 15, 'iron', 1]
];

test('all 12 priority combinations map to the approved rewards', () => {
  assert.equal(combinations.length, 12);
  for (const [tier, urgent, important, xp, coins, resource, amount] of combinations) {
    const priority = { tier, urgent, important };
    const reward = rules.rewardFor(priority);
    assert.deepEqual(reward, { xp, coins, resource, amount, label: { wood: 'Wood', stone: 'Stone', iron: 'Iron' }[resource] });
  }
});

test('legacy priorities map to the approved modern equivalents', () => {
  assert.deepEqual(rules.legacyPriorityToPriority('low'), { tier: 'low', urgent: false, important: false });
  assert.deepEqual(rules.legacyPriorityToPriority('medium'), { tier: 'medium', urgent: false, important: false });
  assert.deepEqual(rules.legacyPriorityToPriority('high'), { tier: 'high', urgent: false, important: false });
  assert.deepEqual(rules.legacyPriorityToPriority('critical'), { tier: 'high', urgent: true, important: true });
  assert.equal(rules.legacyPriorityToPriority('bogus'), null);
});

test('legacy and modern rewards are numerically identical', () => {
  const legacy = { low: 10, medium: 20, high: 35, critical: 50 };
  for (const [name, xp] of Object.entries(legacy)) {
    const priority = rules.legacyPriorityToPriority(name);
    assert.equal(rules.rewardFor(priority).xp, xp);
  }
  assert.deepEqual(rules.rewardFor(rules.legacyPriorityToPriority('critical')), {
    xp: 50,
    coins: 15,
    resource: 'iron',
    amount: 1,
    label: 'Iron'
  });
});

test('coins are derived from XP with floor(xp * 0.3)', () => {
  for (const [tier, urgent, important, xp, coins] of combinations) {
    assert.equal(rules.rewardFor({ tier, urgent, important }).coins, Math.floor(xp * 0.3));
  }
});

test('resource bands use exact XP boundaries', () => {
  const bands = [
    [19, 'wood', 1],
    [20, 'wood', 2],
    [34, 'wood', 2],
    [35, 'stone', 2],
    [49, 'stone', 2],
    [50, 'iron', 1]
  ];
  for (const [xp, resource, amount] of bands) {
    const priority = { tier: 'low', urgent: false, important: false };
    const originalXp = rules.XP_MATRIX.low.none;
    rules.XP_MATRIX.low.none = xp;
    try {
      const reward = rules.rewardFor(priority);
      assert.equal(reward.resource, resource);
      assert.equal(reward.amount, amount);
    } finally {
      rules.XP_MATRIX.low.none = originalXp;
    }
  }
});

test('rewardFor rejects malformed priorities', () => {
  for (const bad of [null, undefined, 'low', {}, { tier: 'ultra', urgent: false, important: false }, { tier: 'low', urgent: 'yes', important: false }]) {
    assert.throws(() => rules.rewardFor(bad), /Invalid priority/);
  }
});

test('rewardFor does not mutate the supplied priority', () => {
  const priority = { tier: 'high', urgent: true, important: true };
  rules.rewardFor(priority);
  assert.deepEqual(priority, { tier: 'high', urgent: true, important: true });
});

test('effort tier still dominates both flags', () => {
  const lowBest = rules.rewardFor({ tier: 'low', urgent: true, important: true });
  const mediumBest = rules.rewardFor({ tier: 'medium', urgent: true, important: true });
  const highBase = rules.rewardFor({ tier: 'high', urgent: false, important: false });
  assert.ok(lowBest.xp < mediumBest.xp);
  assert.ok(mediumBest.xp === highBase.xp);
  assert.ok(mediumBest.coins === highBase.coins);
});
