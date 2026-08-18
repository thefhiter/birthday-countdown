/* =========================================================
   config.js — where the shared cloud lives.

   Fill these in to turn on shareable links. Leave them empty
   and the site still works exactly as it did: one countdown,
   wishes kept in your own browser, no network calls at all.

   Both values are meant to be public. The anon key is visible
   to anyone who opens the page source, which is why db/schema.sql
   never trusts it — the row-level rules there are what actually
   protect the data. Never paste the *service role* key here;
   that one bypasses every rule in that file.
   ========================================================= */
(function (global) {
  'use strict';

  global.BD = global.BD || {};
  global.BD.config = {
    // e.g. 'https://abcdefghijklm.supabase.co'
    supabaseUrl: '',

    // the "anon public" key from Settings → API
    supabaseAnonKey: '',

    // how often an open page checks for new wishes, in ms
    pollMs: 8000
  };
})(window);
