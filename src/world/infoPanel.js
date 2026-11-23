(function (root, factory) {
  const api = factory(root && root.document ? root.document : null);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldInfoPanel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (defaultDocument) {
  'use strict';

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function query(element, selector) {
    if (!element || typeof element.querySelector !== 'function') return null;
    try {
      return element.querySelector(selector);
    } catch (error) {
      return null;
    }
  }

  function attach(element, handlers) {
    const owner = handlers || {};
    if (!isRecord(element)) {
      return {
        isAvailable: () => false,
        isOpen: () => false,
        update: () => false,
        focusClose: () => false,
        destroy: () => false
      };
    }

    const doc = element.ownerDocument || defaultDocument;
    const title = query(element, 'h3');
    const type = query(element, '[data-world-object-type]');
    const meta = query(element, '[data-world-object-meta]');
    const close = query(element, 'button');
    let open = false;
    let destroyed = false;

    function notifyClose(reason) {
      if (typeof owner.onClose === 'function') owner.onClose(reason);
    }

    function onCloseClick(event) {
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      notifyClose('button');
    }

    function onPanelPointerDown(event) {
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    }

    function onPanelKeyDown(event) {
      if (!event || event.key !== 'Escape') return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      notifyClose('escape');
    }

    if (close && typeof close.addEventListener === 'function') {
      close.addEventListener('click', onCloseClick);
    }
    if (typeof element.addEventListener === 'function') {
      element.addEventListener('pointerdown', onPanelPointerDown);
      element.addEventListener('keydown', onPanelKeyDown);
    }

    function clearMeta() {
      if (!meta) return;
      if (typeof meta.replaceChildren === 'function') {
        meta.replaceChildren();
        return;
      }
      while (meta.firstChild) meta.removeChild(meta.firstChild);
    }

    function appendText(parent, tag, value) {
      if (!doc || typeof doc.createElement !== 'function' || !parent) return null;
      const node = doc.createElement(tag);
      node.textContent = String(value === undefined || value === null ? '' : value);
      if (typeof parent.appendChild === 'function') parent.appendChild(node);
      return node;
    }

    function update(description) {
      if (destroyed) return false;
      const available = Boolean(title || type || meta);
      if (!available) {
        open = false;
        element.hidden = true;
        return false;
      }

      if (!isRecord(description)) {
        open = false;
        element.hidden = true;
        clearMeta();
        return true;
      }

      if (title) title.textContent = String(description.name || '');
      if (type) type.textContent = String(description.typeLabel || '');

      clearMeta();
      if (element.dataset) element.dataset.worldObjectId = String(description.id || '');
      const facts = Array.isArray(description.facts) ? description.facts : [];
      for (const fact of facts) {
        if (!isRecord(fact)) continue;
        const row = doc && typeof doc.createElement === 'function'
          ? doc.createElement('div')
          : null;
        const parent = row && typeof meta.appendChild === 'function'
          ? (meta.appendChild(row), row)
          : meta;
        appendText(parent, 'dt', fact.label);
        appendText(parent, 'dd', fact.value);
      }

      open = true;
      element.hidden = false;
      return true;
    }

    return {
      isAvailable: () => !destroyed && Boolean(title || type || meta),
      isOpen: () => !destroyed && open,
      update,
      focusClose() {
        if (destroyed || !close || typeof close.focus !== 'function') return false;
        close.focus();
        return true;
      },
      destroy() {
        if (destroyed) return false;
        destroyed = true;
        open = false;
        if (close && typeof close.removeEventListener === 'function') {
          close.removeEventListener('click', onCloseClick);
        }
        if (typeof element.removeEventListener === 'function') {
          element.removeEventListener('pointerdown', onPanelPointerDown);
          element.removeEventListener('keydown', onPanelKeyDown);
        }
        element.hidden = true;
        return true;
      }
    };
  }

  return { attach };
});
