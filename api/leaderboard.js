// Hall of Fame. Storage, first match wins:
//   1. Cloudflare KV binding `BOARD` (Workers deploy)
//   2. Upstash Redis REST (KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN, e.g. Vercel Marketplace)
//   3. none -> 501, and the browser falls back to localStorage.
// Platform-neutral core `leaderboard(method, body, vars)` returns { status, data }.

const ZKEY = 'eucmd:leaderboard';
const KV_KEY = 'leaderboard';
const KEEP = 100;

function clean(b) {
  if (typeof b === 'string') {
    try { b = JSON.parse(b || '{}'); } catch { b = {}; }
  }
  const name = String(b?.name || 'Anonymous').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Anonymous';
  const score = Math.round(Number(b?.score));
  if (!Number.isFinite(score) || score < 0 || score > 20000) return null;
  return {
    name, score,
    time: Math.round(Number(b?.time)) || 0,
    mood: Math.round(Number(b?.mood)) || 0,
    id: Math.random().toString(36).slice(2, 8),
  };
}

// ---- Cloudflare KV: one JSON array, sorted. Fine for a conference booth's write rate.
const kvStore = (kv) => ({
  async top(n) { return ((await kv.get(KV_KEY, 'json')) || []).slice(0, n); },
  async add(e) {
    const list = (await kv.get(KV_KEY, 'json')) || [];
    list.push(e);
    list.sort((a, b) => b.score - a.score);
    await kv.put(KV_KEY, JSON.stringify(list.slice(0, KEEP)));
  },
});

// ---- Upstash Redis REST: a sorted set.
const redisStore = (url, token) => {
  const redis = async (...cmd) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error || `redis ${r.status}`);
    return j.result;
  };
  return {
    async top(n) {
      const raw = await redis('ZREVRANGE', ZKEY, 0, n - 1, 'WITHSCORES');
      const out = [];
      for (let i = 0; i < raw.length; i += 2) {
        try {
          const m = JSON.parse(raw[i]);
          out.push({ name: m.n, time: m.t, mood: m.m, score: Number(raw[i + 1]) });
        } catch { /* skip malformed */ }
      }
      return out;
    },
    async add(e) {
      await redis('ZADD', ZKEY, e.score, JSON.stringify({ n: e.name, t: e.time, m: e.mood, id: e.id }));
    },
  };
};

function store(vars) {
  if (vars?.BOARD && typeof vars.BOARD.get === 'function') return kvStore(vars.BOARD);
  const url = vars?.KV_REST_API_URL || vars?.UPSTASH_REDIS_REST_URL;
  const token = vars?.KV_REST_API_TOKEN || vars?.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? redisStore(url, token) : null;
}

export async function leaderboard(method, body, vars) {
  const db = store(vars);
  if (!db) return { status: 501, data: { error: 'not_configured' } };
  try {
    if (method === 'GET') return { status: 200, data: { scores: await db.top(10) } };
    if (method === 'POST') {
      const e = clean(body);
      if (!e) return { status: 400, data: { error: 'bad score' } };
      await db.add(e);
      return { status: 200, data: { scores: await db.top(10) } };
    }
    return { status: 405, data: { error: 'GET or POST' } };
  } catch (err) {
    console.error('leaderboard failed', err?.message);
    return { status: 502, data: { error: 'failed' } };
  }
}

// Vercel / Node adapter (also used by dev-server.mjs).
export default async function handler(req, res) {
  const { status, data } = await leaderboard(req.method, req.body, process.env);
  return res.status(status).json(data);
}
