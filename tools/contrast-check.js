#!/usr/bin/env node
/**
 * Re-checks every colour decision in the site against WCAG 2.2 AA.
 *
 *   node tools/contrast-check.js
 *
 * It reads the tokens straight out of css/styles.css rather than keeping its
 * own copy, so the check cannot quietly agree with a stale duplicate. Then it
 * runs the generated colour — all 360 accent hues, both themes, plus the word
 * cloud palette — through js/color.js.
 *
 * Exits non-zero on the first failing set, so it can gate a commit.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const color = require(path.join(root, 'js', 'color.js'));

/* ---------- read the tokens out of the stylesheet ---------- */

const css = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

function block(selector) {
  const at = css.indexOf(selector + ' {');
  if (at === -1) throw new Error('no `' + selector + '` block in css/styles.css');
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function tokens(selector) {
  const out = {};
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  const body = block(selector);
  while ((m = re.exec(body)) !== null) out[m[1]] = m[2].trim();
  return out;
}

const THEMES = [
  { name: 'light', vars: tokens(':root'), dark: false },
  { name: 'dark',  vars: tokens(':root[data-theme="dark"]'), dark: true }
];

/** Luminance of a token value — `hsl(H S% L%)` or `#rrggbb`. */
function lum(value) {
  const hslMatch = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/.exec(value);
  if (hslMatch) return color.lumOf(+hslMatch[1], +hslMatch[2], +hslMatch[3]);

  const hexMatch = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hexMatch) {
    const n = parseInt(hexMatch[1], 16);
    return color.luminance([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }
  throw new Error('cannot read colour: ' + value);
}

/* ---------- what has to hold, and why ---------- */

const RULES = [
  ['--ink',          '--surface',   4.5, 'body text on panels'],
  ['--ink',          '--bg',        4.5, 'body text on the page'],
  ['--ink',          '--surface-2', 4.5, 'text on chips and the toast button'],
  ['--ink-dim',      '--surface',   4.5, 'hero meta, wish text, hints'],
  ['--ink-dim',      '--bg',        4.5, 'hero meta on the page'],
  ['--ink-dim',      '--surface-2', 4.5, 'the word-count badge'],
  ['--ink-mute',     '--surface',   4.5, 'field labels, help text, timestamps'],
  ['--ink-mute',     '--bg',        4.5, 'the eyebrow and the footer'],
  ['--ink-mute',     '--surface-2', 4.5, 'placeholder text in fields'],
  ['--line-strong',  '--surface',   3.0, 'input and button borders (SC 1.4.11)'],
  ['--line-strong',  '--bg',        3.0, 'control borders against the page'],
  ['--danger',       '--surface',   4.5, 'form error messages'],
  ['--ink',          '--surface',   3.0, 'the focus ring against panels'],
  ['--ink',          '--bg',        3.0, 'the focus ring against the page']
];

let failures = 0;
const lines = [];

function check(label, got, min, note) {
  const ok = got >= min - 0.005;
  if (!ok) failures++;
  lines.push(
    (ok ? '  ok   ' : '  FAIL ') +
    got.toFixed(2).padStart(6) + ':1  (min ' + min.toFixed(1) + ')  ' +
    label + (note ? '  — ' + note : '')
  );
}

/* ---------- the static tokens ---------- */

for (const theme of THEMES) {
  lines.push('\n' + theme.name + ' theme — tokens');
  for (const [fg, bg, min, note] of RULES) {
    if (!theme.vars[fg]) throw new Error('missing token ' + fg + ' in ' + theme.name);
    if (!theme.vars[bg]) throw new Error('missing token ' + bg + ' in ' + theme.name);
    check(fg + ' on ' + bg, color.ratio(lum(theme.vars[fg]), lum(theme.vars[bg])), min, note);
  }
}

/* ---------- the generated accent, for every name anyone could type ---------- */

for (const theme of THEMES) {
  const surfaceLum = lum(theme.vars['--surface']);
  const bgLum = lum(theme.vars['--bg']);
  const mutedLum = lum(theme.vars['--ink-mute']);
  const worst = {};

  for (let hue = 0; hue < 360; hue++) {
    const t = color.accentTokens(hue, { surfaceLum, bgLum, mutedLum, isDark: theme.dark });
    const softLum = lum(t.accentSoft);

    const measured = {
      'accent vs every ground (SC 1.4.11)':   t.ratios.accent,
      'accent vs its own soft fill':          t.ratios.accentOnSoft,
      'accent text vs every ground':          t.ratios.accentText,
      'accent text vs its own soft fill':     t.ratios.accentTextOnSoft,
      'hero name vs every ground (large)':    t.ratios.accentDisplay,
      'button label vs accent fill':          t.ratios.onAccent,
      'ink on the accent wash':               color.ratio(lum(theme.vars['--ink']), softLum),
      'muted text on the accent wash':        color.ratio(lum(theme.vars['--ink-mute']), softLum)
    };

    for (const key of Object.keys(measured)) {
      if (worst[key] === undefined || measured[key] < worst[key].value) {
        worst[key] = { value: measured[key], hue: hue };
      }
    }
  }

  lines.push('\n' + theme.name + ' theme — accent, worst of all 360 hues');
  const MINS = {
    'accent vs every ground (SC 1.4.11)': 3.0,
    'accent vs its own soft fill': 3.0,
    'accent text vs every ground': 4.5,
    'accent text vs its own soft fill': 4.5,
    'hero name vs every ground (large)': 3.0,
    'button label vs accent fill': 4.5,
    'ink on the accent wash': 4.5,
    'muted text on the accent wash': 4.5
  };
  for (const key of Object.keys(worst)) {
    check(key, worst[key].value, MINS[key], 'worst at hue ' + worst[key].hue);
  }
}

/* ---------- the word cloud ---------- */

for (const theme of THEMES) {
  const surfaceLum = lum(theme.vars['--surface']);
  const palette = color.cloudPalette(surfaceLum);
  lines.push('\n' + theme.name + ' theme — word cloud palette');
  palette.forEach(function (c, i) {
    check('hue ' + color.CLOUD_HUES[i] + '  ' + c, color.ratio(lum(c), surfaceLum), 4.5, 'cloud word on the panel');
  });
}

/* ---------- report ---------- */

console.log(lines.join('\n'));
console.log(
  '\n' + (failures === 0
    ? 'All contrast checks pass.'
    : failures + ' contrast check(s) FAILED.')
);
process.exit(failures === 0 ? 0 : 1);
