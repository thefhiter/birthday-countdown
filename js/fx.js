/* =========================================================
   fx.js — confetti and fireworks on one canvas.
   Drawn for a light page: solid saturated colours composited
   normally, never the additive blending a dark page wants
   (on white, "lighter" only ever washes out to white).
   ========================================================= */
(function (global) {
  'use strict';

  var canvas = null, ctx = null;
  var W = 0, H = 0, dpr = 1;
  var running = false, motion = true;
  var hue = 262;

  var particles = [];
  var rockets = [];
  var MAX = 700;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function init() {
    canvas = document.getElementById('fx');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    global.addEventListener('resize', resize, { passive: true });
    start();
  }

  function resize() {
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    W = global.innerWidth;
    H = global.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setHue(h) { hue = h; }

  function setMotion(on) {
    motion = !!on;
    if (!motion) {
      particles.length = 0;
      rockets.length = 0;
      if (ctx) ctx.clearRect(0, 0, W, H);
    }
  }

  function add(p) {
    if (particles.length >= MAX) particles.shift();
    particles.push(p);
  }

  /* Mid-tone lightness keeps every piece visible against white. */
  function colour(spread) {
    return 'hsl(' + (hue + rand(-(spread || 90), spread || 90)) + ' 78% 58%)';
  }

  function confettiPiece(x, y, power) {
    var a = rand(0, Math.PI * 2);
    var s = rand(3, 9) * (power || 1);
    return {
      kind: 'confetti',
      x: x, y: y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s - rand(2, 6),
      w: rand(5, 11), h: rand(7, 14),
      rot: rand(0, Math.PI * 2), vr: rand(-.3, .3),
      fill: colour(110), life: 1, decay: rand(.004, .01), wob: rand(0, Math.PI * 2)
    };
  }

  function confetti(opts) {
    if (!motion) return;
    var o = opts || {};
    var x = o.x == null ? W / 2 : o.x;
    var y = o.y == null ? H * 0.35 : o.y;
    var n = o.count == null ? 120 : o.count;
    for (var i = 0; i < n; i++) add(confettiPiece(x, y, o.power || 1));
    if (global.BD.audio && !o.silent) global.BD.audio.play('confetti');
  }

  function firework(opts) {
    if (!motion) return;
    var o = opts || {};
    rockets.push({
      x: o.x == null ? rand(W * .18, W * .82) : o.x,
      y: H + 10,
      targetY: o.targetY == null ? rand(H * .15, H * .45) : o.targetY,
      vy: rand(-13, -9.5),
      fill: colour(120),
      trail: []
    });
    if (global.BD.audio && !o.silent) global.BD.audio.play('launch');
  }

  function show(ms) {
    if (!motion) return;
    var until = Date.now() + (ms || 5000);
    (function loop() {
      if (Date.now() > until) return;
      firework();
      global.setTimeout(loop, rand(300, 750));
    })();
  }

  function sparkleAt(x, y, n) {
    if (!motion) return;
    for (var i = 0; i < (n || 12); i++) {
      var a = rand(0, Math.PI * 2), s = rand(1, 5);
      add({
        kind: 'spark', x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: rand(1.5, 3.4), fill: colour(70),
        life: 1, decay: rand(.012, .03)
      });
    }
  }

  function explode(x, y, fill) {
    var n = 60 + ((Math.random() * 40) | 0);
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n + rand(-.05, .05);
      var s = rand(2, 8);
      add({
        kind: 'spark', x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: rand(1.4, 3), fill: fill,
        life: 1, decay: rand(.008, .018)
      });
    }
    for (var j = 0; j < 14; j++) add(confettiPiece(x, y, .7));
    if (global.BD.audio) {
      global.BD.audio.play('boom', (x / W) * 2 - 1);
      global.BD.audio.play('sparkle');
    }
  }

  function stepRockets() {
    for (var i = rockets.length - 1; i >= 0; i--) {
      var r = rockets[i];
      r.trail.push({ x: r.x, y: r.y });
      if (r.trail.length > 8) r.trail.shift();
      r.y += r.vy;
      r.vy += .14;

      for (var t = 0; t < r.trail.length; t++) {
        var pt = r.trail[t];
        ctx.globalAlpha = (t / r.trail.length) * .55;
        ctx.fillStyle = r.fill;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.2 * (t / r.trail.length) + .5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (r.y <= r.targetY || r.vy >= 0) {
        explode(r.x, r.y, r.fill);
        rockets.splice(i, 1);
      }
    }
  }

  function stepParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }

      if (p.kind === 'confetti') {
        p.vy += .18;
        p.vx *= .992;
        p.wob += .14;
        p.x += p.vx + Math.sin(p.wob) * .9;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > H + 40) { particles.splice(i, 1); continue; }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillStyle = p.fill;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.wob)) + 1);
        ctx.restore();
      } else {
        p.vy += .05;
        p.vx *= .975;
        p.vy *= .975;
        p.x += p.vx;
        p.y += p.vy;

        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.fill;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life + .3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame() {
    if (!running) return;
    if (motion) {
      ctx.clearRect(0, 0, W, H);
      stepRockets();
      stepParticles();
    }
    global.requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    global.requestAnimationFrame(frame);
  }

  global.BD = global.BD || {};
  global.BD.fx = {
    init: init, setHue: setHue, setMotion: setMotion,
    confetti: confetti, firework: firework, show: show, sparkleAt: sparkleAt
  };
})(window);
