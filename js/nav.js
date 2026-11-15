/*
 * Remote-control navigation.
 * Every element with class "focusable" can take focus. Arrow keys move to the nearest
 * focusable element in that direction (by on-screen geometry), so views need no
 * hand-written focus maps.
 */
var Keys = {
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
  BACK: 10009, ESC: 27, BACKSPACE: 8,
  PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252, STOP: 413, FF: 417, RW: 412,
  IME_DONE: 65376, IME_CANCEL: 65385
};

var Nav = (function () {
  'use strict';

  var current = null;
  var handlers = []; // stack of key handlers; the top one sees keys first

  function isVisible(el) {
    return el.offsetParent !== null && !el.closest('.hidden');
  }

  function all() {
    var list = document.querySelectorAll('#app .focusable');
    var out = [];
    for (var i = 0; i < list.length; i++) if (isVisible(list[i])) out.push(list[i]);
    return out;
  }

  function focus(el) {
    if (!el) return;
    if (current && current !== el) {
      current.classList.remove('focused');
      if (current.tagName === 'INPUT' && document.activeElement === current) current.blur();
    }
    current = el;
    el.classList.add('focused');
    ensureVisible(el);
  }

  /* Scroll horizontal rows and the main content area so the focused element is on screen. */
  function ensureVisible(el) {
    var row = el.closest('.row');
    if (row) {
      var rr = row.getBoundingClientRect(), er = el.getBoundingClientRect();
      var pad = 56;
      if (er.right > rr.right - pad) row.scrollLeft += er.right - rr.right + pad;
      else if (er.left < rr.left + 6) row.scrollLeft -= rr.left + 6 - er.left;
    }
    var content = document.getElementById('content');
    if (content.contains(el)) {
      var cr = content.getBoundingClientRect();
      // Keep the whole section (title + row) in view when possible.
      var block = el.closest('.section') || el;
      var br = block.getBoundingClientRect();
      if (br.height > cr.height - 120) br = el.getBoundingClientRect();
      if (br.bottom > cr.bottom - 40) content.scrollTop += br.bottom - cr.bottom + 40;
      else if (br.top < cr.top + 30) content.scrollTop -= cr.top + 30 - br.top;
      if (content.scrollTop < 0) content.scrollTop = 0;
    }
  }

  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function move(dir) {
    var items = all();
    if (!current || items.indexOf(current) < 0) { focus(items[0]); return; }
    var menu = document.getElementById('menu');
    var inMenu = menu.contains(current);
    var vertical = dir === 'up' || dir === 'down';
    // Up/down inside the side menu never leaves it.
    if (inMenu && vertical) items = items.filter(function (el) { return menu.contains(el); });
    var cr = current.getBoundingClientRect(), cc = center(cr);
    var cands = [];
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      if (el === current) continue;
      var r = el.getBoundingClientRect(), c = center(r);
      var primary, secondary;
      // Sideways moves stay on the same line, except when going into or out of the menu.
      if (!vertical && !inMenu && !menu.contains(el) && Math.abs(c.y - cc.y) > cr.height / 2) continue;
      if (dir === 'left') { if (r.right > cr.left + 4) continue; primary = cr.left - r.right; secondary = Math.abs(c.y - cc.y); }
      else if (dir === 'right') { if (r.left < cr.right - 4) continue; primary = r.left - cr.right; secondary = Math.abs(c.y - cc.y); }
      // Vertical moves line up left edges, so going between rows of different card sizes feels natural.
      else if (dir === 'up') { if (r.bottom > cr.top + 4) continue; primary = cr.top - r.bottom; secondary = Math.abs(r.left - cr.left); }
      else { if (r.top < cr.bottom - 4) continue; primary = r.top - cr.bottom; secondary = Math.abs(r.left - cr.left); }
      cands.push({ el: el, primary: Math.max(0, primary), secondary: secondary });
    }
    // Two passes: the nearest row (or column) wins, then the closest item within it.
    var minPrimary = Infinity, best = null, bestSecondary = Infinity, j;
    for (j = 0; j < cands.length; j++) minPrimary = Math.min(minPrimary, cands[j].primary);
    for (j = 0; j < cands.length; j++) {
      if (cands[j].primary <= minPrimary + 40 && cands[j].secondary < bestSecondary) {
        bestSecondary = cands[j].secondary; best = cands[j].el;
      }
    }
    // Entering the menu from the content lands on the active menu item.
    if (best && !inMenu && menu.contains(best)) best = menu.querySelector('.menu-item.active') || best;
    // Likewise, entering a tab strip lands on the selected tab.
    var tabs = best && best.closest('.tabs');
    if (tabs && !tabs.contains(current)) best = tabs.querySelector('.tab.active') || best;
    if (best) focus(best);
  }

  function onKey(e) {
    var code = e.keyCode;
    for (var i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i](code, e)) { e.preventDefault(); return; }
    }
  }

  document.addEventListener('keydown', onKey);

  return {
    focus: focus,
    move: move,
    get current() { return current; },
    focusFirst: function (root) {
      var el = (root || document).querySelector('.focusable');
      if (el && isVisible(el)) focus(el); else focus(all()[0]);
    },
    findByKey: function (key) {
      if (!key) return null;
      var items = all();
      for (var i = 0; i < items.length; i++) if (items[i].getAttribute('data-key') === key) return items[i];
      return null;
    },
    push: function (fn) { handlers.push(fn); },
    pop: function (fn) { var i = handlers.lastIndexOf(fn); if (i >= 0) handlers.splice(i, 1); },
    /* Default arrow handling for the browse UI. */
    arrows: function (code) {
      if (code === Keys.LEFT) { move('left'); return true; }
      if (code === Keys.RIGHT) { move('right'); return true; }
      if (code === Keys.UP) { move('up'); return true; }
      if (code === Keys.DOWN) { move('down'); return true; }
      return false;
    }
  };
})();
