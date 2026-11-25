const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8').replace(/\r\n/g, '\n');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function mediaBlock(maxWidth) {
  const marker = '@media(max-width:' + maxWidth + 'px) {';
  const start = css.indexOf(marker);
  assert.notEqual(start, -1, marker + ' is missing');
  const end = css.indexOf('\n}', start);
  assert.notEqual(end, -1, marker + ' does not close');
  return css.slice(start, end);
}

const tablet = mediaBlock(1180);
const mobile = mediaBlock(440);

test('responsive breakpoints cover laptop, tablet, mobile and narrow mobile', () => {
  assert.match(css, /@media\(max-width:1180px\) \{/);
  assert.match(css, /@media\(max-width:440px\) \{/);
  assert.ok(css.indexOf('@media(max-width:1180px)') < css.indexOf('@media(max-width:440px)'));
  assert.match(html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
});

test('the 1180px breakpoint prevents laptop and tablet widget clipping', () => {
  assert.match(tablet, /\.welcome-grid \{[\s\S]*?grid-template-columns: 1fr 1fr/);
  assert.match(tablet, /\.welcome-card \{[\s\S]*?grid-column: 1 \/ -1/);
  assert.match(tablet, /\.dashboard-grid \{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(tablet, /\.calendar-day \{[\s\S]*?min-height: 34px/);
  assert.match(tablet, /\.section-actions \{[\s\S]*?width: 100%/);
  assert.match(tablet, /\.cozy-hero::after \{[\s\S]*?display: none/);
});

test('the 440px breakpoint stacks decoration catalogs and keeps controls usable', () => {
  assert.match(mobile, /\.decor-row \{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(mobile, /\.decor-block \{[\s\S]*?min-height: 0/);
  assert.match(mobile, /\.decor-item \{[\s\S]*?flex-wrap: wrap/);
  assert.match(mobile, /\.decor-item button \{[\s\S]*?min-height: 36px/);
  assert.match(mobile, /\.decor-actions button \{[\s\S]*?min-width: 44px/);
  assert.match(mobile, /\.biome-row select \{[\s\S]*?width: 100%/);
  assert.match(mobile, /\.placement-row input \{[\s\S]*?flex: 1 1 52px/);
  assert.match(mobile, /\.world-reset \{[\s\S]*?min-height: 36px/);
  assert.match(mobile, /\.calendar-nav-btn \{[\s\S]*?width: 36px/);
});

test('interactive controls have comfortable baseline touch targets', () => {
  assert.match(css, /\.calendar-nav-btn \{[\s\S]*?width: 32px;\n  height: 32px;\n  flex: none/);
  assert.match(css, /\.calendar-day \{[\s\S]*?min-width: 32px;[\s\S]*?min-height: 32px;[\s\S]*?aspect-ratio: auto/);
  assert.match(css, /\.calendar-widget \{[\s\S]*?padding-left: 12px;[\s\S]*?padding-right: 12px/);
  assert.match(css, /\.calendar-weekdays,\.calendar-week \{[\s\S]*?gap: 2px/);
  assert.match(css, /\.calendar-quick-add \{[\s\S]*?min-height: 32px/);
  assert.match(css, /\.filter \{[\s\S]*?min-height: 32px/);
  assert.match(css, /\.task-check \{[\s\S]*?width: 32px;\n  height: 32px/);
  assert.match(css, /\.task-actions button \{[\s\S]*?min-width: 32px;\n  min-height: 32px/);
  assert.match(css, /\.decor-item button \{[\s\S]*?min-height: 30px/);
  assert.match(css, /\.world-reset \{[\s\S]*?min-height: 32px/);
});

test('task filters, toolbar and focus presets wrap instead of clipping content', () => {
  assert.match(css, /\.task-toolbar \{[\s\S]*?flex-wrap: wrap/);
  assert.match(css, /\.focus-presets \{[\s\S]*?flex-wrap: wrap/);
  assert.match(css, /\.topbar-actions \{[\s\S]*?flex: none/);
});

test('accessibility and reduced-motion safeguards remain intact', () => {
  assert.match(css, /button:focus-visible,input:focus-visible,select:focus-visible \{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{/);
  assert.match(css, /\.task-flower\.is-blooming \{\n    animation: none/);
  assert.match(css, /\.cozy-return,\.cozy-return-arrow \{\n    transition: none/);
});

test('responsive polish stays vanilla, classic-script and file:// compatible', () => {
  const scripts = Array.from(html.matchAll(/<script\b([^>]*)>/g)).map((match) => match[1]);
  assert.equal(scripts.some((tag) => /\btype="module"/.test(tag)), false);
  assert.equal(scripts.some((tag) => /\bsrc="https?:/.test(tag)), false);
  assert.doesNotMatch(html, /react|vue|angular/i);

  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g)).map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id found in index.html');

  assert.equal(app.includes("document.body.classList.add('is-cozyquest')"), true);
  assert.equal(app.includes("document.body.classList.remove('is-cozyquest')"), true);
  assert.equal(app.includes("target.closest('#back-to-dashboard')"), true);
});
