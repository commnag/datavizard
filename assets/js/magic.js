// Cursor effect: footprints.
//
// Footprints: the pointer leaves small prints that alternate left and right and point the way it is
// heading. They spread in like ink being written, rest a moment, and ease away, with only a short
// trail (about 7) visible at once; the oldest fades out gently when a new one lands. Soft sepia on the
// light theme, soft gold on the dark one.
//
// The prints belong to the page: when the page scrolls they scroll away with the content they were left
// on, and the next movement starts a fresh trail from wherever the pointer now is.
//
// Mouse only, and nothing runs while there are no prints. Reduced motion switches it off.
(function () {
  'use strict';

  var cv = document.getElementById('trail');
  if (!cv) return;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !fine) { cv.remove(); return; }

  var ctx = cv.getContext('2d');
  var STRIDE = 52, SIDE = 6.5, MAX_PRINTS = 7;       // px between prints (a calm stroll), sideways offset, prints kept at once
  var PRINT_IN = 700, PRINT_HOLD = 500, PRINT_OUT = 1700, RETIRE = 280;   // ms: ease in, rest, ease out; gentle exit of the oldest
  var w = 0, h = 0, dpr = 1;
  var dark = false, themeTick = 0, running = false;
  var prints = [], steps = 0;
  var lastX = null, lastY = null, acc = 0, side = 1, hx = 1, hy = 0;

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = window.innerWidth; h = window.innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function readTheme() {
    var m = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || [255, 255, 255];
    dark = (+m[0] + +m[1] + +m[2]) / 3 < 128;
  }

  // x, y are where the pointer is on screen; prints are stored in page coordinates so they stay on the page
  function place(x, y, now) {
    var ang = Math.atan2(hy, hx);
    // set to the side of the line of travel, left then right
    var ox = -Math.sin(ang) * SIDE * side, oy = Math.cos(ang) * SIDE * side;
    prints.push({ x: x + ox + window.scrollX, y: y + oy + window.scrollY, a: ang, s: side, t: now, die: 0 });
    // keep the trail short: past the limit, the oldest print starts a gentle exit instead of vanishing
    var active = 0; for (var i = 0; i < prints.length; i++) if (!prints[i].die) active++;
    for (i = 0; active > MAX_PRINTS && i < prints.length; i++) if (!prints[i].die) { prints[i].die = now; active--; }
    while (prints.length > MAX_PRINTS + 6) prints.shift();           // only reached by a wild sweep; keeps the list small
    side = -side; steps++;
  }

  function ease(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }   // smoothstep: gentle start and finish

  function drawPrint(p, now, sx, sy) {
    var age = now - p.t;
    var rise = ease(age / PRINT_IN);
    var a = rise * (1 - ease((age - PRINT_IN - PRINT_HOLD) / PRINT_OUT));
    if (p.die) a *= 1 - ease((now - p.die) / RETIRE);
    if (a <= 0.002) return;
    a *= dark ? 0.46 : 0.40;
    ctx.save();
    ctx.translate(p.x - sx, p.y - sy);
    var grow = 0.88 + 0.12 * rise; ctx.scale(grow, grow);              // spreads in a little, like ink soaking
    ctx.rotate(p.a + Math.PI / 2 + p.s * 0.07);          // toes point the way the pointer is heading, a touch turned out
    var col = dark ? '238,206,130' : '96,70,40';
    ctx.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
    if (dark) { ctx.shadowColor = 'rgba(238,206,130,' + (a * 0.9).toFixed(3) + ')'; ctx.shadowBlur = 6; }
    ctx.beginPath(); ctx.ellipse(0.5 * p.s, -3.4, 3.5, 6.3, 0.1 * p.s, 0, 6.2832); ctx.fill();   // the ball and toes
    ctx.beginPath(); ctx.ellipse(0, 6.3, 2.6, 3.1, 0, 0, 6.2832); ctx.fill();                      // the heel
    ctx.restore();
  }

  function frame(now) {
    prints = prints.filter(function (p) { return now - p.t <= PRINT_IN + PRINT_HOLD + PRINT_OUT && !(p.die && now - p.die > RETIRE); });
    ctx.clearRect(0, 0, w, h);
    cv.dataset.prints = prints.length; cv.dataset.steps = steps;   // read by the tests
    if (!prints.length) { running = false; return; }                // nothing left to draw: stop until the next step
    if (++themeTick % 30 === 1) readTheme();
    var sx = window.scrollX, sy = window.scrollY;
    for (var k = 0; k < prints.length; k++) drawPrint(prints[k], now, sx, sy);
    requestAnimationFrame(frame);
  }
  function wake() { if (!running) { running = true; readTheme(); requestAnimationFrame(frame); } }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    var x = e.clientX, y = e.clientY;
    if (lastX === null) { lastX = x; lastY = y; return; }
    var dx = x - lastX, dy = y - lastY, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return;
    var ux = dx / d, uy = dy / d;
    hx = hx * 0.78 + ux * 0.22; hy = hy * 0.78 + uy * 0.22;        // steady the heading so prints turn smoothly, not jitter
    var hl = Math.sqrt(hx * hx + hy * hy) || 1; hx /= hl; hy /= hl;
    var now = performance.now(), pos = STRIDE - acc, placed = false;
    while (pos <= d) { place(lastX + ux * pos, lastY + uy * pos, now); pos += STRIDE; placed = true; }
    acc = d - (pos - STRIDE);
    lastX = x; lastY = y;
    if (placed) wake();
  }, { passive: true });

  // Scrolling ends the walk: the prints stay on the page, and the next movement begins a new trail
  window.addEventListener('scroll', function () { lastX = null; lastY = null; acc = 0; }, { passive: true });

  var rt;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(size, 150); });
  size();
  cv.dataset.prints = 0; cv.dataset.steps = 0;   // read by the tests
})();
