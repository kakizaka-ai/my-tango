/* ==========================================================================
 * マイ単語帳 runtime shim
 *
 * The app (src/app.html) was written for the claude.ai artifact runtime, where
 * `await window.claude.use(name)` returns a capability object (or null). This file
 * provides the three capabilities the app uses, with ordinary web APIs, so the
 * app runs unchanged on any static host:
 *
 *   db         words are kept in localStorage; when 同期 is configured they are
 *              also kept in Supabase (through three SQL functions, see
 *              supabase/setup.sql) and shared between devices
 *   sample     "ask an AI for JSON": OpenAI-compatible Chat Completions, using the
 *              API key typed in 設定 (kept in this browser only)
 *   downloads  Blob + <a download>
 *
 * Settings live in localStorage under "mytango-settings":
 *   { openaiKey, openaiBase, model, supaUrl, supaKey, syncCode }
 * ========================================================================== */
(function () {
  'use strict';

  var SKEY = 'mytango-settings';
  function readSettings() {
    try { return JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeSettings(o) { localStorage.setItem(SKEY, JSON.stringify(o)); }
  var CFG = readSettings();
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  // same id rule as the app (src/app.html: slug), so imported words get the ids the app expects
  function slug(w) {
    var o = '', i, ch, s = String(w).toLowerCase();
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      if (/[a-z0-9]/.test(ch)) o += ch;
      else if (ch === ' ') o += '_';
      else if (ch === '-') o += '-';
      else o += '~' + s.charCodeAt(i).toString(16) + '~';
    }
    return o.slice(0, 180) || 'x';
  }

  /* ------------------------------------------------------------------ db */
  var DBPREFIX = 'mytango-db:', DIRTYKEY = 'mytango-db-dirty:';
  var cache = {}, listeners = {}, loading = {}, pending = 0;
  var remote = (CFG.supaUrl && CFG.supaKey && CFG.syncCode)
    ? { url: String(CFG.supaUrl).replace(/\/+$/, ''), key: CFG.supaKey, code: CFG.syncCode } : null;
  var info = { state: remote ? 'connecting' : 'local', error: '' };   // 'local' | 'connecting' | 'online' | 'offline'

  function loadLocal(coll) {
    try { return JSON.parse(localStorage.getItem(DBPREFIX + coll) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveLocal(coll) {
    try { localStorage.setItem(DBPREFIX + coll, JSON.stringify(cache[coll])); }
    catch (e) { throw { code: 'quota_exceeded', message: 'localStorage is full' }; }
  }
  function loadDirty(coll) {
    try { return JSON.parse(localStorage.getItem(DIRTYKEY + coll) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveDirty(coll, d) {
    try { localStorage.setItem(DIRTYKEY + coll, JSON.stringify(d)); } catch (e) {}
  }
  function snapshot(coll) {
    var m = cache[coll] || {};
    return { docs: Object.keys(m).map(function (id) { return { id: id, exists: true, data: function () { return clone(m[id]); } }; }) };
  }
  function notify(coll) { (listeners[coll] || []).slice().forEach(function (cb) { try { cb(snapshot(coll)); } catch (e) {} }); }

  function updateNote() {
    var el = document.getElementById('modeNote');
    if (el) el.textContent = info.note();
  }
  info.note = function () {
    if (!remote) return '保存先：この端末のブラウザの中だけ（同期するには、「設定」で同期を設定してください）';
    if (info.state === 'online') return '保存先：クラウドと同期中（PC とスマホで同じ単語帳になります）';
    if (info.state === 'offline') return '保存先：同期に接続できません。この端末の中の分を表示しています（つながると自動で同期します）';
    return '保存先：クラウドに接続しています…';
  };

  // --- Supabase (RPC functions, no custom headers: plain apikey + Authorization, which every project's CORS allows)
  function rpc(name, body) {
    return fetch(remote.url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: remote.key, Authorization: 'Bearer ' + remote.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw { code: r.status === 401 || r.status === 403 ? 'not_granted' : r.status === 429 ? 'resource_exhausted' : 'unavailable', message: 'HTTP ' + r.status + ' ' + t.slice(0, 200) };
        });
      }
      return r.status === 204 ? null : r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    }, function (e) { throw { code: 'unavailable', message: String(e && e.message || e) }; });
  }
  async function pullAll() {
    var all = {}, off = 0, lim = 1000;
    for (;;) {
      var rows = (await rpc('mytango_list', { code: remote.code, p_offset: off, p_limit: lim })) || [];
      rows.forEach(function (r) { all[r.id] = r.data; });
      if (rows.length < lim) break;
      off += lim;
    }
    return all;
  }
  function remotePut(id, data) { return rpc('mytango_put', { code: remote.code, doc_id: id, doc: data }); }
  function remoteDelete(id) { return rpc('mytango_delete', { code: remote.code, doc_id: id }); }

  // merge the server's copy with what this device has not managed to send yet (dirty = changes made offline)
  async function refresh(coll, first) {
    if (!remote || pending > 0) return;
    var rem;
    try { rem = await pullAll(); }
    catch (e) { info.state = 'offline'; info.error = e.message || ''; updateNote(); return; }
    var dirty = loadDirty(coll), local = cache[coll] || {};
    var initKey = 'mytango-sync-init:' + remote.code;
    if (first && !localStorage.getItem(initKey)) {   // the first time this device meets this sync code: send up whatever only this device has
      Object.keys(local).forEach(function (id) { if (!(id in rem)) dirty[id] = 'set'; });
      localStorage.setItem(initKey, '1');
    }
    var ids = Object.keys(dirty);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      try {
        if (dirty[id] === 'del') { await remoteDelete(id); delete rem[id]; }
        else if (local[id]) { await remotePut(id, local[id]); rem[id] = local[id]; }
        delete dirty[id];
      } catch (e) {
        if (dirty[id] === 'del') delete rem[id]; else if (local[id]) rem[id] = local[id];   // keep showing the local change
      }
    }
    saveDirty(coll, dirty);
    info.state = 'online'; info.error = '';
    var same = JSON.stringify(rem) === JSON.stringify(cache[coll]);
    cache[coll] = rem;
    if (!same) { try { saveLocal(coll); } catch (e) {} notify(coll); }
    updateNote();
  }
  if (remote) {
    setInterval(function () { Object.keys(cache).forEach(function (c) { refresh(c, false); }); }, 20000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') Object.keys(cache).forEach(function (c) { refresh(c, false); });
    });
    window.addEventListener('online', function () { Object.keys(cache).forEach(function (c) { refresh(c, false); }); });
  }

  function ensureLoaded(coll) {
    if (loading[coll]) return loading[coll];
    cache[coll] = loadLocal(coll);
    loading[coll] = Promise.resolve();
    return loading[coll];
  }
  function writeDoc(coll, id, data) {          // data === null means delete
    return ensureLoaded(coll).then(function () {
      if (data === null) delete cache[coll][id]; else cache[coll][id] = clone(data);
      saveLocal(coll);
      notify(coll);
      if (!remote) return;
      pending++;
      var p = data === null ? remoteDelete(id) : remotePut(id, data);
      return p.then(function () { info.state = 'online'; updateNote(); }, function (e) {
        var d = loadDirty(coll); d[id] = data === null ? 'del' : 'set'; saveDirty(coll, d);   // retried on the next refresh
        info.state = 'offline'; info.error = e.message || ''; updateNote();
        throw e;
      }).then(function (v) { pending--; return v; }, function (e) { pending--; throw e; });
    });
  }

  var db = {
    collection: function (coll) {
      return {
        onSnapshot: function (cb, errCb) {
          var off = false;
          ensureLoaded(coll).then(function () {
            if (off) return;
            (listeners[coll] = listeners[coll] || []).push(cb);
            cb(snapshot(coll));
            if (remote) refresh(coll, true);
          }, function (e) { if (errCb) errCb(e); });
          return function () { off = true; listeners[coll] = (listeners[coll] || []).filter(function (f) { return f !== cb; }); };
        }
      };
    },
    doc: function (path) {
      var parts = String(path).split('/'), coll = parts[0], id = parts[1];
      return {
        set: function (data) { return writeDoc(coll, id, data); },
        delete: function () { return writeDoc(coll, id, null); }
      };
    }
  };

  /* -------------------------------------------------------------- sample */
  function parseJsonLoose(text) {
    var t = String(text || '').trim(), m;
    try { return JSON.parse(t); } catch (e) {}
    m = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (m) { try { return JSON.parse(m[1].trim()); } catch (e) {} }
    var a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    return undefined;
  }
  async function callModel(input, opts) {
    opts = opts || {};
    var cfg = readSettings();
    if (!cfg.openaiKey) throw { code: 'no_key', message: 'OpenAI API key is not set' };
    var base = String(cfg.openaiBase || 'https://api.openai.com/v1').replace(/\/+$/, '');
    var messages = typeof input === 'string' ? [{ role: 'user', content: input }]
      : input.map(function (m) { return { role: m.role, content: m.content }; });
    var res;
    try {
      res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.openaiKey },
        body: JSON.stringify({ model: cfg.model || 'gpt-4.1-mini', messages: messages }),
        signal: opts.signal
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw { code: 'cancelled', message: 'aborted' };
      throw { code: 'upstream_error', message: String(e && e.message || e) };
    }
    if (!res.ok) {
      var body = ''; try { body = await res.text(); } catch (e) {}
      throw { code: res.status === 401 || res.status === 403 ? 'not_granted' : res.status === 429 ? 'rate_limited' : 'upstream_error', message: 'HTTP ' + res.status + ' ' + body.slice(0, 300) };
    }
    var j = await res.json(), ch = j.choices && j.choices[0];
    var text = ch && ch.message && ch.message.content || '';
    if (!String(text).trim()) throw { code: 'empty_completion', message: 'empty reply' };
    if (opts.onText) { try { opts.onText({ text: text, delta: text }); } catch (e) {} }
    return { text: text, truncated: !!(ch && ch.finish_reason === 'length'), modelTierApplied: 'default' };
  }
  var sample = function (input, opts) { return callModel(input, opts); };
  sample.json = async function (input, opts) {
    var r = await callModel(input, opts), v = parseJsonLoose(r.text);
    if (v === undefined) throw { code: 'invalid_json', message: 'the reply held no JSON', text: r.text };
    return v;
  };
  sample.limits = function () { return Promise.resolve({ maxPromptBytes: 65536 }); };

  /* ----------------------------------------------------------- downloads */
  var downloads = {
    save: function (req) {
      return new Promise(function (resolve, reject) {
        try {
          var blob = req.data instanceof Blob ? req.data : new Blob([req.data], { type: 'text/plain;charset=utf-8' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = req.filename || 'download.txt';
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
          resolve({ status: 'saved' });
        } catch (e) { reject({ code: 'unavailable', message: String(e) }); }
      });
    }
  };

  window.claude = {
    use: function (name) {
      return Promise.resolve(name === 'db' ? db : name === 'sample' ? sample : name === 'downloads' ? downloads : null);
    }
  };

  /* ------------------------------------------- import / export / settings API (used by the 設定 dialog) */
  var POS = ['名', '動', '形', '副', '前', '接', '熟語'];
  var GENRES = ['hr', 'law', 'fin', 'sales', 'mfg', 'office', 'travel', 'build', 'health', 'edu', 'env', 'state', 'action', 'gen', 'other'];
  function str(v) { return v == null ? '' : String(v).trim(); }
  function defaultGenre(pos) { return { '形': 'state', '動': 'action', '副': 'gen', '前': 'gen', '接': 'gen', '熟語': 'gen' }[pos] || 'other'; }
  // accepts the app's own backup docs, and the spec form in docs/wordbank_spec.md (word, pos, meaning_ja, ipa, genre, example, example_ja, headword, derived)
  function normalizeDoc(w) {
    if (!w || typeof w !== 'object' || !str(w.word)) return null;
    var pos = POS.indexOf(w.pos) >= 0 ? w.pos : '名';
    var out = {
      word: str(w.word), pos: pos, meaning_ja: str(w.meaning_ja), ipa: str(w.ipa).replace(/[\/\[\]]/g, ''),
      genre: GENRES.indexOf(w.genre) >= 0 ? w.genre : defaultGenre(pos), set: 'user',
      example: str(w.example), example_ja: str(w.example_ja), headword: str(w.headword) || null, derived: [],
      src: Array.isArray(w.src) ? w.src.filter(function (k) { return typeof k === 'string'; }) : [],
      added: Number(w.added) || Date.now(), s: w.s | 0, d: w.d | 0, m: w.m | 0
    };
    if (Array.isArray(w.dv)) out.dv = w.dv.filter(function (d) { return d && d.w; }).map(function (d) { return { w: String(d.w), pos: d.pos || '', ja: d.ja || '' }; });
    else if (Array.isArray(w.derived_forms)) out.dv = w.derived_forms.filter(function (d) { return d && d.word; }).map(function (d) { return { w: String(d.word), pos: d.pos || '', ja: d.meaning_ja || '' }; });
    if (w.mt) out.mt = Number(w.mt) || 0;
    if (Array.isArray(w.sn)) out.sn = w.sn;
    if (w.sp) out.sp = str(w.sp);
    return out;
  }
  async function importWords(list, opt) {
    opt = opt || {};
    await ensureLoaded('words');
    var res = { added: 0, updated: 0, skipped: 0, invalid: 0 };
    for (var i = 0; i < list.length; i++) {
      var doc = normalizeDoc(list[i]);
      if (!doc) { res.invalid++; continue; }
      var id = slug(doc.word), exists = id in cache.words;
      if (exists && !opt.overwrite) { res.skipped++; continue; }
      await writeDoc('words', id, doc);
      if (exists) res.updated++; else res.added++;
    }
    return res;
  }
  function exportAll() {
    var m = cache.words || loadLocal('words');
    var words = Object.keys(m).map(function (id) { return m[id]; }).sort(function (a, b) { return (a.added || 0) - (b.added || 0); });
    return { format: 'mytango-backup', version: 1, exportedAt: new Date().toISOString(), count: words.length, words: words };
  }
  // used by the 設定 dialog's "試す" buttons
  async function testSupabase(url, key, code) {
    var save = remote; remote = { url: String(url).replace(/\/+$/, ''), key: key, code: code };
    try { var rows = await rpc('mytango_list', { code: code, p_offset: 0, p_limit: 1 }); return { ok: true, rows: (rows || []).length }; }
    catch (e) { return { ok: false, error: e.message || e.code }; }
    finally { remote = save; }
  }
  async function testModel() {
    try { var v = await sample.json('Reply with only this JSON: [1]'); return { ok: Array.isArray(v) }; }
    catch (e) { return { ok: false, error: (e.code || '') + ' ' + (e.message || '') }; }
  }
  window.__storeInfo = info;
  window.__mytango = {
    settings: { get: readSettings, set: writeSettings },
    importWords: importWords, exportAll: exportAll, normalizeDoc: normalizeDoc, slug: slug,
    testSupabase: testSupabase, testModel: testModel, parseJsonLoose: parseJsonLoose
  };
})();
