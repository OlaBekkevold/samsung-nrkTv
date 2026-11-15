/*
 * Full-screen player. Uses the HTML5 <video> element, which plays HLS natively on Tizen TVs.
 * Subtitles are WebVTT files fetched and drawn by this file, which works the same on every
 * Tizen version (native <track> and ::cue support vary).
 */
var Player = (function () {
  'use strict';

  var root = document.getElementById('player');
  var video = document.getElementById('video');
  var subsEl = document.getElementById('subs');
  var msgEl = document.getElementById('player-msg');
  var spinner = document.getElementById('spinner');
  var osd = {
    title: root.querySelector('.osd-title'),
    sub: root.querySelector('.osd-sub'),
    fill: root.querySelector('.osd-fill'),
    time: root.querySelector('.osd-time')
  };

  var state = null;    // { id, kind: 'program'|'channel', cues, subsOn, lastSaved }
  var osdTimer = null;
  var onCloseCb = null;
  var seekTarget = null, seekTimer = null;

  /* ---------- helpers ---------- */

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    var mm = (h && m < 10 ? '0' : '') + m, ss = (s < 10 ? '0' : '') + s;
    return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  function isoDuration(s) {
    var m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/.exec(s || '');
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  }

  function showMsg(text) { msgEl.textContent = text; msgEl.classList.remove('hidden'); }
  function hideMsg() { msgEl.classList.add('hidden'); }
  function busy(on) { spinner.classList.toggle('hidden', !on); }

  function showOsd(ms) {
    root.classList.add('osd-visible');
    clearTimeout(osdTimer);
    if (!video.paused) osdTimer = setTimeout(function () { root.classList.remove('osd-visible'); }, ms || 4000);
  }

  function updateOsd() {
    var dur = video.duration;
    var pos = seekTarget !== null ? seekTarget : video.currentTime;
    if (isFinite(dur) && dur > 0) {
      osd.fill.style.width = (pos / dur * 100).toFixed(2) + '%';
      osd.time.textContent = fmt(pos) + ' / ' + fmt(dur);
    }
  }

  /* ---------- WebVTT ---------- */

  function parseTime(t) {
    var p = t.trim().split(':');
    var s = parseFloat(p.pop().replace(',', '.'));
    var m = +(p.pop() || 0), h = +(p.pop() || 0);
    return h * 3600 + m * 60 + s;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function parseVtt(text) {
    var cues = [];
    var blocks = text.replace(/\r/g, '').split(/\n\n+/);
    for (var i = 0; i < blocks.length; i++) {
      var lines = blocks[i].split('\n');
      for (var j = 0; j < lines.length; j++) {
        var m = /^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)/.exec(lines[j]);
        if (!m) continue;
        var body = lines.slice(j + 1).join('\n')
          .replace(/<(?!\/?i>)[^>]+>/g, '')        // keep only <i>
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        var html = escapeHtml(body).replace(/&lt;(\/?)i&gt;/g, '<$1i>').replace(/\n/g, '<br>');
        cues.push({ start: parseTime(m[1]), end: parseTime(m[2]), html: html });
        break;
      }
    }
    return cues;
  }

  function loadSubtitles(list) {
    if (!list || !list.length) return;
    var chosen = null;
    for (var i = 0; i < list.length; i++) if (list[i].defaultOn) chosen = list[i];
    chosen = chosen || list[0];
    var forId = state.id;
    API.getText(chosen.webVtt).then(function (txt) {
      if (!state || state.id !== forId) return;
      state.cues = parseVtt(txt);
      state.subLabel = chosen.label;
    }).catch(function (e) { console.warn('Subtitles failed', e); });
  }

  var lastCueHtml = '';
  function renderCue() {
    var html = '';
    if (state && state.subsOn && state.cues) {
      var t = video.currentTime, parts = [];
      for (var i = 0; i < state.cues.length; i++) {
        var c = state.cues[i];
        if (c.start <= t && t < c.end) parts.push(c.html);
        else if (c.start > t) break;
      }
      if (parts.length) html = '<span>' + parts.join('<br>') + '</span>';
    }
    if (html !== lastCueHtml) { subsEl.innerHTML = html; lastCueHtml = html; }
  }

  /* ---------- video events ---------- */

  video.addEventListener('timeupdate', function () {
    renderCue();
    if (root.classList.contains('osd-visible')) updateOsd();
    if (state && state.kind === 'program' && Math.abs(video.currentTime - state.lastSaved) >= 5) {
      state.lastSaved = video.currentTime;
      Progress.set(state.id, video.currentTime, video.duration);
    }
  });
  video.addEventListener('waiting', function () { busy(true); });
  video.addEventListener('playing', function () { busy(false); hideMsg(); });
  video.addEventListener('canplay', function () { busy(false); });
  video.addEventListener('pause', function () { showOsd(); });
  video.addEventListener('play', function () { showOsd(); });
  video.addEventListener('ended', function () {
    if (state && state.kind === 'program') Progress.set(state.id, video.duration, video.duration);
    close();
  });
  video.addEventListener('error', function () {
    busy(false);
    var err = video.error;
    showMsg('Kunne ikke spille av (' + (err ? 'feilkode ' + err.code : 'ukjent feil') + ').');
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state) video.pause();
  });

  /* ---------- keys ---------- */

  function commitSeek() {
    if (seekTarget === null) return;
    video.currentTime = seekTarget;
    seekTarget = null;
  }

  function seekBy(delta) {
    if (!state || state.kind !== 'program' || !isFinite(video.duration)) return;
    var base = seekTarget !== null ? seekTarget : video.currentTime;
    seekTarget = Math.max(0, Math.min(video.duration - 2, base + delta));
    updateOsd();
    showOsd();
    // Wait until the user stops pressing before seeking, so repeated presses add up.
    clearTimeout(seekTimer);
    seekTimer = setTimeout(commitSeek, 600);
  }

  function togglePlay() {
    if (video.paused) video.play(); else video.pause();
  }

  function toggleSubs() {
    if (!state) return;
    if (!state.cues) { App.toast('Ingen undertekster for dette programmet'); return; }
    state.subsOn = !state.subsOn;
    Prefs.set('subsOn', state.subsOn);
    renderCue();
    App.toast(state.subsOn ? 'Undertekster på' + (state.subLabel ? ' (' + state.subLabel + ')' : '') : 'Undertekster av');
  }

  function keyHandler(code) {
    switch (code) {
      case Keys.BACK: case Keys.ESC: case Keys.BACKSPACE: case Keys.STOP:
        close(); return true;
      case Keys.ENTER: case Keys.PLAY_PAUSE:
        togglePlay(); return true;
      case Keys.PLAY: video.play(); return true;
      case Keys.PAUSE: video.pause(); return true;
      case Keys.LEFT: seekBy(-10); return true;
      case Keys.RIGHT: seekBy(30); return true;
      case Keys.RW: seekBy(-60); return true;
      case Keys.FF: seekBy(60); return true;
      case Keys.UP: toggleSubs(); showOsd(); return true;
      case Keys.DOWN: updateOsd(); showOsd(); return true;
    }
    return true; // swallow everything else while playing
  }

  /* ---------- open / close ---------- */

  function start(manifest, info) {
    if (manifest.playability !== 'playable' || !manifest.playable) {
      var np = manifest.nonPlayable || {};
      busy(false);
      showMsg(np.endUserMessage || 'Dette innholdet kan ikke spilles av nå.');
      return;
    }
    var asset = manifest.playable.assets && manifest.playable.assets[0];
    if (!asset) { busy(false); showMsg('Fant ingen strøm for dette innholdet.'); return; }

    var forId = state.id;
    attachSource(asset.url).then(function () {
      if (!state || state.id !== forId) return;
      var pr = video.play();
      if (pr && pr.catch) pr.catch(function (e) { console.warn('play() rejected', e); });
    }).catch(function (e) {
      busy(false);
      showMsg('Kunne ikke starte avspilling. ' + e.message);
    });
    loadSubtitles(manifest.playable.subtitles);

    var resumeAt = 0;
    if (info.kind === 'program') {
      var p = Progress.get(info.id);
      var total = isoDuration(manifest.playable.duration);
      if (p && p.pos > 30 && (!total || p.pos < total - 60)) resumeAt = p.pos;
    }
    if (resumeAt) {
      var once = function () {
        video.removeEventListener('loadedmetadata', once);
        video.currentTime = resumeAt;
        App.toast('Fortsetter fra ' + fmt(resumeAt));
      };
      video.addEventListener('loadedmetadata', once);
    }
  }

  /* ---------- stream source ---------- */

  // Samsung TVs (and Safari) play HLS natively. Desktop Chrome/Firefox/Edge don't, so there the
  // player loads hls.js on demand. It is never downloaded on the TV.
  var HLS_JS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.7.4/dist/hls.min.js';
  var hls = null, hlsLoading = null;

  function needsHlsJs() {
    if (API.IS_TIZEN) return false;
    var hasMse = !!(window.MediaSource || window.ManagedMediaSource);
    // Prefer hls.js wherever MSE exists: some desktop browsers claim native HLS support but fail.
    return hasMse || !video.canPlayType('application/vnd.apple.mpegurl');
  }

  function loadHlsJs() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsLoading) return hlsLoading;
    hlsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = HLS_JS_URL;
      s.onload = function () { window.Hls ? resolve(window.Hls) : reject(new Error('hls.js lastet ikke')); };
      s.onerror = function () { hlsLoading = null; reject(new Error('Kunne ikke laste hls.js')); };
      document.head.appendChild(s);
    });
    return hlsLoading;
  }

  function attachSource(url) {
    // NRK's stream CDN allows CORS, so hls.js can fetch directly without the dev proxy.
    if (!needsHlsJs()) { video.src = url; return Promise.resolve(); }
    return loadHlsJs().then(function (Hls) {
      if (!Hls.isSupported()) { video.src = url; return; }
      destroyHls();
      hls = new Hls({ enableWorker: true });
      hls.on(Hls.Events.ERROR, function (ev, data) {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.details !== 'manifestLoadError') { hls.startLoad(); return; }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        busy(false);
        showMsg('Kunne ikke spille av (' + data.details + ').');
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    });
  }

  function destroyHls() {
    if (hls) { hls.destroy(); hls = null; }
  }

  function open(info, onClose) {
    // info: { kind: 'program'|'channel', id, title, subtitle }
    if (state) close();
    state = { id: info.id, kind: info.kind, cues: null, subsOn: Prefs.get('subsOn', true), lastSaved: 0 };
    onCloseCb = onClose || null;
    osd.title.textContent = info.title || '';
    osd.sub.textContent = info.subtitle || '';
    osd.fill.style.width = '0';
    osd.time.textContent = '';
    subsEl.innerHTML = ''; lastCueHtml = '';
    hideMsg();
    root.classList.toggle('live', info.kind === 'channel');
    root.classList.remove('hidden');
    busy(true);
    showOsd(5000);
    Nav.push(keyHandler);

    var forId = info.id;
    var req = info.kind === 'channel' ? API.channelManifest(info.id) : API.programManifest(info.id);
    req.then(function (m) {
      if (!state || state.id !== forId) return;
      start(m, info);
    }).catch(function (e) {
      busy(false);
      showMsg('Kunne ikke hente avspillingsinformasjon. ' + e.message);
    });
  }

  function close() {
    if (!state) return;
    if (state.kind === 'program' && video.currentTime > 0) Progress.set(state.id, video.currentTime, video.duration);
    clearTimeout(seekTimer); seekTarget = null;
    clearTimeout(osdTimer);
    video.pause();
    destroyHls();
    video.removeAttribute('src');
    video.load();
    root.classList.add('hidden');
    root.classList.remove('osd-visible');
    busy(false);
    state = null;
    Nav.pop(keyHandler);
    var cb = onCloseCb; onCloseCb = null;
    if (cb) cb();
  }

  return { open: open, close: close, isOpen: function () { return !!state; }, parseVtt: parseVtt };
})();
