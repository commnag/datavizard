(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  $('#year').textContent = new Date().getFullYear();

  // Theme toggle (this visit only; the choice is never stored)
  $('#theme').addEventListener('click', function () {
    var current = root.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = current === 'dark' ? 'light' : 'dark';
    window.track('toggle-' + (next === 'dark' ? 'dark' : 'light'));
    root.setAttribute('data-theme', next);
  });

  // Count clicks on anything marked data-track (profile links, dashboard link)
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-track]');
    if (el) window.track(el.getAttribute('data-track'));
  });

  // Top bar: the small name appears once the big one scrolls away; background fades in on scroll
  var bar = $('.bar'), brand = $('#brand'), big = $('#name');
  if ('IntersectionObserver' in window && big) {
    new IntersectionObserver(function (entries) {
      var away = !entries[0].isIntersecting;
      brand.classList.toggle('show', away);
      bar.classList.toggle('solid', away);
    }, { rootMargin: '-60px 0px 0px 0px' }).observe(big);
  } else { brand.classList.add('show'); bar.classList.add('solid'); }

  // Career spine fills as the experience section scrolls through the viewport
  var spine = $('#trajectory'), stops = $$('.stop', spine || document);
  function fillSpine() {
    if (!spine) return;
    if (reduce) {
      spine.style.setProperty('--p', 1);
      stops.forEach(function (s) { s.classList.add('reached'); });
      return;
    }
    var line = window.innerHeight * 0.62, r = spine.getBoundingClientRect(), p = (line - r.top) / r.height;
    spine.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
    // A stop's dot fills once the spine's fill line reaches it
    stops.forEach(function (s) { s.classList.toggle('reached', s.getBoundingClientRect().top + 15 <= line); });
  }
  var spineTick = false;
  window.addEventListener('scroll', function () {
    if (!spineTick) { spineTick = true; requestAnimationFrame(function () { fillSpine(); spineTick = false; }); }
  }, { passive: true });
  window.addEventListener('resize', fillSpine);
  fillSpine();

  // Hero deck: one chart card on top, the rest stacked behind. The front card lifts off and
  // drops to the back every few seconds; the active dot's progress bar is the timer, so
  // hover, focus and scrolling away pause it, and reduced motion (no animations) never advances.
  (function () {
    var deck = $('#deck');
    if (!deck) return;
    var cards = $$('.card', deck), dots = $$('.dot', deck), n = cards.length;
    var active = 0, arm;

    function place() {
      cards.forEach(function (c, i) {
        c.setAttribute('data-pos', (i - active + n) % n);
        c.setAttribute('aria-hidden', i === active ? 'false' : 'true');
      });
      dots.forEach(function (d, i) {
        if (i === active) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
    }

    function go(next) {
      next = (next + n) % n;
      if (next === active) return;
      var old = cards[active];
      cards.forEach(function (c) { c.classList.remove('is-active'); });
      cards[next].classList.remove('out');
      if (!reduce) {
        old.classList.add('out');
        setTimeout(function () {
          old.classList.add('snap');
          old.classList.remove('out');
          void old.offsetWidth;
          old.classList.remove('snap');
        }, 600);
      }
      active = next;
      place();
      clearTimeout(arm);
      arm = setTimeout(function () { cards[active].classList.add('is-active'); }, reduce ? 0 : 250);
    }

    dots.forEach(function (d, i) { d.addEventListener('click', function (e) { e.stopPropagation(); go(i); }); });
    $('.deck-stage', deck).addEventListener('click', function () { go(active + 1); });
    deck.addEventListener('animationend', function (e) { if (e.animationName === 'tick') go(active + 1); });
    deck.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') go(active + 1);
      else if (e.key === 'ArrowLeft') go(active - 1);
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        deck.classList.toggle('paused', !entries[0].isIntersecting);
      }, { threshold: 0.25 }).observe(deck);
    }
  })();

  // Results overlay: how the theme A/B test is going, read from GoatCounter's public visitor counter.
  // Ranges are UTC and the end date is exclusive. Numbers are fetched on idle or on hover, so they are
  // ready when the button is pressed.
  (function () {
    var btn = $('#stats-btn'), box = $('#stats');
    if (!btn || !box) return;
    var BASE = 'https://abhisheknag.goatcounter.com/counter/';
    // path to read, and which ranges to ask for (all time is enough for the funnel counts)
    var WEEKLY = ['all', 'week', 'prev'], ALL = ['all'];
    var SOURCES = { visits: ['%2Fdatavizard', WEEKLY], a: ['gate-daylight', WEEKLY], b: ['gate-night', WEEKLY], skipped: ['gate-skipped', ALL], left: ['gate-left', ALL] };
    function day(offset) { var d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }
    var RANGES = { all: '?start=2026-01-01', week: '?start=' + day(-6) + '&end=' + day(1), prev: '?start=' + day(-13) + '&end=' + day(-6) };
    var data = null, loading = null, lastFocus = null;

    function get(path, range) {
      try {
        return fetch(BASE + path + '.json' + range)
          .then(function (res) { return res.ok || res.status === 404 ? res.json() : null; })
          .then(function (j) { var n = j ? parseInt(String(j.count).replace(/\D/g, ''), 10) : NaN; return n >= 0 ? n : null; })
          .catch(function () { return null; });
      } catch (e) { return Promise.resolve(null); }
    }
    function load() {
      if (loading) return loading;
      var jobs = [];
      Object.keys(SOURCES).forEach(function (k) {
        SOURCES[k][1].forEach(function (r) { jobs.push(get(SOURCES[k][0], RANGES[r]).then(function (n) { return [k, r, n]; })); });
      });
      loading = Promise.all(jobs).then(function (rows) {
        var d = {}; rows.forEach(function (x) { (d[x[0]] = d[x[0]] || {})[x[1]] = x[2]; });
        data = d; return d;
      });
      return loading;
    }
    function fmt(n) { return n === null || n === undefined ? '\u2013' : n.toLocaleString(); }

    function countUp(el, n) {
      if (reduce || n === null || n < 8) { el.textContent = fmt(n); return; }
      var t0 = null;
      (function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / 800);
        el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
      })(performance.now());
    }
    function tile(id, d) {
      var el = $('#' + id), num = $('.t-num', el), note = $('.t-d', el);
      num.textContent = fmt(d.week);
      note.className = 't-d';
      if (d.week === null || d.prev === null) { note.textContent = ''; return; }
      if (d.prev === 0) { note.textContent = d.week > 0 ? 'New this week' : 'Quiet so far'; if (d.week > 0) note.classList.add('up'); return; }
      var diff = d.week - d.prev;
      if (diff > 0) { note.classList.add('up'); note.textContent = '+' + diff + ' on last week'; }
      else if (diff < 0) { note.classList.add('down'); note.textContent = '\u2212' + Math.abs(diff) + ' on last week'; }
      else note.textContent = 'Same as last week';
    }
    // Where did the visits go: picked a theme, skipped with Esc, left at the card, or not tracked
    // (blockers, bots, and counters that lag behind each other). Percentages are of whichever is larger,
    // the visits or the sum of what was counted, so the bar never overflows when the counters are out of step.
    function funnel(d) {
      var V = d.visits.all, box = $('#s-funnel');
      box.hidden = V === null;
      if (V === null) return;
      var picked = (d.a.all || 0) + (d.b.all || 0), skipped = d.skipped.all || 0, left = d.left.all || 0;
      var counted = picked + skipped + left, total = Math.max(V, counted), none = Math.max(0, V - counted);
      var parts = [['fn-picked', picked, 'f-picked'], ['fn-skipped', skipped, 'f-skipped'], ['fn-left', left, 'f-left'], ['fn-none', none, 'f-none']];
      parts.forEach(function (x) {
        var row = $('#' + x[0]), pct = total ? x[1] / total * 100 : 0;
        $('.fn-n', row).textContent = x[1].toLocaleString();
        $('.fn-p', row).textContent = total ? Math.round(pct) + '%' : '';
        setTimeout(function () { $('#fn-bar .' + x[2]).style.width = pct + '%'; }, 60);
      });
    }

    function render(d) {
      var all = [d.visits.all, d.a.all, d.b.all];
      var dead = all.every(function (n) { return n === null; });
      $('#stats-msg').hidden = !dead; $('#stats-body').hidden = dead;
      if (dead) return;
      countUp($('#s-visits'), d.visits.all);
      funnel(d);
      var a = d.a.all, b = d.b.all, total = (a || 0) + (b || 0);
      var pa = total ? Math.round((a || 0) / total * 100) : 0, pb = total ? 100 - pa : 0;
      [['duel-a', a, pa, a > b], ['duel-b', b, pb, b > a]].forEach(function (x) {
        var row = $('#' + x[0]);
        row.classList.toggle('lead', !!x[3]);
        $('.duel-n', row).textContent = x[1] === null ? '\u2013' : x[1].toLocaleString() + (x[1] === 1 ? ' pick' : ' picks');
        setTimeout(function () { $('.duel-bar i', row).style.width = x[2] + '%'; }, 60);
      });
      var verdict;
      if (a === null && b === null) verdict = '';
      else if (!total) verdict = 'No votes yet. Be the first.';
      else if (a === b) verdict = 'Dead heat. Somebody, pick a side.';
      else if (a > b) verdict = 'Daylight leads by ' + (a - b) + '. Night is plotting a comeback.';
      else verdict = 'Night leads by ' + (b - a) + '. Daylight is not worried.';
      $('#s-verdict').textContent = verdict;
      tile('wk-visits', d.visits); tile('wk-a', d.a); tile('wk-b', d.b);
    }

    function open() {
      lastFocus = document.activeElement;
      box.hidden = false;
      document.documentElement.classList.add('stats-open');
      $$('.duel-bar i, .fn-bar i', box).forEach(function (i) { i.style.width = '0'; });
      requestAnimationFrame(function () { box.classList.add('in'); $('#stats-x').focus({ preventScroll: true }); });
      load().then(function (d) { if (!box.hidden) render(d); });
    }
    function close() {
      box.classList.remove('in');
      document.documentElement.classList.remove('stats-open');
      setTimeout(function () { box.hidden = true; }, reduce ? 0 : 300);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    btn.addEventListener('click', open);
    btn.addEventListener('pointerenter', load);
    btn.addEventListener('focus', load);
    $('#stats-x').addEventListener('click', close);
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'Tab') { e.preventDefault(); $('#stats-x').focus(); }   // the close button is the only stop
    });
    setTimeout(load, 3000);   // warm up in the background
  })();

  // Scale the dashboard preview so it renders at desktop width inside the frame
  var view = $('#frame-view'), shot = view && $('iframe', view);
  function fitFrame() {
    if (!shot || !view.clientWidth) return;
    var s = view.clientWidth / 1200;
    shot.style.transform = 'scale(' + s + ')';
    shot.style.height = (view.clientHeight / s) + 'px';
  }
  if (shot) {
    fitFrame();
    if ('ResizeObserver' in window) new ResizeObserver(fitFrame).observe(view);
    else window.addEventListener('resize', fitFrame);
  }
})();
