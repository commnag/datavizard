(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  $('#year').textContent = new Date().getFullYear();

  // Theme toggle (persisted per browser)
  $('#theme').addEventListener('click', function () {
    var current = root.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
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

  // Skill mix: a segmented bar per role, sized by how many of its tags fall in each family
  var FAMILIES = [['k-stat', 'Statistics'], ['k-data', 'Data engineering'], ['k-viz', 'Visualization and reporting'], ['k-ai', 'AI and automation']];
  $$('[data-mix]').forEach(function (box) {
    var stop = box.closest('.stop'), bars = '', total = 0;
    FAMILIES.forEach(function (f) {
      var n = $$('.tags b.' + f[0], stop).length;
      if (!n) return;
      total += n;
      bars += '<i class="' + f[0] + '" style="flex:' + n + '" title="' + f[1] + ': ' + n + '"></i>';
    });
    if (total) box.innerHTML = '<p class="mix-cap">Skill mix</p><div class="mix-bar">' + bars + '</div>';
  });

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

  // Cursor glow: a soft pastel glow follows the pointer with a short fading trail.
  // It takes the colour of the skill family under the pointer (chips, highlighted
  // phrases) and otherwise the tint of the current plate. Mouse only; skipped for
  // touch / reduced motion.
  (function () {
    var cv = $('#trail');
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!cv || reduce || !fine) { if (cv) cv.remove(); return; }

    var ctx = cv.getContext('2d');
    var RADIUS = 120, LIFE = 320, MAX_SAMPLES = 6;
    var PLATE_TINT = { top: '--sky', experience: '--lilac', toolkit: '--sky', work: '--mint' };
    var w = 0, h = 0, dpr = 1;
    var target = null, hoverEl = null, head = { x: 0, y: 0, s: 0 };
    var rgb = [214, 230, 245], rgbGoal = rgb.slice();
    var samples = [], running = false, lastMove = 0, lastKeep = null, tick = 0;

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Any CSS colour string -> [r, g, b], via the canvas's own colour parser
    function parse(str) {
      ctx.fillStyle = '#000'; ctx.fillStyle = str;
      var v = ctx.fillStyle;
      if (v.charAt(0) === '#') return [parseInt(v.substr(1, 2), 16), parseInt(v.substr(3, 2), 16), parseInt(v.substr(5, 2), 16)];
      var m = v.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]];
    }

    function goalFor(el) {
      var cs = el && getComputedStyle(el), fam = cs && cs.getPropertyValue('--fam').trim();
      if (fam && fam !== 'transparent') return parse(fam);
      var plate = el && el.closest && el.closest('section');
      var tint = (plate && PLATE_TINT[plate.id]) || '--sky';
      return parse(getComputedStyle(root).getPropertyValue(tint).trim());
    }

    function blob(x, y, r, a, c) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')');
      g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    function frame(now) {
      // Ease the pointer and the colour
      head.x += (target.x - head.x) * 0.24;
      head.y += (target.y - head.y) * 0.24;
      head.s = now - lastMove < 160 ? head.s + (1 - head.s) * 0.14 : head.s * 0.9;
      if (++tick % 4 === 0) rgbGoal = goalFor(hoverEl);
      for (var k = 0; k < 3; k++) rgb[k] += (rgbGoal[k] - rgb[k]) * 0.08;
      var c = [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])];

      if (!lastKeep || Math.pow(head.x - lastKeep.x, 2) + Math.pow(head.y - lastKeep.y, 2) > 196) {
        lastKeep = { x: head.x, y: head.y };
        samples.push({ x: head.x, y: head.y, t: now, c: c });
        if (samples.length > MAX_SAMPLES) samples.shift();
      }
      while (samples.length && now - samples[0].t > LIFE) samples.shift();

      ctx.clearRect(0, 0, w, h);
      if (!samples.length && head.s < 0.01) { running = false; return; }

      for (var i = 0; i < samples.length; i++) {
        var sm = samples[i], life = 1 - (now - sm.t) / LIFE;
        blob(sm.x, sm.y, RADIUS * (0.5 + 0.4 * life), 0.14 * life * life, sm.c);
      }
      blob(head.x, head.y, RADIUS, 0.85 * head.s, c);
      requestAnimationFrame(frame);
    }

    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      target = { x: e.clientX, y: e.clientY };
      hoverEl = e.target;
      lastMove = performance.now();
      if (!running) {
        head.x = target.x; head.y = target.y; lastKeep = null;
        rgb = goalFor(hoverEl); rgbGoal = rgb.slice();
        running = true; requestAnimationFrame(frame);
      }
    }, { passive: true });

    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(size, 150); });
    size();
  })();
})();
