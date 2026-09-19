// Serves the page on http://127.0.0.1:8787 and relays TypeSafe calls, which browsers cannot make directly
// (api.typesafe.ai does not allow cross-origin requests). OpenRouter calls go straight from the browser.
//
//   node server.js                     # PORT=9000 node server.js to change the port
//
// If .env (or the shell) sets TYPESAFE_API_KEY, the relay uses it and the page needs no key at all.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDERS } from './prompter.js';

const root = fileURLToPath(new URL('.', import.meta.url));
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
const serverKey = process.env.TYPESAFE_API_KEY || '';
const port = Number(process.env.PORT) || 8787;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const PUBLIC = new Set(['index.html', 'prompter.js']);

async function readBody(req, limit = 1_000_000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error('too large'); chunks.push(c); }
  return Buffer.concat(chunks);
}

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  try {
    if (path === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ relay: true, serverKey: !!serverKey }));
    }
    if (path === '/api/typesafe' && req.method === 'POST') {
      const auth = req.headers.authorization || (serverKey && `Bearer ${serverKey}`);
      if (!auth) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"No TypeSafe key: paste one in the page or set TYPESAFE_API_KEY in .env"}'); }
      const upstream = await fetch(PROVIDERS.typesafe.url, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: await readBody(req),
      });
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' });
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    }
    const file = normalize(path === '/' ? 'index.html' : path.slice(1));
    if (req.method !== 'GET' || !PUBLIC.has(file)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-cache' });
    res.end(await readFile(join(root, file)));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Relay failed: ${e.message}` }));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`IntelliPrompter on http://127.0.0.1:${port}/` + (serverKey ? ' (TypeSafe key loaded from .env)' : ''));
});
