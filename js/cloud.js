/* =========================================================
   cloud.js — the shared wish cloud, over PostgREST.

   Supabase's REST endpoint is plain HTTP with two headers, so
   this talks to it with fetch rather than pulling in the SDK.
   That keeps the promise the rest of the repo makes: no build
   step, no package manager, and tools/build-single.js can still
   fold the whole site into one file you can email.

   Everything here returns a promise and every failure comes back
   as a thrown Error with a sentence a person can read, because
   the callers put those sentences on the screen.
   ========================================================= */
(function (global) {
  'use strict';

  var cfg = global.BD.config || {};

  var SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';   // no l/o/0/1
  var SLUG_SUFFIX = 4;
  var SLUG_NAME_MAX = 28;

  function isConfigured() {
    return !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  }

  function headers(extra) {
    var h = {
      'apikey': cfg.supabaseAnonKey,
      'Authorization': 'Bearer ' + cfg.supabaseAnonKey,
      'Content-Type': 'application/json'
    };
    for (var k in (extra || {})) h[k] = extra[k];
    return h;
  }

  /** Random string from a crypto source, falling back only if there isn't one. */
  function randomFrom(alphabet, length) {
    var out = '';
    var crypto = global.crypto;
    if (crypto && crypto.getRandomValues) {
      var bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      for (var i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
      return out;
    }
    for (var j = 0; j < length; j++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }

  function newOwnerKey() {
    return randomFrom('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 40);
  }

  /**
   * The link people are actually sent, so the name goes in it:
   * "ahmed-ltaif-k3m9" rather than "k3m9x2qd".
   *
   * The four random characters on the end are not decoration. Without them the
   * link for any given name is guessable, so anyone could find — or quietly
   * take — the countdown for a name they know. They also let two different
   * Ahmed Ltaifs exist at once.
   *
   * Accents are folded rather than dropped, so "Émilie" gives "emilie". A name
   * in a script that does not reduce to ASCII at all — Arabic, Greek, Chinese —
   * gives nothing to fold, and rather than emit mojibake or a percent-encoded
   * mess in a link people paste into chat, those fall back to a random slug.
   */
  function slugify(name) {
    var s = String(name || '');
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.toLowerCase()
      .replace(/['’]/g, '')          // o'brien -> obrien, not o-brien
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, SLUG_NAME_MAX)
      .replace(/-+$/, '');           // the slice may have landed on a hyphen
  }

  function makeSlug(name) {
    var stem = slugify(name);
    var tail = randomFrom(SLUG_ALPHABET, SLUG_SUFFIX);
    // a stem too short to be worth reading is not worth keeping
    return stem.length >= 2 ? stem + '-' + tail : randomFrom(SLUG_ALPHABET, 8);
  }

  /**
   * One request. Turns every way this can go wrong into a sentence, because
   * "TypeError: Failed to fetch" on a birthday page helps nobody.
   */
  function request(path, options) {
    if (!isConfigured()) {
      return Promise.reject(new Error('Sharing is not set up on this copy of the site.'));
    }
    options = options || {};

    var controller = global.AbortController ? new global.AbortController() : null;
    var timer = controller ? global.setTimeout(function () { controller.abort(); }, 12000) : null;

    return global.fetch(cfg.supabaseUrl.replace(/\/+$/, '') + path, {
      method: options.method || 'GET',
      headers: headers(options.headers),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (timer) global.clearTimeout(timer);
      if (res.status === 204) return null;
      return res.text().then(function (text) {
        var payload = null;
        try { payload = text ? JSON.parse(text) : null; } catch (err) { payload = null; }

        if (!res.ok) {
          var detail = payload && (payload.message || payload.hint || payload.details);
          if (res.status === 401 || res.status === 403) {
            throw new Error('The sharing key was refused. Check the keys in js/config.js.');
          }
          if (res.status === 404) throw new Error('That countdown could not be found.');
          throw new Error(detail || ('The server said no (' + res.status + ').'));
        }
        return payload;
      });
    }).catch(function (err) {
      if (timer) global.clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new Error('The connection timed out. Check your internet and try again.');
      }
      if (err instanceof TypeError) {
        throw new Error('Could not reach the server. Check your internet and try again.');
      }
      throw err;
    });
  }

  /* ---------- birthdays ---------- */

  /**
   * Publish a countdown and get back its id and owner key.
   *
   * The id is built here rather than by the database so the link can carry the
   * name. Two people making a countdown for the same name in the same second
   * could collide on the random suffix; the primary key catches it and we try
   * again with a different one.
   */
  function createBirthday(person, attempt) {
    attempt = attempt || 0;
    var id = makeSlug(person.name);
    var ownerKey = newOwnerKey();

    /* The ?select= is not optional. With `return=representation` PostgREST
       reads the new row back across *every* column, and owner_key is granted
       for INSERT but not for SELECT — so asking for the whole row is asking
       for the one column anon may never read, and the insert comes back 401.
       Naming the readable columns is what makes the write and the rule agree. */
    return request('/rest/v1/birthdays?select=id,name,date,hue', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: { id: id, name: person.name, date: person.date, hue: person.hue, owner_key: ownerKey }
    }).then(function (rows) {
      var row = Array.isArray(rows) ? rows[0] : rows;
      return { id: (row && row.id) || id, ownerKey: ownerKey };
    }).catch(function (err) {
      if (attempt < 3 && /duplicate|already exists|23505/i.test(err.message)) {
        return createBirthday(person, attempt + 1);
      }
      throw err;
    });
  }

  function getBirthday(id) {
    return request('/rest/v1/birthdays?select=id,name,date,hue&id=eq.' + encodeURIComponent(id))
      .then(function (rows) {
        if (!rows || !rows.length) throw new Error('That countdown could not be found. The link may be wrong, or it may have been removed.');
        return rows[0];
      });
  }

  /* ---------- wishes ---------- */

  function listWishes(birthdayId) {
    var path = '/rest/v1/wishes' +
      '?select=id,who,word,message,emoji,created_at' +
      '&birthday_id=eq.' + encodeURIComponent(birthdayId) +
      '&order=created_at.desc&limit=500';
    return request(path).then(function (rows) {
      return (rows || []).map(fromRow);
    });
  }

  function addWish(birthdayId, wish) {
    return request('/rest/v1/wishes?select=id,who,word,message,emoji,created_at', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: {
        birthday_id: birthdayId,
        who: wish.who,
        word: wish.word,
        message: wish.text || null,
        emoji: wish.emoji || null
      }
    }).then(function (rows) {
      var row = Array.isArray(rows) ? rows[0] : rows;
      return fromRow(row);
    });
  }

  /**
   * Only the person who made the link can do this, and the check happens in
   * the database (see delete_wish in db/schema.sql), not here — the page
   * hiding the button is a courtesy, not the rule.
   */
  function deleteWish(wishId, ownerKey) {
    return request('/rest/v1/rpc/delete_wish', {
      method: 'POST',
      body: { p_wish_id: wishId, p_owner_key: ownerKey || '' }
    }).then(function (ok) {
      if (ok !== true) throw new Error('That wish could not be removed.');
      return true;
    });
  }

  /** Database row -> the shape the rest of the page already speaks. */
  function fromRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      who: row.who,
      word: row.word,
      text: row.message || '',
      emoji: row.emoji || '🎉',
      ts: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    };
  }

  global.BD = global.BD || {};
  global.BD.cloud = {
    isConfigured: isConfigured,
    slugify: slugify,
    makeSlug: makeSlug,
    createBirthday: createBirthday,
    getBirthday: getBirthday,
    listWishes: listWishes,
    addWish: addWish,
    deleteWish: deleteWish,
    newOwnerKey: newOwnerKey
  };
})(window);
