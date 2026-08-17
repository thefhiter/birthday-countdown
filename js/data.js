/* =========================================================
   data.js — one birthday person, their wishes, and prefs.
   Everything lives in this browser; there is no server.
   ========================================================= */
(function (global) {
  'use strict';

  var KEY_PERSON = 'bd.person.v2';
  var KEY_WISHES = 'bd.wishes.v2';
  var KEY_PREFS  = 'bd.prefs.v2';

  /* localStorage throws in private modes and sandboxed frames, so every read
     and write goes through these and falls back to memory. */
  var memory = {};
  function read(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : fallback;
    }
  }
  function write(key, value) {
    memory[key] = value;
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* memory only */ }
  }

  /* Each mood carries its own name. Screen readers announce emoji from a
     Unicode table that nobody agrees on — "party popper", "confetti ball",
     sometimes nothing at all — so the label is written here rather than left
     to whichever table the reader happens to ship. */
  var MOODS = [
    { emoji: '🎉', name: 'Celebrating' },
    { emoji: '🎂', name: 'Cake' },
    { emoji: '❤️', name: 'Love' },
    { emoji: '🥳', name: 'Party' },
    { emoji: '✨', name: 'Sparkle' },
    { emoji: '🎈', name: 'Balloon' }
  ];

  function moodName(emoji) {
    for (var i = 0; i < MOODS.length; i++) if (MOODS[i].emoji === emoji) return MOODS[i].name;
    return 'Celebrating';
  }

  /* ---------- person ---------- */
  function getPerson() {
    var p = read(KEY_PERSON, null);
    if (!p || typeof p.name !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) return null;
    return p;
  }

  function setPerson(name, date) {
    var clean = String(name).trim().slice(0, 40);
    var person = { name: clean, date: date, hue: hueFor(clean) };
    write(KEY_PERSON, person);
    return person;
  }

  function clearPerson() {
    write(KEY_PERSON, null);
    write(KEY_WISHES, []);
  }

  /** The accent comes from the name, so each person gets their own colour
      without anyone having to pick one. */
  function hueFor(name) {
    var h = 0;
    var s = String(name || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 360;
  }

  /* ---------- wishes ---------- */
  function getWishes() {
    var list = read(KEY_WISHES, []);
    return Array.isArray(list) ? list : [];
  }

  function addWish(wish) {
    var list = getWishes();
    wish.id = 'w-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    wish.ts = Date.now();
    list.unshift(wish);
    write(KEY_WISHES, list);
    return wish;
  }

  function removeWish(id) {
    var list = getWishes().filter(function (w) { return w.id !== id; });
    write(KEY_WISHES, list);
    return list;
  }

  /* ---------- prefs ---------- */
  function getPrefs() {
    var p = read(KEY_PREFS, {});
    return {
      sound: p.sound === true,           // sound stays off until it is asked for
      motion: p.motion !== false,
      // null means "whatever the system asks for" — an untouched toggle should
      // keep following prefers-color-scheme rather than pinning a theme
      theme: p.theme === 'dark' || p.theme === 'light' ? p.theme : null,
      lastName: typeof p.lastName === 'string' ? p.lastName : ''
    };
  }
  function setPref(key, value) {
    var p = read(KEY_PREFS, {});
    p[key] = value;
    write(KEY_PREFS, p);
  }

  global.BD = global.BD || {};
  global.BD.data = {
    MOODS: MOODS,
    moodName: moodName,
    getPerson: getPerson,
    setPerson: setPerson,
    clearPerson: clearPerson,
    hueFor: hueFor,
    getWishes: getWishes,
    addWish: addWish,
    removeWish: removeWish,
    getPrefs: getPrefs,
    setPref: setPref
  };
})(window);
