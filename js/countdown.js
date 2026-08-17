/* =========================================================
   countdown.js — birthday maths and the flip clock
   ========================================================= */
(function (global) {
  'use strict';

  var MS_DAY = 86400000;
  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function parseBirthDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
    if (!m) return null;
    return { year: +m[1], month: +m[2] - 1, day: +m[3] };
  }

  /* Feb 29 only exists every fourth year; those birthdays land on Mar 1
     in common years so the countdown never silently skips one. */
  function occurrenceIn(year, b) {
    var day = b.day;
    var month = b.month;
    if (month === 1 && day === 29) {
      var isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      if (!isLeap) { month = 2; day = 1; }
    }
    return new Date(year, month, day);
  }

  /**
   * Everything the UI needs about one person's birthday, relative to `now`.
   */
  function info(person, now) {
    now = now || new Date();
    var b = parseBirthDate(person && person.date);
    if (!b) return null;

    var today = startOfDay(now);
    var thisYear = occurrenceIn(today.getFullYear(), b);
    var isToday = thisYear.getTime() === today.getTime();

    var next, prev;
    if (isToday) {
      next = thisYear;
      prev = occurrenceIn(today.getFullYear() - 1, b);
    } else if (thisYear.getTime() > today.getTime()) {
      next = thisYear;
      prev = occurrenceIn(today.getFullYear() - 1, b);
    } else {
      next = occurrenceIn(today.getFullYear() + 1, b);
      prev = thisYear;
    }

    var msLeft = Math.max(0, next.getTime() - now.getTime());
    var span = next.getTime() - prev.getTime();
    var progress = span > 0 ? Math.min(1, Math.max(0, (now.getTime() - prev.getTime()) / span)) : 0;

    return {
      isToday: isToday,
      next: next,
      prev: prev,
      msLeft: msLeft,
      progress: progress,
      daysLeft: Math.ceil(msLeft / MS_DAY),
      turning: next.getFullYear() - b.year,
      label: MONTHS[b.month] + ' ' + b.day,
      parts: split(msLeft)
    };
  }

  function split(ms) {
    var total = Math.floor(ms / 1000);
    return {
      days: Math.floor(total / 86400),
      hours: Math.floor(total / 3600) % 24,
      minutes: Math.floor(total / 60) % 60,
      seconds: total % 60
    };
  }

  function pad(n, width) {
    var s = String(n);
    width = width || 2;
    while (s.length < width) s = '0' + s;
    return s;
  }

  /* ---------- flip clock rendering ---------- */
  var slots = {};
  var lastValues = {};

  function bindClock() {
    ['days', 'hours', 'minutes', 'seconds'].forEach(function (unit) {
      var el = document.getElementById('flip-' + unit);
      if (el) slots[unit] = { box: el, val: el.querySelector('.flip__val') };
    });
  }

  function renderClock(parts, opts) {
    opts = opts || {};
    Object.keys(slots).forEach(function (unit) {
      var slot = slots[unit];
      if (!slot) return;
      var raw = parts[unit];
      var text = unit === 'days' ? pad(raw, String(raw).length > 2 ? String(raw).length : 2) : pad(raw, 2);
      if (lastValues[unit] === text) return;

      var isFirst = lastValues[unit] === undefined;
      lastValues[unit] = text;
      slot.val.textContent = text;

      if (isFirst || opts.silent) return;
      slot.box.classList.remove('is-flipping');
      // force reflow so the animation restarts on every change
      void slot.box.offsetWidth;
      slot.box.classList.add('is-flipping');

      if (unit === 'seconds' && opts.tick && global.BD.audio) global.BD.audio.play('tick');
    });
  }

  function resetClock() { lastValues = {}; }

  global.BD = global.BD || {};
  global.BD.countdown = {
    info: info,
    split: split,
    pad: pad,
    bindClock: bindClock,
    renderClock: renderClock,
    resetClock: resetClock,
    MONTHS: MONTHS
  };
})(window);
