/*
 * Thin client for NRK's PSAPI (https://psapi.nrk.no/documentation/).
 * Written for the Chromium in 2018+ Tizen TVs (Chromium 56): no optional chaining,
 * no object spread, no async/await.
 */
var API = (function () {
  'use strict';

  var IS_TIZEN = typeof window.tizen !== 'undefined';
  // In a desktop browser the dev server (dev/server.js) proxies NRK hosts, since PSAPI sends no CORS headers.
  // On the TV, config.xml's <access origin="*"> lets the app call NRK directly.
  var DEV_PROXY = !IS_TIZEN && /^https?:$/.test(location.protocol);
  var PSAPI = 'https://psapi.nrk.no';
  var CACHE_MS = 5 * 60 * 1000;
  var cache = {};

  function xurl(url) {
    if (!DEV_PROXY) return url;
    var m = /^https:\/\/([^/]+)(\/.*)?$/.exec(url);
    return m ? '/proxy/' + m[1] + (m[2] || '/') : url;
  }

  function get(path, opts) {
    var url = xurl(/^https?:/.test(path) ? path : PSAPI + path);
    var noCache = opts && opts.noCache;
    var hit = cache[url];
    if (!noCache && hit && Date.now() - hit.t < CACHE_MS) return Promise.resolve(hit.d);
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + path);
      return r.json();
    }).then(function (d) {
      cache[url] = { t: Date.now(), d: d };
      return d;
    });
  }

  function getText(url) {
    return fetch(xurl(url)).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.text();
    });
  }

  /* PSAPI uses several image shapes: {uri,width}, {url,width}, {url,pixelWidth}, {imageUrl,pixelWidth}. */
  function pickImage(img, wanted) {
    if (!img) return '';
    var list = Array.isArray(img) ? img : (img.webImages || img.images || img.items || []);
    var best = '', bestW = 0;
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var u = it.uri || it.url || it.imageUrl;
      var w = it.width || it.pixelWidth || 0;
      if (!u) continue;
      if (!best || (bestW < wanted && w > bestW) || (w >= wanted && w < bestW)) { best = u; bestW = w; }
    }
    return best;
  }

  return {
    IS_TIZEN: IS_TIZEN,
    xurl: xurl,
    getText: getText,
    pickImage: pickImage,

    pageList: function () { return get('/tv/pages'); },
    page: function (id) { return get('/tv/pages/' + encodeURIComponent(id)); },
    series: function (id) { return get('/tv/catalog/series/' + encodeURIComponent(id)); },
    season: function (seriesId, seasonId) {
      return get('/tv/catalog/series/' + encodeURIComponent(seriesId) + '/seasons/' + encodeURIComponent(seasonId));
    },
    live: function () { return get('/tv/live', { noCache: true }); },
    search: function (q) { return get('/search?q=' + encodeURIComponent(q), { noCache: true }); },
    programMetadata: function (id) { return get('/playback/metadata/program/' + encodeURIComponent(id)); },
    // Manifests carry short-lived stream URLs, so they are never cached.
    programManifest: function (id) { return get('/playback/manifest/program/' + encodeURIComponent(id), { noCache: true }); },
    channelManifest: function (id) { return get('/playback/manifest/channel/' + encodeURIComponent(id), { noCache: true }); }
  };
})();

/* Watch progress, stored per program on the TV itself. */
var Progress = (function () {
  'use strict';
  function key(id) { return 'progress:' + id; }
  function read(id) {
    try { return JSON.parse(localStorage.getItem(key(id)) || 'null'); } catch (e) { return null; }
  }
  return {
    get: read,
    set: function (id, pos, dur) {
      try {
        if (dur && pos > dur * 0.95) localStorage.removeItem(key(id));
        else localStorage.setItem(key(id), JSON.stringify({ pos: Math.floor(pos), dur: Math.floor(dur || 0) }));
      } catch (e) { /* storage full or unavailable: progress is a convenience */ }
    },
    fraction: function (id) {
      var p = read(id);
      return p && p.dur ? Math.min(1, p.pos / p.dur) : 0;
    }
  };
})();

var Prefs = {
  get: function (k, def) {
    try { var v = localStorage.getItem('pref:' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
  },
  set: function (k, v) { try { localStorage.setItem('pref:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
};
