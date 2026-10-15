// An in-memory stand-in for the parts of the Google Drive REST API the app uses (drive.file view: only items the app
// created). Plain JavaScript so both the Node unit tests (as fetchFn) and the Chromium screen tests (through a
// Playwright route, via handle()) use the same behaviour. It proves the app's own logic only, never the real Google Drive.
//
// Supported: files.list (q with name / mimeType / 'x' in parents / trashed), files.get (metadata, alt=media),
// files.create (folder JSON, multipart upload), files.update (metadata PATCH incl. addParents/removeParents/trashed,
// multipart media PATCH), files.copy. Every content change raises `version`, like Drive.
const FOLDER = 'application/vnd.google-apps.folder';

export function createFakeDrive(opts = {}) {
  const files = new Map();
  let n = 0; let clock = Date.UTC(2026, 9, 1);
  const calls = [];
  const state = { token: opts.token ?? 'TOK', fail: null, failAfter: null, ops: 0 };
  const add = (name, parents, mimeType, data = new Uint8Array()) => {
    const id = `d${++n}`;
    files.set(id, { id, name, parents: [...parents], mimeType, data, version: 1, trashed: false, createdTime: new Date(clock += 1000).toISOString() });
    return files.get(id);
  };
  const meta = f => ({ id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents, version: String(f.version), size: f.mimeType === FOLDER ? undefined : String(f.data.length), createdTime: f.createdTime, modifiedTime: f.createdTime, trashed: f.trashed });
  const json = (o, status = 200) => ({ status, headers: { 'content-type': 'application/json' }, body: new TextEncoder().encode(JSON.stringify(o)) });
  const text = (s, status) => ({ status, headers: { 'content-type': 'text/plain' }, body: new TextEncoder().encode(s) });

  function parseMultipart(body, ctype) {
    const boundary = /boundary=([^;]+)/.exec(ctype)[1];
    const s = new TextDecoder('latin1').decode(body);
    const first = s.indexOf('\r\n\r\n') + 4; const metaEnd = s.indexOf(`\r\n--${boundary}`, first);
    const m = JSON.parse(new TextDecoder().decode(body.slice(first, metaEnd)));
    const mediaStart = s.indexOf('\r\n\r\n', metaEnd + 4) + 4; const mediaEnd = s.lastIndexOf(`\r\n--${boundary}--`);
    return { meta: m, media: body.slice(mediaStart, mediaEnd) };
  }
  function matches(f, qs) {
    if (!qs) return true;
    const parts = []; let cur = ''; let inQ = false;
    for (let i = 0; i < qs.length; i++) {
      const ch = qs[i];
      if (ch === '\\' && inQ) { cur += ch + qs[++i]; continue; }
      if (ch === "'") inQ = !inQ;
      if (!inQ && qs.startsWith(' and ', i)) { parts.push(cur); cur = ''; i += 4; continue; }
      cur += ch;
    }
    parts.push(cur);
    for (const part of parts) {
      const p = part.trim();
      let m;
      if (p === 'trashed=false') { if (f.trashed || isInTrashedFolder(f)) return false; continue; }
      if ((m = /^mimeType='(.+)'$/.exec(p))) { if (f.mimeType !== m[1]) return false; continue; }
      if ((m = /^mimeType!='(.+)'$/.exec(p))) { if (f.mimeType === m[1]) return false; continue; }
      if ((m = /^name='((?:[^'\\]|\\.)*)'$/.exec(p))) { if (f.name !== m[1].replace(/\\(.)/g, '$1')) return false; continue; }
      if ((m = /^'(.+)' in parents$/.exec(p))) { const par = m[1] === 'root' ? 'root' : m[1]; if (!f.parents.includes(par)) return false; continue; }
      throw new Error(`fake drive: query not understood: ${p}`);
    }
    return true;
  }

  function handle(method, url, headers, body) {
    const u = new URL(url);
    calls.push(`${method} ${u.pathname}${u.search.includes('alt=media') ? '?media' : ''}`);
    state.ops++;
    if ((headers.authorization ?? headers.Authorization) !== `Bearer ${state.token}`) return text('expired', 401);
    if (state.fail && (state.failAfter === null || state.ops > state.failAfter)) {
      const f = state.fail;
      if (f === 'quota') return text('{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}', 403);
      if (f === 'server') return text('oops', 500);
      if (typeof f === 'function') { const r = f(method, u); if (r) return r; }
    }
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const list = [...files.values()].filter(f => matches(f, u.searchParams.get('q')));
      list.sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
      return json({ files: list.map(meta) });
    }
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const b = JSON.parse(new TextDecoder().decode(body));
      return json(meta(add(b.name, b.parents ?? ['root'], b.mimeType)));
    }
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const { meta: m, media } = parseMultipart(body, headers['content-type']);
      const f = add(m.name, m.parents ?? ['root'], m.mimeType, media);
      if (opts.corruptUploads?.(f)) f.data = f.data.slice(0, Math.max(0, f.data.length - 1));
      return json(meta(f));
    }
    let m;
    if ((m = /^\/upload\/drive\/v3\/files\/(.+)$/.exec(u.pathname)) && method === 'PATCH') {
      const f = files.get(decodeURIComponent(m[1])); if (!f || f.trashed) return text('notFound', 404);
      const { media } = parseMultipart(body, headers['content-type']);
      f.data = media; f.version++;
      return json(meta(f));
    }
    if ((m = /^\/drive\/v3\/files\/(.+)\/copy$/.exec(u.pathname)) && method === 'POST') {
      const src = files.get(decodeURIComponent(m[1])); if (!src || src.trashed) return text('notFound', 404);
      const b = JSON.parse(new TextDecoder().decode(body));
      return json(meta(add(b.name ?? src.name, b.parents ?? src.parents, src.mimeType, src.data.slice())));
    }
    if ((m = /^\/drive\/v3\/files\/(.+)$/.exec(u.pathname))) {
      const f = files.get(decodeURIComponent(m[1])); if (!f) return text('notFound', 404);
      if (method === 'PATCH') {
        const b = body?.length ? JSON.parse(new TextDecoder().decode(body)) : {};
        const add2 = u.searchParams.get('addParents'); const rem = u.searchParams.get('removeParents');
        if (add2 || rem) f.parents = [...f.parents.filter(p => !(rem ?? '').split(',').includes(p)), ...(add2 && !f.parents.includes(add2) ? [add2] : [])];
        if (b.name !== undefined) f.name = b.name;
        if (b.trashed !== undefined) f.trashed = b.trashed;
        return json(meta(f));
      }
      if (f.trashed && u.searchParams.get('alt') === 'media') return text('notFound', 404);
      if (u.searchParams.get('alt') === 'media') return { status: 200, headers: { 'content-type': 'application/octet-stream' }, body: f.data };
      return json(meta(f));
    }
    return text('?', 400);
  }

  const fetchFn = async (url, init = {}) => {
    if (state.offline) throw new TypeError('offline');
    const headers = {}; for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = v;
    const body = init.body === undefined ? undefined : typeof init.body === 'string' ? new TextEncoder().encode(init.body) : new Uint8Array(init.body);
    const r = handle(init.method ?? 'GET', url, headers, body);
    return new Response(r.body, { status: r.status, headers: r.headers });
  };

  // helpers for tests
  const byName = name => [...files.values()].filter(f => f.name === name && !f.trashed);
  const pathOf = f => { const parts = [f.name]; let p = f.parents[0]; while (p && p !== 'root') { const x = files.get(p); if (!x) break; parts.unshift(x.name); p = x.parents[0]; } return parts.join('/'); };
  const live = () => [...files.values()].filter(f => !f.trashed && !isInTrashedFolder(f));
  const isInTrashedFolder = f => { let p = f.parents[0]; while (p && p !== 'root') { const x = files.get(p); if (!x) return false; if (x.trashed) return true; p = x.parents[0]; } return false; };
  const paths = () => live().filter(f => f.mimeType !== FOLDER).map(pathOf).sort();
  const textAt = path => { const f = live().find(x => pathOf(x) === path); return f ? new TextDecoder().decode(f.data) : undefined; };
  const fileAt = path => live().find(x => pathOf(x) === path);
  /** A person editing a file in Drive by hand. */
  const editByHand = (path, newText) => { const f = fileAt(path); f.data = new TextEncoder().encode(newText); f.version++; };
  return { files, calls, state, handle, fetchFn, add, byName, pathOf, paths, textAt, fileAt, editByHand, FOLDER };
}
