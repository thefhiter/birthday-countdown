#!/usr/bin/env node
/**
 * Inlines the stylesheet and every script into one self-contained HTML file,
 * so the site can be shared or hosted as a single document.
 *
 *   node tools/build-single.js            -> dist/index.html
 *   node tools/build-single.js --fragment -> dist/fragment.html (no <html>/<head>/<body>)
 *
 * The fragment form is for hosts that supply their own document shell.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const fragment = process.argv.includes('--fragment');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

/* Pull the referenced files out of the markup rather than hardcoding a list,
   so adding a script to index.html is enough to get it into the build. */
function refs(re) {
  const found = [];
  let m;
  while ((m = re.exec(html)) !== null) found.push({ tag: m[0], file: m[1] });
  return found;
}

const styles = refs(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g);
const scripts = refs(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g);

if (!styles.length) throw new Error('no stylesheet found in index.html');
if (!scripts.length) throw new Error('no scripts found in index.html');

function readAsset(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error('missing asset: ' + file);
  return fs.readFileSync(full, 'utf8');
}

/* A literal </script> inside inlined JS would close the wrapper tag early. */
function safeScript(code) {
  return code.replace(/<\/script>/gi, '<\\/script>');
}

let out = html;

styles.forEach(function (s) {
  out = out.replace(s.tag, '<style>\n' + readAsset(s.file).trim() + '\n</style>');
});

// all scripts collapse into the position of the first one
const bundle = scripts
  .map(function (s) { return '/* ---- ' + s.file + ' ---- */\n' + safeScript(readAsset(s.file).trim()); })
  .join('\n\n');

out = out.replace(scripts[0].tag, '<script>\n' + bundle + '\n</script>');
scripts.slice(1).forEach(function (s) { out = out.replace(s.tag, ''); });

// tidy the blank lines the removed tags left behind
out = out.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');

let filename = 'index.html';
if (fragment) {
  filename = 'fragment.html';
  const head = out.match(/<head>([\s\S]*?)<\/head>/i);
  const body = out.match(/<body>([\s\S]*?)<\/body>/i);
  if (!head || !body) throw new Error('could not split document for fragment build');

  // keep <title> and the inlined <style>; drop the tags a host provides itself
  const keep = head[1]
    .split('\n')
    .filter(function (line) { return !/<meta|<link rel="icon"/i.test(line); })
    .join('\n')
    .trim();

  out = keep + '\n' + body[1].trim() + '\n';
}

const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });
const target = path.join(dist, filename);
fs.writeFileSync(target, out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
console.log('wrote ' + path.relative(root, target) + ' (' + kb + ' KB, ' +
            styles.length + ' stylesheet, ' + scripts.length + ' scripts inlined)');
