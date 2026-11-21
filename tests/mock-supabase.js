/* Tiny in-memory stand-in for the two Supabase RPC endpoints in supabase/schema.sql.
   POST /rest/v1/rpc/pull {p_code, p_since} and POST /rest/v1/rpc/push {p_code, p_items}, with CORS.
   Usage: node tests/mock-supabase.js [port]   or   require('./mock-supabase').start(port) */
const http = require('http');

function createServer() {
  const rows = new Map(); // `${code}\u0000${id}` -> row
  let lastTs = 0;
  const stats = { pull: 0, push: 0 };
  function serverNow() { lastTs = Math.max(Date.now(), lastTs + 1); return new Date(lastTs).toISOString(); }
  function badCode(code) { return typeof code !== 'string' || code.length < 20 || code.length > 128; }

  const server = http.createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info, prefer'
    };
    const send = (status, body) => { res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(body)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const m = req.url.match(/^\/rest\/v1\/rpc\/(pull|push)$/);
    if (req.method !== 'POST' || !m) return send(404, { message: 'not found' });
    if (!req.headers.apikey || !/^Bearer .+/.test(req.headers.authorization || '')) return send(401, { message: 'missing apikey' });
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body; try { body = JSON.parse(raw || '{}'); } catch (e) { return send(400, { message: 'bad json' }); }
      if (badCode(body.p_code)) return send(400, { code: '22023', message: 'invalid couple code' });
      const code = body.p_code;
      if (m[1] === 'pull') {
        stats.pull++;
        const since = body.p_since ? Date.parse(body.p_since) : null;
        const out = [];
        rows.forEach((r, k) => { if (k.startsWith(code + '\u0000') && (since == null || Date.parse(r.synced_at) > since)) out.push(r); });
        out.sort((a, b) => Date.parse(a.synced_at) - Date.parse(b.synced_at));
        return send(200, out.slice(0, 5000).map((r) => JSON.parse(JSON.stringify(r))));
      }
      stats.push++;
      if (!Array.isArray(body.p_items)) return send(400, { message: 'p_items must be a JSON array' });
      if (body.p_items.length > 500) return send(400, { message: 'too many items' });
      const kinds = ['prayer', 'gratitude', 'reminder', 'reading', 'settings', 'activity'];
      const ts = serverNow();
      let n = 0;
      body.p_items.forEach((x) => {
        if (!x || !x.id || !kinds.includes(x.kind) || !x.updated_at) return;
        const k = code + '\u0000' + x.id;
        const cur = rows.get(k);
        if (cur && !(Date.parse(x.updated_at) > Date.parse(cur.updated_at))) return; // last write wins
        rows.set(k, { id: x.id, kind: x.kind, data: x.data || {}, updated_at: new Date(Date.parse(x.updated_at)).toISOString(), deleted: !!x.deleted, synced_at: ts });
        n++;
      });
      return send(200, n);
    });
  });
  return { server, rows, stats };
}

function start(port) {
  const s = createServer();
  return new Promise((resolve) => s.server.listen(port, '127.0.0.1', () => resolve(s)));
}

module.exports = { createServer, start };
if (require.main === module) {
  const port = Number(process.argv[2] || 8799);
  start(port).then(() => console.log('mock supabase on http://127.0.0.1:' + port));
}
