/* =========================================================
   app.js — theme, setup screen, countdown loop, the day itself
   ========================================================= */
(function (global) {
  'use strict';

  var data = global.BD.data;
  var audio = global.BD.audio;
  var fx = global.BD.fx;
  var cd = global.BD.countdown;
  var wishes = global.BD.wishes;
  var colour = global.BD.color;
  var notify = global.BD.notify;

  var reducedQuery = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var darkQuery = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  var state = {
    person: null,
    motion: true,
    theme: null,          // null = follow the system
    celebrated: false,
    timer: null,
    lastSaid: null,
    booted: false
  };

  function q(id) { return document.getElementById(id); }
  function prefersReduced() { return !!(reducedQuery && reducedQuery.matches); }
  function systemDark() { return !!(darkQuery && darkQuery.matches); }

  document.addEventListener('DOMContentLoaded', function () {
    var prefs = data.getPrefs();

    applyTheme(prefs.theme, true);
    fx.init();
    cd.bindClock();
    wishes.init();

    applyMotion(prefs.motion && !prefersReduced(), true);
    setSound(prefs.sound, true);

    q('setup-form').addEventListener('submit', onSetup);
    q('setup-name').addEventListener('input', function () { clearError('setup-name', 'setup-name-error'); });
    q('setup-date').addEventListener('input', function () { clearError('setup-date', 'setup-date-error'); });
    q('change-btn').addEventListener('click', onChange);

    q('theme-toggle').addEventListener('click', function () {
      applyTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
    });
    q('sound-toggle').addEventListener('click', function () { setSound(!audio.isEnabled()); });
    q('motion-toggle').addEventListener('click', function () { applyMotion(!state.motion); });

    // a real <button> now, so Enter and Space arrive without being wired up
    q('cake').addEventListener('click', blowCandles);

    // nobody can be born tomorrow
    q('setup-date').max = isoToday();

    /* If the reader never picked a theme, keep following the system when it
       changes rather than freezing on whatever it was at load. */
    if (darkQuery) {
      var onSystemTheme = function () { if (state.theme === null) applyTheme(null, true); };
      if (darkQuery.addEventListener) darkQuery.addEventListener('change', onSystemTheme);
      else if (darkQuery.addListener) darkQuery.addListener(onSystemTheme);
    }
    if (reducedQuery) {
      var onReduced = function () { if (prefersReduced()) applyMotion(false, true); };
      if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onReduced);
      else if (reducedQuery.addListener) reducedQuery.addListener(onReduced);
    }

    show(data.getPerson());
    startClock();
    state.booted = true;
  });

  /* ---------- theme ---------- */

  function effectiveTheme() {
    return state.theme || (systemDark() ? 'dark' : 'light');
  }

  function applyTheme(theme, quiet) {
    state.theme = theme === 'dark' || theme === 'light' ? theme : null;
    if (state.theme) document.documentElement.setAttribute('data-theme', state.theme);
    else document.documentElement.removeAttribute('data-theme');

    data.setPref('theme', state.theme);

    var dark = effectiveTheme() === 'dark';
    q('theme-toggle').setAttribute('aria-pressed', dark ? 'true' : 'false');

    // the accent is solved against the surface, so it has to be re-solved
    // whenever the surface changes underneath it
    applyAccent(currentHue());

    if (!quiet) {
      audio.play('click');
      notify.say(dark ? 'Dark theme on.' : 'Light theme on.');
    }
  }

  function currentHue() {
    if (state.person) {
      return typeof state.person.hue === 'number' ? state.person.hue : data.hueFor(state.person.name);
    }
    return 262;
  }

  /**
   * Write the accent tokens for one hue.
   *
   * Nothing here picks a lightness. The surface and the faintest text colour
   * are read back out of the stylesheet and handed to color.js, which solves
   * for the ratios each token has to clear — so a name that hashes to yellow
   * gets the same legibility as one that hashes to navy, in either theme.
   */
  function applyAccent(hue) {
    var root = document.documentElement;
    var styles = global.getComputedStyle(root);
    var surfaceLum = colour.lumOfCss(styles.getPropertyValue('--surface'));
    var bgLum = colour.lumOfCss(styles.getPropertyValue('--bg'));
    var mutedLum = colour.lumOfCss(styles.getPropertyValue('--ink-mute'));
    var dark = effectiveTheme() === 'dark';

    // If the custom properties cannot be read, leave the stylesheet fallbacks
    // in place — they already pass — rather than writing an unchecked colour.
    if (surfaceLum === null || bgLum === null || mutedLum === null) return;

    var t = colour.accentTokens(hue, {
      surfaceLum: surfaceLum, bgLum: bgLum, mutedLum: mutedLum, isDark: dark
    });

    root.style.setProperty('--hue', String(hue));
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--accent-text', t.accentText);
    root.style.setProperty('--accent-display', t.accentDisplay);
    root.style.setProperty('--accent-soft', t.accentSoft);
    root.style.setProperty('--accent-soft-fade', t.accentSoftFade);
    root.style.setProperty('--on-accent', t.onAccent);

    fx.setHue(hue);
    if (global.BD.wordcloud) global.BD.wordcloud.setSurface(surfaceLum);
    if (state.booted) wishes.redraw();
  }

  /* ---------- setup ---------- */

  function showError(inputId, errorId, message) {
    var box = q(errorId);
    box.textContent = message;
    box.hidden = false;
    q(inputId).setAttribute('aria-invalid', 'true');
  }

  function clearError(inputId, errorId) {
    var box = q(errorId);
    box.textContent = '';
    box.hidden = true;
    q(inputId).removeAttribute('aria-invalid');
  }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function onSetup(e) {
    e.preventDefault();

    var name = q('setup-name').value.trim();
    var date = q('setup-date').value;

    clearError('setup-name', 'setup-name-error');
    clearError('setup-date', 'setup-date-error');

    /* The message says what to do, not that something is wrong, and focus goes
       to the first field that needs it — SC 3.3.1 and 3.3.3. */
    var firstBad = null;
    if (!name) {
      showError('setup-name', 'setup-name-error', 'Add the name of the person whose birthday it is.');
      firstBad = firstBad || 'setup-name';
    }
    if (!date) {
      showError('setup-date', 'setup-date-error', 'Add their date of birth, for example 1990-04-23.');
      firstBad = firstBad || 'setup-date';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) {
      showError('setup-date', 'setup-date-error', 'That date could not be read. Use the year, month and day.');
      firstBad = firstBad || 'setup-date';
    } else if (date > isoToday()) {
      showError('setup-date', 'setup-date-error', 'That date is in the future. Use the date they were born.');
      firstBad = firstBad || 'setup-date';
    }

    if (firstBad) { q(firstBad).focus(); return; }

    // the first press is also the gesture browsers want before audio can start
    audio.unlock();

    show(data.setPerson(name, date), { announce: true });
    if (state.motion) fx.confetti({ count: 130, y: global.innerHeight * .3, silent: !audio.isEnabled() });
    audio.play('chime');
  }

  function onChange() {
    if (!global.confirm('Start over? This clears the countdown and every wish on the cloud.')) return;
    data.clearPerson();
    q('setup-name').value = '';
    q('setup-date').value = '';
    show(null, { announce: true });
    audio.play('click');
    notify.say('Cleared. Add a name and a date to start again.');
  }

  /** One switch between the two states the page has: setup, or a countdown. */
  function show(person, opts) {
    opts = opts || {};
    state.person = person;
    state.celebrated = false;
    state.lastSaid = null;

    var hasPerson = !!person;
    q('setup').hidden = hasPerson;
    q('hero').hidden = !hasPerson;
    q('wishes').hidden = !hasPerson;
    q('change-btn').hidden = !hasPerson;

    if (!hasPerson) {
      applyAccent(262);
      // Only move focus when the reader did something to get here. Grabbing
      // focus on first load drops a screen reader into a text box before it
      // has read the heading that explains the box.
      if (opts.announce) q('setup-name').focus();
      return;
    }

    applyAccent(typeof person.hue === 'number' ? person.hue : data.hueFor(person.name));

    q('hero-name').textContent = person.name;
    wishes.setQuestion(person.name);
    wishes.render();
    cd.resetClock();
    tick(true);

    // the whole page changed, so put focus at the top of what replaced it
    if (opts.announce) q('main').focus();
  }

  /* ---------- countdown ---------- */

  function startClock() {
    if (state.timer) global.clearInterval(state.timer);
    state.timer = global.setInterval(function () { tick(false); }, 250);
  }

  function tick(silent) {
    if (!state.person) return;
    var info = cd.info(state.person);
    if (!info) return;

    cd.renderClock(info.parts, { silent: silent });

    var name = state.person.name;
    q('hero-eyebrow').textContent = info.isToday ? "It's today" : 'Counting down to';
    q('hero-meta').textContent = info.isToday
      ? 'Turning ' + info.turning + ' today · ' + info.label
      : 'Turning ' + info.turning + ' on ' + info.label + ' · ' +
        info.daysLeft + (info.daysLeft === 1 ? ' day to go' : ' days to go');

    /* The clock itself never announces — four numbers a second is not
       something anyone can listen to. This says the same thing once, and only
       when the day count actually changes. */
    var summary = info.isToday
      ? 'It is ' + name + "'s birthday today. Turning " + info.turning + '.'
      : info.daysLeft + (info.daysLeft === 1 ? ' day' : ' days') + ' until ' + name +
        "'s birthday on " + info.label + ', turning ' + info.turning + '.';
    if (summary !== state.lastSaid) {
      state.lastSaid = summary;
      q('countdown-summary').textContent = summary;
    }

    if (info.isToday) celebrate(info);
  }

  /* ---------- the day itself ---------- */

  function celebrate(info) {
    if (state.celebrated) return;
    state.celebrated = true;

    var holder = q('cake-candles');
    holder.innerHTML = '';
    var n = Math.max(3, Math.min(6, info.turning % 10 || 5));
    for (var i = 0; i < n; i++) {
      var c = document.createElement('span');
      c.className = 'candle';
      var f = document.createElement('span');
      f.className = 'candle__flame';
      c.appendChild(f);
      holder.appendChild(c);
    }
    q('cake').classList.remove('is-blown');
    q('cake-label').textContent = 'Blow out the candles. ' + n + ' still lit.';
    q('today-hint').textContent = 'Press the cake to blow out the candles.';
    q('today').hidden = false;

    if (state.motion) {
      fx.confetti({ count: 160, y: global.innerHeight * .3, silent: true });
      fx.show(4000);
    }
    audio.play('melody');
  }

  function blowCandles() {
    var lit = [].slice.call(document.querySelectorAll('.candle:not(.is-out)'));
    if (!lit.length) return;

    audio.play('blow');
    q('cake').classList.add('is-blown');
    lit.forEach(function (c, i) {
      global.setTimeout(function () { c.classList.add('is-out'); }, i * 110);
    });

    global.setTimeout(function () {
      q('today-hint').textContent = 'Make it count. Now go read your wishes.';
      // the button's own name changes, so the state is in the control itself
      // rather than only in a hint sitting next to it
      q('cake-label').textContent = 'The candles are out.';
      if (state.motion) fx.confetti({ count: 180, y: global.innerHeight * .45, silent: true });
      audio.play('chime');
      notify.say('Candles blown out. Make it count.');
    }, lit.length * 110 + 220);
  }

  /* ---------- toggles ---------- */

  function setSound(on, quiet) {
    audio.setEnabled(on);
    data.setPref('sound', on);
    q('sound-toggle').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) audio.unlock();
    if (!quiet) notify.say(on ? 'Sound on.' : 'Sound off.');
  }

  function applyMotion(on, quiet) {
    state.motion = !!on;
    data.setPref('motion', state.motion);
    document.body.classList.toggle('no-motion', !state.motion);
    fx.setMotion(state.motion);
    q('motion-toggle').setAttribute('aria-pressed', state.motion ? 'true' : 'false');
    if (!quiet) {
      audio.play('click');
      notify.say(state.motion ? 'Animations on.' : 'Animations off.');
      if (state.motion) wishes.redraw();
    }
  }
})(window);
