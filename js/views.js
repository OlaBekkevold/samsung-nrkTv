/*
 * Screens. Each view renders into #content and registers an action for every
 * focusable element through ctx.card()/ctx.action(), keyed by data-key so the
 * router can restore focus when the user comes back.
 */
var Views = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Builds card HTML and records its action in ctx.actions. */
  function cardHtml(ctx, c) {
    ctx.actions[c.key] = c.action;
    var frac = c.progressId ? Progress.fraction(c.progressId) : 0;
    return '<div class="card focusable ' + c.size + (c.disabled ? ' disabled' : '') + '" data-key="' + esc(c.key) + '">' +
      (c.img ? '<img src="' + esc(c.img) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '') +
      (c.badge ? '<div class="badge">' + esc(c.badge) + '</div>' : '') +
      '<div class="meta"><div class="t">' + esc(c.title) + '</div>' +
      (c.sub ? '<div class="s">' + esc(c.sub) + '</div>' : '') + '</div>' +
      (frac > 0.01 ? '<div class="progress"><div style="width:' + (frac * 100).toFixed(1) + '%"></div></div>' : '') +
      '</div>';
  }

  function sectionHtml(title, cardsHtml, layout) {
    if (!cardsHtml) return '';
    return '<div class="section">' + (title ? '<div class="section-title">' + esc(title) + '</div>' : '') +
      '<div class="' + (layout || 'row') + '">' + cardsHtml + '</div></div>';
  }

  /* ---------- plug (item in a page section) -> card ---------- */

  function sizeFor(contract) {
    if (contract === 'multiHero' || contract === 'inlineHero') return 'hero';
    if (contract === 'portrait' || contract === 'portraitLogo') return 'portrait';
    return 'landscape';
  }

  function plugCard(plug, contract, key) {
    var dc = plug.displayContractContent || {};
    var size = sizeFor(contract);
    var imgSrc = size === 'hero' ? (dc.backdropImage || dc.displayContractImage) : dc.displayContractImage;
    var img = API.pickImage(imgSrc || dc.fallbackImage, size === 'hero' ? 1280 : size === 'portrait' ? 300 : 600);
    var title = dc.contentTitle || '';
    var sub = size === 'hero' ? (dc.description || dc.tagline || '') : (dc.tagline || '');
    var t = plug.targetType, target = plug[t] || {}, action = null, progressId = null;

    if (t === 'series' && target.seriesId) {
      action = function () { App.go('series', { id: target.seriesId }); };
    } else if ((t === 'episode' || t === 'standaloneProgram') && target.programId) {
      progressId = target.programId;
      if (t === 'episode' && size !== 'hero') sub = target.episodeTitle || '';
      action = function () {
        App.play({ kind: 'program', id: target.programId, title: title, subtitle: target.episodeTitle || dc.description || '' });
      };
    } else if (t === 'page' && target.pageId) {
      action = function () { App.go('page', { id: target.pageId }); };
    } else if (t === 'channel' && (target.channelId || target.id)) {
      action = function () { App.play({ kind: 'channel', id: target.channelId || target.id, title: title }); };
    } else {
      return null; // unknown target types (podcasts, external links …) are skipped
    }
    return { key: key, size: size, img: img, title: title, sub: sub, action: action, progressId: progressId };
  }

  /* ---------- views ---------- */

  function renderPage(ctx, args) {
    var pageId = args.id || 'frontpage';
    return API.page(pageId).then(function (page) {
      var html = pageId === 'frontpage' ? '' : '<div class="view-title">' + esc(page.title) + '</div>';
      (page.sections || []).forEach(function (s, si) {
        if (s.type === 'included' && s.included) {
          var inc = s.included, cards = '';
          (inc.plugs || []).forEach(function (p, pi) {
            var c = plugCard(p, inc.displayContract, 's' + si + '-' + pi);
            if (c) cards += cardHtml(ctx, c);
          });
          html += sectionHtml(inc.title, cards);
        } else if (s.type === 'placeholder' && s.placeholder && s.placeholder.type === 'categoryOverview') {
          html += '<div data-categories="' + si + '"></div>';
        }
        // Other placeholders (favourites, resume, myContent) need a logged-in NRK user and are skipped.
      });
      ctx.set(html || '<div class="empty">Ingen innhold.</div>');

      var slot = ctx.el.querySelector('[data-categories]');
      if (slot) {
        return API.pageList().then(function (list) {
          if (!ctx.alive()) return;
          var cards = categoryCards(ctx, list, 'cat-');
          slot.outerHTML = sectionHtml(page.sections[+slot.getAttribute('data-categories')].placeholder.title || 'Kategorier', cards);
        });
      }
    });
  }

  function categoryCards(ctx, list, prefix) {
    return (list.pageListItems || []).map(function (p) {
      var imgs = p.mainCategoryImages && p.mainCategoryImages.landscape;
      return cardHtml(ctx, {
        key: prefix + p.id, size: 'category', title: p.title,
        img: API.pickImage(imgs || p.image, 600),
        action: function () { App.go('page', { id: p.id }); }
      });
    }).join('');
  }

  function renderCategories(ctx) {
    return API.pageList().then(function (list) {
      ctx.set('<div class="view-title">Kategorier</div>' + sectionHtml('', categoryCards(ctx, list, 'c-'), 'grid'));
    });
  }

  function renderLive(ctx) {
    return API.live().then(function (channels) {
      var cards = channels.map(function (ch) {
        var pb = (ch._embedded && ch._embedded.playback) || {};
        var poster = pb.posters && pb.posters[0] && pb.posters[0].image;
        return cardHtml(ctx, {
          key: 'ch-' + ch.id, size: 'channel', title: pb.title || ch.id,
          img: API.pickImage(poster, 600), badge: 'Direkte',
          action: function () { App.play({ kind: 'channel', id: ch.id, title: pb.title || ch.id, subtitle: 'Direkte' }); }
        });
      }).join('');
      ctx.set('<div class="view-title">Direkte</div>' + sectionHtml('', cards, 'grid'));
    });
  }

  function seasonIdOf(s) {
    var self = (s._links && s._links.self) || {};
    return self.name || (self.href || '').split('/').pop();
  }

  function renderSeries(ctx, args) {
    return API.series(args.id).then(function (d) {
      var info = d[d.seriesType] || d.standard || d.sequential || d.news || {};
      var titles = info.titles || {};
      var seriesTitle = titles.title || args.id;
      var emb = d._embedded || {};
      var seasons = (emb.seasons || []).filter(function (s) {
        return s.hasAvailableEpisodes || s.hasAvailableInstalments;
      });

      var head = '<div class="series-head">' +
        '<img src="' + esc(API.pickImage(info.backdropImage || info.image, 1920)) + '" alt="">' +
        '<div class="info"><h1>' + esc(seriesTitle) + '</h1><p>' + esc(titles.subtitle || '') + '</p></div></div>';

      var tabs = '';
      if (seasons.length > 1) {
        tabs = '<div class="tabs">' + seasons.map(function (s) {
          var sid = seasonIdOf(s), key = 'season-' + sid;
          ctx.actions[key] = function () { args.season = sid; loadSeason(sid); };
          return '<div class="tab focusable" data-key="' + esc(key) + '" data-season="' + esc(sid) + '">' +
            esc(s.titles && s.titles.title || sid) + '</div>';
        }).join('') + '</div>';
      }
      ctx.set(head + tabs + '<div id="episodes"><div class="loading">Laster episoder …</div></div>');
      ctx.focusSelector = '#episodes .card:not(.disabled)';

      function showEpisodes(list) {
        var cards = list.map(function (ep) {
          var avail = ep.availability || {};
          var ok = !avail.status || avail.status === 'available';
          return cardHtml(ctx, {
            key: 'ep-' + ep.prfId, size: 'landscape',
            img: API.pickImage(ep.image, 600),
            title: ep.titles && ep.titles.title, sub: ok ? (ep.durationDisplayValue || '') : '',
            badge: ok ? '' : (avail.label || 'Ikke tilgjengelig'), disabled: !ok,
            progressId: ep.prfId,
            action: ok ? function () {
              App.play({ kind: 'program', id: ep.prfId, title: seriesTitle, subtitle: ep.titles && ep.titles.title });
            } : function () { App.toast(avail.label || 'Ikke tilgjengelig ennå'); }
          });
        }).join('');
        var box = ctx.el.querySelector('#episodes');
        if (box) box.innerHTML = cards ? '<div class="grid">' + cards + '</div>' : '<div class="empty">Ingen episoder tilgjengelig.</div>';
      }

      function markTab(sid) {
        var t = ctx.el.querySelectorAll('.tab');
        for (var i = 0; i < t.length; i++) t[i].classList.toggle('active', t[i].getAttribute('data-season') === sid);
      }

      function loadSeason(sid) {
        markTab(sid);
        return API.season(args.id, sid).then(function (s) {
          if (!ctx.alive()) return;
          var e = s._embedded || {};
          showEpisodes(e.episodes || e.instalments || []);
        });
      }

      if (seasons.length) {
        // Sequential series list seasons oldest first; daily/news series list newest first.
        var sid = args.season || seasonIdOf(d.seriesType === 'sequential' ? seasons[seasons.length - 1] : seasons[0]);
        args.season = sid;
        return loadSeason(sid);
      }
      // Series without seasons embed their episodes directly.
      var inst = emb.instalments && emb.instalments._embedded && emb.instalments._embedded.instalments;
      showEpisodes(inst || emb.episodes || []);
    });
  }

  function renderSearch(ctx, args) {
    ctx.actions['search-input'] = function (el) { el.focus(); }; // opens the on-screen keyboard on Tizen
    ctx.set('<div class="view-title">Søk</div>' +
      '<input class="search-box focusable" data-key="search-input" type="search" placeholder="Søk etter serier og programmer" value="' + esc(args.q || '') + '">' +
      '<div id="results"></div>');

    var input = ctx.el.querySelector('.search-box');
    var timer = null, seq = 0;

    function run() {
      var q = input.value.trim();
      args.q = q;
      var box = ctx.el.querySelector('#results');
      if (q.length < 2) { box.innerHTML = ''; return Promise.resolve(); }
      var my = ++seq;
      box.innerHTML = '<div class="loading">Søker …</div>';
      return API.search(q).then(function (d) {
        if (!ctx.alive() || my !== seq) return;
        var cards = (d.hits || []).map(function (h, i) {
          var x = h.hit || {};
          if (x.hasRights === false) return '';
          var c = { key: 'r-' + h.type + '-' + x.id, size: 'landscape', img: API.pickImage(x.image, 600), title: x.title };
          if (h.type === 'serie') {
            c.sub = 'Serie';
            c.action = function () { App.go('series', { id: x.id }); };
          } else if (h.type === 'program' || h.type === 'episode') {
            c.title = x.seriesTitle || x.title;
            c.sub = h.type === 'episode' ? (x.episodeTitle || x.title) : 'Program';
            c.progressId = x.id;
            c.action = function () { App.play({ kind: 'program', id: x.id, title: c.title, subtitle: h.type === 'episode' ? c.sub : '' }); };
          } else return '';
          return cardHtml(ctx, c);
        }).join('');
        box.innerHTML = cards ? '<div class="grid">' + cards + '</div>' : '<div class="empty">Ingen treff.</div>';
      }).catch(function (e) {
        if (my === seq) box.innerHTML = '<div class="error">Søket feilet: ' + esc(e.message) + '</div>';
      });
    }

    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 500); });

    // While the text field has real focus (keyboard open), only a few keys leave it.
    ctx.inputKeys = function (code) {
      if (code === Keys.IME_DONE || code === Keys.ENTER || code === Keys.DOWN || code === Keys.IME_CANCEL ||
          code === Keys.BACK || code === Keys.ESC) {
        input.blur();
        clearTimeout(timer);
        if (code !== Keys.IME_CANCEL && code !== Keys.BACK && code !== Keys.ESC) {
          run().then(function () {
            var first = ctx.el.querySelector('#results .focusable');
            if (first && code !== Keys.ENTER) Nav.focus(first);
          });
        }
        return true;
      }
      return false; // let the input handle typing and cursor keys
    };

    if (args.q) return run();
  }

  return {
    page: renderPage,
    categories: renderCategories,
    live: renderLive,
    series: renderSeries,
    search: renderSearch
  };
})();
