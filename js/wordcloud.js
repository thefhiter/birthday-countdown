/* =========================================================
   wordcloud.js — spiral-packed word cloud.
   Words are sized by how many people sent them and placed
   biggest-first along a spiral, skipping any position that
   collides with a word already down.
   ========================================================= */
(function (global) {
  'use strict';

  /* Fixed hues rather than the theme accent: the point of a cloud is that
     neighbouring words are easy to tell apart. The lightness of each one is
     solved against whichever panel it is about to be drawn on, so the same
     eight colours clear 4.5:1 on a white card and on a near-black one.

     Colour carries no meaning here — size is the count, and the whole cloud is
     mirrored as a list — so this is legibility only, never information. */
  var surfaceLum = 1;
  var PALETTE = global.BD.color.cloudPalette(surfaceLum);

  function setSurface(lum) {
    if (typeof lum !== 'number' || lum === surfaceLum) return;
    surfaceLum = lum;
    PALETTE = global.BD.color.cloudPalette(surfaceLum);
  }

  var PAD = 7;            // gap kept between words, in px
  var MAX_STEPS = 1600;   // spiral samples before giving the word a smaller size
  var SHRINKS = 4;        // how many times a word may shrink before being dropped

  /** Stable per-word colour, so a word keeps its colour between renders. */
  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function overlaps(placed, r) {
    for (var i = 0; i < placed.length; i++) {
      var p = placed[i];
      if (r.x < p.x + p.w + PAD && r.x + r.w + PAD > p.x &&
          r.y < p.y + p.h + PAD && r.y + r.h + PAD > p.y) return true;
    }
    return false;
  }

  /**
   * Walk outward along a spiral until the word fits inside the box without
   * touching anything already placed. Returns the rect, or null if it never fit.
   */
  function place(el, size, W, H, placed, squash) {
    for (var attempt = 0; attempt <= SHRINKS; attempt++) {
      var fontSize = size * Math.pow(0.82, attempt);
      el.style.fontSize = fontSize.toFixed(1) + 'px';

      var w = el.offsetWidth;
      var h = el.offsetHeight;
      if (w > W - 4 || h > H - 4) continue;

      var angle = hash(el.textContent) % 628 / 100;  // vary the start so clouds differ
      var radius = 0;
      for (var step = 0; step < MAX_STEPS; step++) {
        // the spiral is squashed to the panel's own shape, so a tall phone
        // panel grows a tall cluster instead of a wide strip in a lot of blank
        var x = W / 2 + radius * Math.cos(angle) - w / 2;
        var y = H / 2 + radius * Math.sin(angle) * squash - h / 2;
        var rect = { x: x, y: y, w: w, h: h };

        if (x >= 2 && y >= 2 && x + w <= W - 2 && y + h <= H - 2 && !overlaps(placed, rect)) {
          el.style.left = Math.round(x) + 'px';
          el.style.top = Math.round(y) + 'px';
          placed.push(rect);
          return rect;
        }
        angle += 0.3;
        radius += 0.55;
      }
    }
    return null;
  }

  /**
   * words: [{ text, count }] — render them into `container`.
   * Returns the number actually placed.
   */
  function render(container, words, opts) {
    if (!container) return 0;
    opts = opts || {};
    container.innerHTML = '';
    if (!words || !words.length) return 0;

    var W = container.clientWidth;
    var H = container.clientHeight;
    if (W < 40 || H < 40) return 0;

    /* Words are placed onto a stage rather than the container, so the finished
       cluster can be scaled and centred as one piece. A spiral packs tightly by
       nature, which with few words leaves most of the panel empty. */
    var stage = document.createElement('div');
    stage.className = 'cloud__stage';
    container.appendChild(stage);

    var counts = words.map(function (w) { return w.count; });
    var max = Math.max.apply(null, counts);
    var min = Math.min.apply(null, counts);

    // headline size tracks the panel so the cloud scales with the viewport
    var base = Math.max(22, Math.min(68, W / 12));
    var squash = Math.max(0.35, Math.min(1.5, (H / W) * 0.95));
    var placed = [];
    var shown = 0;

    // biggest first, so the popular words win the middle
    var sorted = words.slice().sort(function (a, b) {
      return b.count - a.count || a.text.localeCompare(b.text);
    });

    sorted.forEach(function (word, i) {
      var weight = max === min ? 0.5 : (word.count - min) / (max - min);
      var size = base * (0.40 + 0.60 * weight);

      var el = document.createElement('span');
      el.className = 'cloud__word';
      el.textContent = word.text;
      el.style.color = PALETTE[hash(word.text) % PALETTE.length];
      el.style.setProperty('--i', i);
      el.title = word.count === 1 ? '1 person said this' : word.count + ' people said this';
      if (opts.newest && word.text.toLowerCase() === String(opts.newest).toLowerCase()) {
        el.classList.add('is-newest');
      }
      stage.appendChild(el);

      if (place(el, size, W, H, placed, squash)) shown++;
      else el.remove();
    });

    fit(stage, placed, W, H);
    return shown;
  }

  /** Scale and centre the packed cluster so it fills the panel. */
  function fit(stage, placed, W, H) {
    if (!placed.length) return;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    placed.forEach(function (r) {
      if (r.x < minX) minX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.x + r.w > maxX) maxX = r.x + r.w;
      if (r.y + r.h > maxY) maxY = r.y + r.h;
    });

    var boxW = maxX - minX;
    var boxH = maxY - minY;
    if (boxW <= 0 || boxH <= 0) return;

    // 0.94 keeps a little breathing room; the cap stops one lonely word
    // from being blown up to fill the whole panel
    var scale = Math.min((W * 0.94) / boxW, (H * 0.94) / boxH);
    scale = Math.max(0.6, Math.min(2.2, scale));

    var tx = W / 2 - scale * (minX + boxW / 2);
    var ty = H / 2 - scale * (minY + boxH / 2);
    stage.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')';
  }

  /** Roll a list of raw words up into {text, count}, case-insensitively. */
  function tally(rawWords) {
    var map = {};
    var order = [];
    (rawWords || []).forEach(function (raw) {
      var word = String(raw || '').trim();
      if (!word) return;
      var key = word.toLowerCase();
      if (!map[key]) { map[key] = { text: word, count: 0 }; order.push(key); }
      map[key].count++;
    });
    return order.map(function (k) { return map[k]; });
  }

  /** First word only, letters/digits/apostrophes/hyphens, capped. */
  function normalize(raw) {
    var first = String(raw || '').trim().split(/\s+/)[0] || '';
    var cleaned;
    try {
      cleaned = first.replace(/[^\p{L}\p{N}'’-]/gu, '');
    } catch (err) {
      cleaned = first.replace(/[^A-Za-z0-9À-ÿ'’-]/g, '');
    }
    return cleaned.slice(0, 18);
  }

  global.BD = global.BD || {};
  global.BD.wordcloud = {
    render: render,
    tally: tally,
    normalize: normalize,
    setSurface: setSurface,
    palette: function () { return PALETTE; }
  };
})(window);
