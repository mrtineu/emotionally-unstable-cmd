// Vercel serverless function: shared leaderboard on Upstash Redis (REST API, no dependencies).
// Connect "Upstash for Redis" from the Vercel Marketplace and the env vars appear automatically.
// Without them this returns 501 and the game falls back to a per-browser leaderboard.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = process.env.LEADERBOARD_KEY || 'eucmd:leaderboard';

async function redis(...cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `redis ${r.status}`);
  return j.result;
}

async function top(n = 10) {
  const raw = await redis('ZREVRANGE', KEY, 0, n - 1, 'WITHSCORES');
  const out = [];
  for (let i = 0; i < raw.length; i += 2) {
    try {
      const m = JSON.parse(raw[i]);
      out.push({ name: m.n, time: m.t, mood: m.m, score: Number(raw[i + 1]) });
    } catch { /* skip malformed */ }
  }
  return out;
}

export default async function handler(req, res) {
  if (!URL_ || !TOKEN) return res.status(501).json({ error: 'not_configured' });
  try {
    if (req.method === 'GET') return res.status(200).json({ scores: await top() });
    if (req.method === 'POST') {
      let b = req.body;
      if (typeof b === 'string') b = JSON.parse(b || '{}');
      const name = String(b?.name || 'Anonymous').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Anonymous';
      const score = Math.round(Number(b?.score));
      const time = Math.round(Number(b?.time));
      const mood = Math.round(Number(b?.mood));
      if (!Number.isFinite(score) || score < 0 || score > 20000) return res.status(400).json({ error: 'bad score' });
      const member = JSON.stringify({ n: name, t: time || 0, m: mood || 0, id: Math.random().toString(36).slice(2, 8) });
      await redis('ZADD', KEY, score, member);
      return res.status(200).json({ scores: await top() });
    }
    return res.status(405).json({ error: 'GET or POST' });
  } catch (e) {
    console.error('leaderboard failed', e?.message);
    return res.status(502).json({ error: 'failed' });
  }
}
