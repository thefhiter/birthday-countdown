/* =========================================================
   color.js — contrast-safe colour.

   The accent hue is derived from a name, so it can land anywhere
   on the wheel. A fixed HSL lightness cannot survive that: at
   L=52% a blue sits at ~7:1 against white and a yellow at ~1.8:1,
   so half the names would end up with a hero name, a focus ring
   and a button nobody can read.

   So nothing here hardcodes a lightness. Every colour states the
   ratio it needs against the surface it will sit on, and the
   lightness is solved for numerically — the most vivid one that
   still clears the bar. Same call works for any hue, either theme.
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------- sRGB maths (WCAG 2.x relative luminance) ---------- */

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2;
    var r = 0, g = 0, b = 0;
    if (h < 60)       { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  function toLinear(v) {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  /** Relative luminance of an [r,g,b] triple, 0–1. */
  function luminance(rgb) {
    return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
  }

  function lumOf(h, s, l) { return luminance(hslToRgb(h, s, l)); }

  /** WCAG contrast ratio between two luminances, 1–21. */
  function ratio(a, b) {
    var hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }

  function contrastHsl(h, s, l, bgLum) { return ratio(lumOf(h, s, l), bgLum); }

  /** The ratio a colour manages against the hardest of several backgrounds. */
  function worstOf(h, s, l, bgLums) {
    var lum = lumOf(h, s, l), worst = Infinity;
    for (var i = 0; i < bgLums.length; i++) worst = Math.min(worst, ratio(lum, bgLums[i]));
    return worst;
  }

  /**
   * The most vivid lightness for `hue` that still clears `target` against a
   * background of luminance `bgLum`.
   *
   * "Most vivid" = the passing lightness closest to the background's own, i.e.
   * the smallest ratio that is still >= target. Works in both directions, so
   * the same call picks a deep colour on a white panel and a bright one on a
   * dark panel without the caller knowing which theme is on.
   */
  function solveLightness(hue, sat, bgLum, target) {
    return solveAgainstAll(hue, sat, [bgLum], target);
  }

  /**
   * Same, but the colour has to clear `target` against *every* background in
   * the list. A word that sits on a panel and on the accent wash behind it has
   * two backgrounds, and which of them is the hard one flips between themes —
   * so both are solved for rather than guessing which one wins.
   */
  function solveAgainstAll(hue, sat, bgLums, target) {
    var bestL = null, bestWorst = Infinity;
    for (var l = 0; l <= 100; l += 0.5) {
      var worst = Infinity;
      for (var i = 0; i < bgLums.length; i++) {
        var r = contrastHsl(hue, sat, l, bgLums[i]);
        if (r < worst) worst = r;
      }
      if (worst >= target && worst < bestWorst) { bestWorst = worst; bestL = l; }
    }
    // No lightness at this saturation can clear the target against everything
    // (rare, and only for extreme targets) — fall back to the far end of the
    // ramp furthest from the hardest background.
    if (bestL === null) bestL = Math.max.apply(null, bgLums) > 0.5 ? 0 : 100;
    return bestL;
  }

  /**
   * A fill that wants to look like `preferredL` but must stay legible under
   * text of luminance `textLum`. Returns the passing lightness nearest the one
   * asked for, so the tint only moves as far as it has to.
   */
  function fillLightness(hue, sat, preferredL, textLum, target) {
    var bestL = null, bestGap = Infinity;
    for (var l = 0; l <= 100; l += 0.5) {
      if (ratio(lumOf(hue, sat, l), textLum) < target) continue;
      var gap = Math.abs(l - preferredL);
      if (gap < bestGap) { bestGap = gap; bestL = l; }
    }
    return bestL === null ? (textLum > 0.5 ? 0 : 100) : bestL;
  }

  function hsl(h, s, l) {
    return 'hsl(' + Math.round(h) + ' ' + Math.round(s) + '% ' + (Math.round(l * 10) / 10) + '%)';
  }

  /* ---------- the ratios we hold ourselves to ---------- */

  var AA_TEXT = 4.6;   // 1.4.3 Contrast (Minimum), with a little headroom
  var AA_UI   = 3.2;   // 1.4.11 Non-text Contrast, same
  var AA_BIG  = 3.2;   // large text (>=24px, or >=18.66px bold)

  /**
   * Every accent token for one hue.
   *
   *   surfaceLum  luminance of the panel the accent sits on
   *   mutedLum    luminance of --ink-mute, the faintest text the page uses;
   *               the accent wash has to keep even that legible
   *   isDark      which way the theme leans, so the wash tints the right way
   */
  function accentTokens(hue, opts) {
    var surfaceLum = opts.surfaceLum;
    var bgLum = typeof opts.bgLum === 'number' ? opts.bgLum : surfaceLum;
    var mutedLum = opts.mutedLum;
    var isDark = !!opts.isDark;
    var sat = 74;

    // The soft wash is solved first, because the accent text has to survive on
    // it as well as on the panel. It aims for a barely-there tint and is only
    // pushed further if --ink-mute would stop clearing 4.5:1 on top of it.
    var softSat = isDark ? 30 : 88;
    var softL = fillLightness(hue, softSat, isDark ? 22 : 95, mutedLum, AA_TEXT);
    var softLum = lumOf(hue, softSat, softL);

    /* Three backgrounds, all mandatory: the panel, the page, and the wash of
       accent that the page fades through. The wash fades to an alpha-zero copy
       of itself rather than to `transparent`, so every pixel in between is a
       blend of the page and the wash — which means its luminance is bounded by
       theirs, and solving against the three endpoints covers the gradient too.
       (Fading to the `transparent` keyword instead fades towards transparent
       *black*, and the darkened band in the middle belongs to no ground here.) */
    var grounds = [surfaceLum, bgLum, softLum];

    /* Accent proper: borders, rings, the cake, and the fill behind button
       labels. Two constraints, not one — 3:1 against what it sits on, and
       enough room for a label at 4.5:1. There are mid-tones (a blue-violet
       around hue 253 in the dark theme, say) where white and black both land
       near 4.3:1, and solving for the border alone walks straight into them. */
    var whiteLum = 1;
    var blackLum = lumOf(hue, 30, 10);
    var accentL = null, accentBest = Infinity;
    for (var al = 0; al <= 100; al += 0.5) {
      var alum = lumOf(hue, sat, al);
      var vsGround = Infinity;
      for (var gi = 0; gi < grounds.length; gi++) {
        vsGround = Math.min(vsGround, ratio(alum, grounds[gi]));
      }
      if (vsGround < AA_UI) continue;
      if (Math.max(ratio(whiteLum, alum), ratio(blackLum, alum)) < AA_TEXT) continue;
      if (vsGround < accentBest) { accentBest = vsGround; accentL = al; }
    }
    if (accentL === null) accentL = solveAgainstAll(hue, sat, grounds, AA_UI);
    var accentLum = lumOf(hue, sat, accentL);

    // Accent as body text. 4.5:1.
    var textL = solveAgainstAll(hue, sat, grounds, AA_TEXT);

    // Accent as large display text (the hero name). 3:1 is enough there, and
    // letting it stay vivid is the whole point of a per-person colour.
    var bigL = solveAgainstAll(hue, sat, grounds, AA_BIG);

    // Whatever sits on top of a solid accent fill — white or near-black,
    // whichever actually passes. Yellow takes black; navy takes white.
    var onAccent = ratio(whiteLum, accentLum) >= ratio(blackLum, accentLum)
      ? '#ffffff'
      : hsl(hue, 30, 10);

    return {
      hue: hue,
      accent: hsl(hue, sat, accentL),
      accentText: hsl(hue, sat, textL),
      accentDisplay: hsl(hue, sat, bigL),
      accentSoft: hsl(hue, softSat, softL),
      // the same wash at zero alpha, for gradients to fade out through
      accentSoftFade: 'hsl(' + Math.round(hue) + ' ' + softSat + '% ' + softL + '% / 0)',
      onAccent: onAccent,
      // exposed so callers (and the audit) can assert instead of trust
      ratios: {
        accent: worstOf(hue, sat, accentL, grounds),
        accentOnSoft: contrastHsl(hue, sat, accentL, softLum),
        accentText: worstOf(hue, sat, textL, grounds),
        accentTextOnSoft: contrastHsl(hue, sat, textL, softLum),
        accentDisplay: worstOf(hue, sat, bigL, grounds),
        onAccent: ratio(onAccent === '#ffffff' ? whiteLum : blackLum, accentLum),
        mutedOnSoft: ratio(mutedLum, softLum)
      }
    };
  }

  /**
   * A word-cloud palette for one surface. Fixed hues so neighbouring words stay
   * tellable apart, solved lightness so every one of them clears 4.5:1 — on a
   * white panel and on a near-black one alike.
   *
   * Colour carries no meaning in the cloud (size does, and the whole cloud is
   * mirrored as text), so this is legibility only, not information.
   */
  var CLOUD_HUES = [340, 158, 222, 24, 272, 196, 45, 250];

  function cloudPalette(surfaceLum) {
    return CLOUD_HUES.map(function (h) {
      var sat = h === 250 ? 26 : 72;
      return hsl(h, sat, solveLightness(h, sat, surfaceLum, AA_TEXT));
    });
  }

  /**
   * Luminance of whatever a custom property holds. Custom properties come back
   * from getComputedStyle as the text that was written, not as a resolved
   * colour, so all three spellings used in the stylesheet have to be read here.
   */
  function lumOfCss(value) {
    var str = String(value || '').trim();

    var hslMatch = /hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(str);
    if (hslMatch) return lumOf(+hslMatch[1], +hslMatch[2], +hslMatch[3]);

    var rgbMatch = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(str);
    if (rgbMatch) return luminance([+rgbMatch[1], +rgbMatch[2], +rgbMatch[3]]);

    var hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
    if (hex) {
      var h = hex[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return luminance([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    }

    return null;   // unreadable — callers fall back rather than guess
  }

  global.BD = global.BD || {};
  global.BD.color = {
    hslToRgb: hslToRgb,
    luminance: luminance,
    lumOf: lumOf,
    lumOfCss: lumOfCss,
    ratio: ratio,
    contrastHsl: contrastHsl,
    solveLightness: solveLightness,
    solveAgainstAll: solveAgainstAll,
    fillLightness: fillLightness,
    accentTokens: accentTokens,
    cloudPalette: cloudPalette,
    CLOUD_HUES: CLOUD_HUES,
    AA_TEXT: AA_TEXT,
    AA_UI: AA_UI
  };

  if (typeof module === 'object' && module.exports) module.exports = global.BD.color;
})(typeof window !== 'undefined' ? window : globalThis);
