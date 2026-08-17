/* =========================================================
   wishes.js — one-word wishes: the cloud, the form, the list
   ========================================================= */
(function (global) {
  'use strict';

  var data = global.BD.data;
  var cloud = global.BD.wordcloud;
  var notify = global.BD.notify;

  var els = {};
  var chosenMood = data.MOODS[0].emoji;
  var lastWord = null;
  var resizeTimer = null;

  function q(id) { return document.getElementById(id); }

  function init() {
    els = {
      form: q('wish-form'),
      name: q('wish-name'),
      word: q('wish-word'),
      text: q('wish-text'),
      chars: q('wish-chars'),
      list: q('wish-list'),
      pick: q('emoji-pick'),
      cloud: q('cloud'),
      cloudEmpty: q('cloud-empty'),
      cloudCount: q('cloud-count'),
      cloudCountText: q('cloud-count-text'),
      cloudMore: q('cloud-more'),
      cloudQuestion: q('cloud-question'),
      cloudSr: q('cloud-sr')
    };

    buildMoodPicker();

    var prefs = data.getPrefs();
    if (prefs.lastName) els.name.value = prefs.lastName;

    els.text.addEventListener('input', function () {
      els.chars.textContent = String(els.text.value.length);
    });

    // typing a space is how people try to sneak in two words — keep the first
    els.word.addEventListener('input', function () {
      var cleaned = cloud.normalize(els.word.value);
      if (cleaned !== els.word.value) els.word.value = cleaned;
      clearError(els.word, 'wish-word-error');
    });
    els.name.addEventListener('input', function () { clearError(els.name, 'wish-name-error'); });

    els.form.addEventListener('submit', onSubmit);

    /* A resize only re-packs the same words into a new box. It is not news, so
       it redraws without touching the live region. */
    global.addEventListener('resize', function () {
      global.clearTimeout(resizeTimer);
      resizeTimer = global.setTimeout(function () { drawCloud({ quiet: true }); }, 220);
    }, { passive: true });
  }

  function setQuestion(name) {
    els.cloudQuestion.textContent = 'Your birthday wish for ' + (name || 'them') + ' in 1 word';
  }

  /* ---------- validation ---------- */

  function showError(input, errorId, message) {
    var box = q(errorId);
    if (!box) return;
    box.textContent = message;
    box.hidden = false;
    input.setAttribute('aria-invalid', 'true');
  }

  function clearError(input, errorId) {
    var box = q(errorId);
    if (box) { box.textContent = ''; box.hidden = true; }
    input.removeAttribute('aria-invalid');
  }

  /* ---------- the mood picker ---------- */

  function buildMoodPicker() {
    els.pick.innerHTML = '';
    data.MOODS.forEach(function (mood, i) {
      var wrap = document.createElement('div');
      wrap.className = 'mood';

      var input = document.createElement('input');
      input.className = 'mood__input';
      input.type = 'radio';
      input.name = 'mood';
      input.id = 'mood-' + i;
      input.value = mood.emoji;
      input.checked = i === 0;

      var face = document.createElement('label');
      face.className = 'mood__face';
      face.htmlFor = input.id;

      var glyph = document.createElement('span');
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = mood.emoji;

      var name = document.createElement('span');
      name.className = 'sr-only';
      name.textContent = mood.name;

      face.appendChild(glyph);
      face.appendChild(name);

      input.addEventListener('change', function () {
        chosenMood = mood.emoji;
        if (global.BD.audio) global.BD.audio.play('pop');
      });

      wrap.appendChild(input);
      wrap.appendChild(face);
      els.pick.appendChild(wrap);
    });
    chosenMood = data.MOODS[0].emoji;
  }

  /* ---------- sending ---------- */

  function onSubmit(e) {
    e.preventDefault();

    var name = els.name.value.trim();
    var word = cloud.normalize(els.word.value);
    var text = els.text.value.trim();

    clearError(els.name, 'wish-name-error');
    clearError(els.word, 'wish-word-error');

    /* Errors are written next to the field and the first bad field takes
       focus, so a screen reader reads the label and the reason together
       instead of a toast that has already gone by. */
    var firstBad = null;
    if (!name) {
      showError(els.name, 'wish-name-error', 'Add your name so everyone knows who wished.');
      firstBad = firstBad || els.name;
    }
    if (!word) {
      showError(els.word, 'wish-word-error', 'Add one word — it is the word that goes on the cloud.');
      firstBad = firstBad || els.word;
    }
    if (firstBad) {
      firstBad.focus();
      return;
    }

    data.setPref('lastName', name);
    var wish = data.addWish({ who: name, word: word, text: text, emoji: chosenMood });

    els.word.value = '';
    els.text.value = '';
    els.chars.textContent = '0';
    lastWord = word;

    render({ newestId: wish.id, quiet: true });

    if (global.BD.audio) global.BD.audio.play('chime');
    if (global.BD.fx) {
      var r = els.form.querySelector('button[type="submit"]').getBoundingClientRect();
      global.BD.fx.confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 80, silent: true });
    }

    // back to the word box, ready for the next person on a shared laptop
    els.word.focus();

    var same = wordCount(word);
    notify.say(same > 1
      ? '"' + word + '" added. ' + same + ' people have said that.'
      : '"' + word + '" added to the cloud.');
  }

  function wordOf(wish) { return cloud.normalize(wish.word || ''); }

  function wordCount(word) {
    var key = String(word).toLowerCase();
    return data.getWishes().filter(function (w) { return wordOf(w).toLowerCase() === key; }).length;
  }

  function plural(n, unit) { return n + ' ' + unit + (n === 1 ? '' : 's') + ' ago'; }

  function timeAgo(ts) {
    var s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return { short: s + 's ago', long: plural(s, 'second') };
    var m = Math.floor(s / 60);
    if (m < 60) return { short: m + 'm ago', long: plural(m, 'minute') };
    var h = Math.floor(m / 60);
    if (h < 24) return { short: h + 'h ago', long: plural(h, 'hour') };
    return { short: Math.floor(h / 24) + 'd ago', long: plural(Math.floor(h / 24), 'day') };
  }

  /* ---------- rendering ---------- */

  function render(opts) {
    opts = opts || {};
    var list = data.getWishes();

    els.list.innerHTML = '';
    list.forEach(function (w, i) {
      els.list.appendChild(wishCard(w, i, opts.newestId === w.id));
    });

    drawCloud({ quiet: true });
  }

  function drawCloud(opts) {
    opts = opts || {};
    if (!els.cloud) return;

    var list = data.getWishes();
    var words = cloud.tally(list.map(wordOf));

    var shown = cloud.render(els.cloud, words, { newest: lastWord });

    els.cloudEmpty.classList.toggle('is-hidden', words.length > 0);
    els.cloudCount.textContent = String(list.length);
    els.cloudCountText.textContent = list.length === 1
      ? '1 word sent'
      : list.length + ' words sent';

    /* The cloud is aria-hidden, so it is mirrored here as text. The mirror is
       a plain list, not a live region: it is rebuilt from scratch on every
       redraw, and a live region rebuilt from scratch reads itself out in full
       — including when all that changed was the width of the window. */
    els.cloudSr.innerHTML = '';
    words.slice().sort(function (a, b) { return b.count - a.count; }).forEach(function (w) {
      var li = document.createElement('li');
      li.textContent = w.count === 1
        ? w.text + ' — 1 person'
        : w.text + ' — ' + w.count + ' people';
      els.cloudSr.appendChild(li);
    });

    // words that would not fit are still counted, and still in the list above
    var hidden = words.length - shown;
    els.cloudMore.hidden = hidden <= 0;
    if (hidden > 0) els.cloudMore.textContent = '+' + hidden + ' more';
  }

  function wishCard(w, index, isNew) {
    var li = document.createElement('li');
    li.className = 'wish';
    li.style.animationDelay = (isNew ? 0 : Math.min(index, 10) * 40) + 'ms';

    var top = document.createElement('div');
    top.className = 'wish__top';

    var em = document.createElement('span');
    em.className = 'wish__emoji';
    em.setAttribute('aria-hidden', 'true');
    em.textContent = w.emoji || '🎉';

    var mood = document.createElement('span');
    mood.className = 'sr-only';
    mood.textContent = data.moodName(w.emoji) + '. ';

    var who = document.createElement('span');
    who.className = 'wish__who';
    who.textContent = w.who;

    /* "5m ago" is read out as "5 m ago", so the long form is carried in hidden
       text rather than an aria-label: <time> has no implicit role, and ARIA
       labels on roleless elements are not guaranteed to be honoured. */
    var ago = timeAgo(w.ts);
    var when = document.createElement('time');
    when.className = 'wish__when';
    when.dateTime = new Date(w.ts).toISOString();

    var whenShort = document.createElement('span');
    whenShort.setAttribute('aria-hidden', 'true');
    whenShort.textContent = ago.short;

    var whenLong = document.createElement('span');
    whenLong.className = 'sr-only';
    whenLong.textContent = ago.long;

    when.appendChild(whenShort);
    when.appendChild(whenLong);

    top.appendChild(em); top.appendChild(mood); top.appendChild(who); top.appendChild(when);

    var word = document.createElement('p');
    word.className = 'wish__word';
    word.textContent = wordOf(w);

    var del = document.createElement('button');
    del.className = 'wish__del';
    del.type = 'button';
    del.setAttribute('aria-label', 'Remove ' + w.who + "'s wish, " + wordOf(w));
    del.innerHTML = '<span aria-hidden="true">&times;</span>';
    del.addEventListener('click', function () { removeWish(w, li); });

    li.appendChild(del);
    li.appendChild(top);
    li.appendChild(word);

    if (w.text) {
      var body = document.createElement('p');
      body.className = 'wish__text';
      body.textContent = w.text;
      li.appendChild(body);
    }
    return li;
  }

  /**
   * Removing a wish takes the focused button out of the document with it.
   * Focus has to be put somewhere deliberate or it falls back to <body>, and a
   * keyboard reader is returned to the top of the page for having tidied up.
   */
  function removeWish(wish, li) {
    var buttons = [].slice.call(els.list.querySelectorAll('.wish__del'));
    var at = buttons.indexOf(li.querySelector('.wish__del'));
    var nextFocusIndex = at >= 0 && at < buttons.length - 1 ? at : at - 1;

    li.classList.add('is-going');
    if (global.BD.audio) global.BD.audio.play('click');

    var snapshot = wish;

    global.setTimeout(function () {
      data.removeWish(wish.id);
      render();

      var after = [].slice.call(els.list.querySelectorAll('.wish__del'));
      if (after.length && nextFocusIndex >= 0) after[Math.min(nextFocusIndex, after.length - 1)].focus();
      else if (after.length) after[0].focus();
      else els.name.focus();   // list is empty now — the form is the only thing left

      notify.say('Removed ' + snapshot.who + "'s wish.", {
        undo: function () {
          data.addWish({ who: snapshot.who, word: snapshot.word, text: snapshot.text, emoji: snapshot.emoji });
          lastWord = cloud.normalize(snapshot.word || '');
          render();
          notify.say('Put ' + snapshot.who + "'s wish back.");
          var back = els.list.querySelector('.wish__del');
          if (back) back.focus();
        },
        undoLabel: 'Undo removing ' + snapshot.who + "'s wish"
      });
    }, 320);
  }

  global.BD = global.BD || {};
  global.BD.wishes = {
    init: init,
    render: render,
    setQuestion: setQuestion,
    redraw: function () { drawCloud({ quiet: true }); }
  };
})(window);
