const test = require('node:test');
const assert = require('node:assert/strict');
const infoPanel = require('../src/world/infoPanel.js');

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.textContent = '';
    this.hidden = false;
    this.listeners = new Map();
    this.dataset = {};
  }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); return child; }
  get firstChild() { return this.children[0] || null; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    const index = handlers.indexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  }
  dispatch(type, overrides) {
    const event = Object.assign({
      type,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; }
    }, overrides || {});
    for (const handler of (this.listeners.get(type) || []).slice()) handler(event);
    return event;
  }
  focus() { this.focused = (this.focused || 0) + 1; }
}

function createPanel(withMarkup) {
  const doc = { createElement: (tag) => new FakeElement(tag) };
  const panel = new FakeElement('aside');
  panel.ownerDocument = doc;
  if (!withMarkup) return { doc, panel, title: null, type: null, meta: null, close: null };

  const eyebrow = new FakeElement('p');
  const title = new FakeElement('h3');
  title.setAttribute = () => {};
  title.id = 'world-object-title';
  const type = new FakeElement('p');
  type.id = 'world-object-type';
  const meta = new FakeElement('dl');
  meta.id = 'world-object-meta';
  const close = new FakeElement('button');
  close.setAttribute = () => {};
  panel.children = [close, eyebrow, title, type, meta];
  panel.querySelector = (selector) => {
    if (selector === 'h3') return title;
    if (selector === '[data-world-object-type]') return type;
    if (selector === '[data-world-object-meta]') return meta;
    if (selector === 'button') return close;
    return null;
  };
  return { doc, panel, title, type, meta, close };
}

test('attach is a no-op when panel markup is missing', () => {
  const missing = createPanel(false);
  const handle = infoPanel.attach(null, {});
  assert.equal(handle.isAvailable(), false);
  assert.equal(handle.update({ name: 'Tree' }), false);
  assert.equal(handle.isOpen(), false);
  assert.equal(handle.focusClose(), false);
  assert.equal(handle.destroy(), false);
  assert.equal(missing.panel.hidden, false);
});

test('update writes derived values with textContent and toggles hidden state', () => {
  const markup = createPanel(true);
  let closeReason = null;
  const handle = infoPanel.attach(markup.panel, {
    onClose(reason) { closeReason = reason; }
  });

  assert.equal(handle.isAvailable(), true);
  handle.update({
    name: '<Tree>',
    typeLabel: 'Tree',
    facts: [{ label: 'ID', value: '&tree-north&' }]
  });

  assert.equal(markup.panel.hidden, false);
  assert.equal(markup.title.textContent, '<Tree>');
  assert.equal(markup.type.textContent, 'Tree');
  assert.equal(markup.meta.children.length, 1);
  assert.equal(markup.meta.children[0].children[0].textContent, 'ID');
  assert.equal(markup.meta.children[0].children[1].textContent, '&tree-north&');
  assert.equal(handle.isOpen(), true);

  handle.update(null);
  assert.equal(markup.panel.hidden, true);
  assert.equal(handle.isOpen(), false);

  markup.close.dispatch('click');
  assert.equal(closeReason, 'button');

  handle.destroy();
  assert.equal(markup.panel.hidden, true);
});

test('panel close and Escape notify the owner and stop world gestures', () => {
  const markup = createPanel(true);
  const reasons = [];
  const handle = infoPanel.attach(markup.panel, {
    onClose(reason) { reasons.push(reason); }
  });

  const click = markup.close.dispatch('click');
  assert.equal(click.stopped, true);
  const pointer = markup.panel.dispatch('pointerdown');
  assert.equal(pointer.stopped, true);
  const escape = markup.panel.dispatch('keydown', { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);

  assert.deepEqual(reasons, ['button', 'escape']);
  handle.destroy();
  assert.equal(markup.close.listeners.get('click').length, 0);
});

test('focusClose focuses the close button when available', () => {
  const markup = createPanel(true);
  const handle = infoPanel.attach(markup.panel, {});
  assert.equal(handle.focusClose(), true);
  assert.equal(markup.close.focused, 1);
  handle.destroy();
});
