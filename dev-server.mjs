// Tiny local dev server: serves ./public and routes /api/* to the Vercel handlers.
// Usage: cp .env.example .env  (add your key)  &&  npm run dev
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// minimal .env loader
for (const f of ['.env', '.env.local']) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
    const file = path.join(root, 'api', `${name}.js`);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('no such api'); }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    const mod = await import(pathToFileURL(file).href);
    return mod.default(req, res);
  }
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, 'public', p);
  if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`Emotionally Unstable CMD running at http://localhost:${port}`);
  const ai = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'Vertex AI (service account)'
    : process.env.VERTEX_API_KEY ? 'Vertex AI (API key)' : process.env.GEMINI_API_KEY ? 'Gemini API (AI Studio)' : null;
  console.log(`AI: ${ai ? ai + ', model ' + (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite') : 'NOT CONFIGURED - offline drama mode'}`);
  console.log(`Leaderboard: ${process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL ? 'Upstash' : 'local browser storage'}`);
});
