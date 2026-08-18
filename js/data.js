/* =========================================================
   data.js — the person, their wishes, and where those live.

   Two modes behind one interface:

     local    one countdown on this device, kept in localStorage,
              no network at all. What the site has always done.
     shared   opened from a ?b=<id> link. The person and every
              wish come from the database in js/cloud.js.

   Reads stay synchronous in both — getWishes() hands back an
   in-memory cache — because the render path calls them from
   places that cannot wait. Writes return promises, and the
   cache is updated optimistically so the page reacts at once
   and rolls back if the server refuses.
   ========================================================= */
(function (global) {
  'use strict';

  var KEY_PERSON = 'bd.person.v2';
  var KEY_WISHES = 'bd.wishes.v2';
  var KEY_PREFS  = 'bd.prefs.v2';
  var KEY_OWNER  = 'bd.owner.';        // + share id

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

  /* ---------- shared-mode state ---------- */

  var shared = { on: false, id: null, person: null, wishes: [], ownerKey: null };

  function cloud() { return global.BD.cloud; }

  function mode() { return shared.on ? 'shared' : 'local'; }
  function shareId() { return shared.id; }
  function isOwner() { return !!(shared.on && shared.ownerKey); }

  function shareLink(id) {
    var base = global.location.origin + global.location.pathname;
    return base + '?b=' + encodeURIComponent(id || shared.id || '');
  }

  /** The id in the address bar, if this page was opened from a link. */
  function linkedId() {
    var m = /[?&]b=([a-z0-9][a-z0-9-]{4,38}[a-z0-9])(?:&|$)/i.exec(global.location.search || '');
    return m ? m[1].toLowerCase() : null;
  }

  /* ---------- person ---------- */

  function getPerson() {
    if (shared.on) return shared.person;
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
    if (shared.on) return shared.wishes;
    var list = read(KEY_WISHES, []);
    return Array.isArray(list) ? list : [];
  }

  function localId() {
    return 'w-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  /**
   * Add a wish. Resolves with the stored wish.
   *
   * In shared mode the wish goes into the cache first and is taken back out
   * if the server refuses, so the cloud reacts on the press rather than on
   * the round trip — and never keeps a word the database does not have.
   */
  function addWish(wish) {
    if (!shared.on) {
      var list = getWishes();
      wish.id = localId();
      wish.ts = Date.now();
      list.unshift(wish);
      write(KEY_WISHES, list);
      return Promise.resolve(wish);
    }

    var optimistic = {
      id: localId(), who: wish.who, word: wish.word,
      text: wish.text || '', emoji: wish.emoji || '🎉', ts: Date.now(), pending: true
    };
    shared.wishes.unshift(optimistic);

    return cloud().addWish(shared.id, wish).then(function (saved) {
      var at = shared.wishes.indexOf(optimistic);
      if (at !== -1) shared.wishes[at] = saved;
      return saved;
    }).catch(function (err) {
      var at = shared.wishes.indexOf(optimistic);
      if (at !== -1) shared.wishes.splice(at, 1);
      throw err;
    });
  }

  function removeWish(id) {
    if (!shared.on) {
      write(KEY_WISHES, getWishes().filter(function (w) { return w.id !== id; }));
      return Promise.resolve(true);
    }

    var at = -1, removed = null;
    for (var i = 0; i < shared.wishes.length; i++) {
      if (shared.wishes[i].id === id) { at = i; removed = shared.wishes[i]; break; }
    }
    if (at !== -1) shared.wishes.splice(at, 1);

    return cloud().deleteWish(id, shared.ownerKey).catch(function (err) {
      if (removed) shared.wishes.splice(at, 0, removed);   // put it back where it was
      throw err;
    });
  }

  /** Only the person who made the link may remove wishes from a shared cloud. */
  function canRemove() { return !shared.on || isOwner(); }

  /* ---------- opening a link ---------- */

  function openShared(id) {
    return cloud().getBirthday(id).then(function (row) {
      shared.on = true;
      shared.id = row.id;
      shared.person = {
        name: row.name,
        date: row.date,
        hue: typeof row.hue === 'number' ? row.hue : hueFor(row.name)
      };
      shared.ownerKey = read(KEY_OWNER + row.id, null);
      return refresh().then(function () { return shared.person; });
    });
  }

  function refresh() {
    if (!shared.on) return Promise.resolve(getWishes());
    return cloud().listWishes(shared.id).then(function (list) {
      /* Anything still in flight is kept — it is not in the server's answer
         yet by definition, and dropping it would make the word the reader
         just sent flicker off the cloud and back on again. */
      var pending = shared.wishes.filter(function (w) { return w.pending; });
      shared.wishes = pending.concat(list);
      return shared.wishes;
    });
  }

  /**
   * Turn the countdown on this device into a shared one, carrying every wish
   * already on it up with it. Resolves with the link to hand out.
   */
  function publish() {
    var person = getPerson();
    if (!person) return Promise.reject(new Error('There is no countdown to share yet.'));

    return cloud().createBirthday(person).then(function (made) {
      write(KEY_OWNER + made.id, made.ownerKey);

      shared.on = true;
      shared.id = made.id;
      shared.person = person;
      shared.ownerKey = made.ownerKey;
      shared.wishes = [];

      var existing = read(KEY_WISHES, []);
      if (!Array.isArray(existing) || !existing.length) return made;

      /* Oldest first, one at a time, so the order they were written in
         survives the move. One wish failing must not sink the rest. */
      var queue = existing.slice().reverse().map(function (w) {
        return function () {
          return cloud().addWish(made.id, {
            who: w.who, word: w.word, text: w.text, emoji: w.emoji
          }).catch(function () { return null; });
        };
      });

      return queue.reduce(function (chain, step) {
        return chain.then(step);
      }, Promise.resolve()).then(function () { return made; });
    }).then(function (made) {
      return refresh().then(function () {
        return { id: made.id, link: shareLink(made.id) };
      });
    });
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

    mode: mode,
    shareId: shareId,
    shareLink: shareLink,
    linkedId: linkedId,
    isOwner: isOwner,
    canRemove: canRemove,
    openShared: openShared,
    publish: publish,
    refresh: refresh,

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
