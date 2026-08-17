/* =========================================================
   notify.js — the one place the page speaks.

   A toast on screen and a single polite live region for screen
   readers, always driven together. Announcing from wherever a
   thing happened is how a page ends up saying the same sentence
   three times, so everything funnels through here instead.
   ========================================================= */
(function (global) {
  'use strict';

  var TOAST_MS = 2800;
  var TOAST_UNDO_MS = 9000;   // an offer you have to read, then find, then press

  var els = null;
  var hideTimer = null;
  var announceTimer = null;
  var undoAction = null;

  function ready() {
    if (els) return els;
    els = {
      toast: document.getElementById('toast'),
      text: document.getElementById('toast-text'),
      undo: document.getElementById('toast-undo'),
      live: document.getElementById('live-polite')
    };
    if (els.undo) {
      els.undo.addEventListener('click', function () {
        var run = undoAction;
        undoAction = null;
        hide();
        if (run) run();
      });
    }
    return els;
  }

  /**
   * Put a sentence into the polite region.
   *
   * The region is cleared first and filled on the next frame: assigning the
   * same string twice is a no-op to the DOM, and a no-op is silence — which is
   * exactly the case that matters, sending the same word to the cloud twice.
   */
  function announce(message) {
    var e = ready();
    if (!e.live || !message) return;
    global.clearTimeout(announceTimer);
    e.live.textContent = '';
    announceTimer = global.setTimeout(function () { e.live.textContent = message; }, 60);
  }

  function hide() {
    var e = ready();
    if (!e.toast) return;
    e.toast.classList.remove('is-up');
    if (e.undo) e.undo.hidden = true;
    undoAction = null;
  }

  /**
   * say(message, { undo, undoLabel, announce })
   *
   * `undo` turns the toast into an offer rather than a notice, and the offer
   * is named in the announcement — an Undo button nobody is told about is a
   * button nobody presses.
   */
  function say(message, opts) {
    opts = opts || {};
    var e = ready();
    if (!e.toast) return;

    e.text.textContent = message;

    undoAction = typeof opts.undo === 'function' ? opts.undo : null;
    if (e.undo) {
      e.undo.hidden = !undoAction;
      if (undoAction) e.undo.setAttribute('aria-label', opts.undoLabel || 'Undo');
    }

    e.toast.classList.add('is-up');
    global.clearTimeout(hideTimer);
    hideTimer = global.setTimeout(hide, undoAction ? TOAST_UNDO_MS : TOAST_MS);

    if (opts.announce !== false) {
      announce(message + (undoAction ? ' ' + (opts.undoLabel || 'Undo') + ' button available.' : ''));
    }
  }

  global.BD = global.BD || {};
  global.BD.notify = { say: say, announce: announce, hide: hide };
})(window);
