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
    supabaseUrl: 'https://qcyyijtoparijgsnoksq.supabase.co',

    // The publishable key from Settings → API. Public on purpose: it is in
    // this file, in the repo, and in the page source, and none of that
    // matters — db/schema.sql grants it read-a-countdown, add-a-wish and
    // create-a-countdown, and nothing else.
    supabaseAnonKey: 'sb_publishable_yxtq44R0NOj7mD3Hkwwxpg_De4ooUqO',

    // how often an open page checks for new wishes, in ms
    pollMs: 8000
  };
})(window);
