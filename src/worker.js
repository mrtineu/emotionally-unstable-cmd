// Cloudflare Workers entry: static files from public/ (assets binding) + the two API routes.
import { cmd } from '../api/cmd.js';
import { leaderboard } from '../api/leaderboard.js';

const json = (status, data) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/cmd') {
      if (request.method !== 'POST') return json(405, { error: 'POST only' });
      // /api/cmd spends Vertex credits: cap each IP. Generous, since a whole booth may share one NAT IP.
      if (env.CMD_LIMITER) {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const { success } = await env.CMD_LIMITER.limit({ key: ip });
        if (!success) return json(429, { error: 'rate_limited' });
      }
      const body = await request.text();
      if (body.length > 8000) return json(413, { error: 'too large' });
      const { status, data } = await cmd(body, env);
      return json(status, data);
    }

    if (url.pathname === '/api/leaderboard') {
      const body = request.method === 'POST' ? await request.text() : null;
      if (body && body.length > 2000) return json(413, { error: 'too large' });
      const { status, data } = await leaderboard(request.method, body, env);
      return json(status, data);
    }

    if (url.pathname.startsWith('/api/')) return json(404, { error: 'no such api' });
    return env.ASSETS.fetch(request);
  },
};
