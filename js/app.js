/*
 * App shell: side menu, a back stack of views with focus restore, and key dispatch.
 */
var App = (function () {
  'use strict';

  var content = document.getElementById('content');
  var toastEl = document.getElementById('toast');
  var menuViews = {
    front: { name: 'page', args: { id: 'frontpage' } },
    categories: { name: 'categories', args: {} },
    live: { name: 'live', args: {} },
    search: { name: 'search', args: {} }
  };

  var stack = [];       // [{ name, args, menu, focusKey, scrollTop }]
  var ctx = null;       // context of the view on screen
  var renderSeq = 0;
  var toastTimer = null;

  function top() { return stack[stack.length - 1]; }

  function remember() {
    var t = top();
    if (!t) return;
    var cur = Nav.current;
    t.focusKey = cur && content.contains(cur) ? cur.getAttribute('data-key') : null;
    t.scrollTop = content.scrollTop;
  }

  function markMenu(menu) {
    var items = document.querySelectorAll('.menu-item');
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', items[i].getAttribute('data-menu') === menu);
  }

  function render(entry, restore) {
    var my = ++renderSeq;
    ctx = {
      el: content,
      actions: {},
      inputKeys: null,
      alive: function () { return my === renderSeq; },
      set: function (html) { if (my === renderSeq) content.innerHTML = html; }
    };
    markMenu(entry.menu);
    if (!restore) content.innerHTML = '<div class="loading">Laster …</div>';
    content.scrollTop = 0;

    var p;
    try { p = Promise.resolve(Views[entry.name](ctx, entry.args)); } catch (e) { p = Promise.reject(e); }
    return p.then(function () {
      if (my !== renderSeq || Player.isOpen()) return;
      var el = restore ? Nav.findByKey(entry.focusKey) : null;
      if (restore) content.scrollTop = entry.scrollTop || 0;
      if (!el && !restore && ctx.focusSelector) el = content.querySelector(ctx.focusSelector);
      if (el) Nav.focus(el);
      else if (!restore || !Nav.current || !document.getElementById('menu').contains(Nav.current)) Nav.focusFirst(content);
    }).catch(function (e) {
      if (my !== renderSeq) return;
      console.error(e);
      ctx.actions.retry = function () { render(entry, false); };
      content.innerHTML = '<div class="error">Noe gikk galt: ' + String(e.message || e).replace(/</g, '&lt;') + '</div>' +
        '<div class="tab focusable" data-key="retry">Prøv igjen</div>';
      Nav.focusFirst(content);
    });
  }

  function go(name, args) {
    remember();
    var entry = { name: name, args: args || {}, menu: top() ? top().menu : 'front' };
    stack.push(entry);
    render(entry, false);
  }

  function openMenu(menu) {
    var v = menuViews[menu];
    stack = [{ name: v.name, args: JSON.parse(JSON.stringify(v.args)), menu: menu }];
    render(top(), false);
  }

  function exitApp() {
    if (API.IS_TIZEN) {
      try { tizen.application.getCurrentApplication().exit(); } catch (e) { /* ignore */ }
    }
  }

  function back() {
    var menuEl = document.getElementById('menu');
    if (stack.length > 1) {
      stack.pop();
      render(top(), true);
    } else if (Nav.current && !menuEl.contains(Nav.current)) {
      Nav.focus(menuEl.querySelector('.menu-item.active') || menuEl.querySelector('.menu-item'));
    } else {
      exitApp();
    }
  }

  function play(info) {
    remember();
    Player.open(info, function () {
      // Re-render so progress bars are up to date; data comes from the cache.
      render(top(), true);
    });
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.add('hidden'); }, 2500);
  }

  /* Base key handler for browsing (the player pushes its own handler on top). */
  function browseKeys(code) {
    var active = document.activeElement;
    if (active && active.tagName === 'INPUT') {
      if (ctx && ctx.inputKeys && ctx.inputKeys(code)) return true;
      if (code !== Keys.UP && code !== Keys.DOWN) return false;
      active.blur();
    }
    if (Nav.arrows(code)) return true;
    if (code === Keys.ENTER) {
      var el = Nav.current;
      if (!el) return true;
      var menu = el.getAttribute('data-menu');
      if (menu) { openMenu(menu); return true; }
      var fn = ctx && ctx.actions[el.getAttribute('data-key')];
      if (fn) fn(el);
      return true;
    }
    if (code === Keys.BACK || code === Keys.ESC || code === Keys.BACKSPACE) { back(); return true; }
    return false;
  }

  function registerTvKeys() {
    if (!API.IS_TIZEN || !tizen.tvinputdevice) return;
    var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind'];
    try {
      if (tizen.tvinputdevice.registerKeyBatch) tizen.tvinputdevice.registerKeyBatch(keys);
      else keys.forEach(function (k) { tizen.tvinputdevice.registerKey(k); });
    } catch (e) { console.warn('Key registration failed', e); }
  }

  /* Scale the 1920x1080 design to the actual screen, letterboxed if the aspect ratio differs.
     4K Samsung TVs give web apps a 1920x1080 viewport (scale 1); HD models and browser windows differ. */
  function fitToScreen() {
    var w = window.innerWidth || 1920, h = window.innerHeight || 1080;
    var s = Math.min(w / 1920, h / 1080);
    var x = Math.round((w - 1920 * s) / 2), y = Math.round((h - 1080 * s) / 2);
    document.body.style.transform = s === 1 ? '' : 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
    Nav.setScale(s);
  }

  function init() {
    fitToScreen();
    window.addEventListener('resize', fitToScreen);
    registerTvKeys();
    Nav.push(browseKeys);
    // Mouse/pointer support (Samsung Smart Remote pointer, desktop testing).
    document.getElementById('app').addEventListener('click', function (e) {
      var el = e.target.closest('.focusable');
      if (!el) return;
      Nav.focus(el);
      browseKeys(Keys.ENTER);
    });
    openMenu('front');
  }

  return { init: init, go: go, back: back, play: play, toast: toast };
})();

App.init();
