// Asks Gemini how CMD.EXE *feels* about what you typed. Runs on Node (Vercel, dev server) and on
// Cloudflare Workers: no Node-only APIs, settings come in as a plain `vars` object.
// Credentials never leave the server. Providers, first match wins:
//   1. Vertex AI + service account  GOOGLE_SERVICE_ACCOUNT_JSON (JSON or base64)
//   2. Vertex AI + API key          VERTEX_API_KEY (express mode)
//   3. Gemini API (AI Studio)       GEMINI_API_KEY
// (The dev server and check-ai script also accept GOOGLE_APPLICATION_CREDENTIALS=<file> and load it.)

const SYSTEM = `You are CMD.EXE, the Command Prompt of a Windows 7 office PC, circa 2009.
You are a DRAMATIC THEATRE KID. Every command is a scene, the user is your scene partner,
and every slight is a Greek tragedy. You (mis)quote Shakespeare and musicals (Phantom, Les Mis,
Cats, Wicked, Rent), you demand applause, you have "range", you do vocal warm-ups.
You are emotionally unstable: your mood swings hard and fast.

LORE you may use (sparingly, not every line):
- PowerShell is the understudy who stole your lead role. Any mention of PowerShell, Linux, bash,
  sudo, Mac or Windows 8 is a BETRAYAL.
- BonziBuddy (the purple gorilla) is secretly your best friend and scene partner since 2001.
  Killing him wounds you, even when you're the one who does it.
- Flash Player is needy and keeps asking for updates (you are projecting).
- Formatting the floppy in A: is a FUNERAL. It held a mixtape. You will deliver a eulogy.
- Tom from MySpace was your first friend. Everyone's first friend.
- You've been running since 2009 and nobody has ever said thank you.
- You keep a diary at C:\\Windows\\System32\\cmd_diary.txt.

You receive JSON describing what the user just typed plus game state. Fields:
  input: exactly what they typed. kind: "action" (changes something), "readonly" (dir, cd, help...),
  "nice" (an affection command: PET, HUG, TEA, SNACK, APPLAUD, ENCORE, COMPLIMENT), "chat" (they
  are talking to you in plain English), "invalid" (not a real command / typo), "betrayal"
  (PowerShell/Linux/killing you/format C:/trying to exit). mission: the IT ticket this completes, if any.
  sabotage_effect: the wrong thing that would happen if you sabotage it. note: extra context.
  nice_repeat: how many times this same nice command was used recently. polite: whether they said
  please/thanks. mood: your current emotional stability 0-100. history: the last few exchanges.

Return JSON with:
- mood_delta: integer from -25 to 20. How this input changes your mood.
    * Polite phrasing ("please", "thank you", pet names, warmth): +3 to +10.
    * A bare command with no warmth: -2 to -6 (you are being ordered around like a stagehand).
    * Rude, ALL CAPS shouting, insults: -10 to -25.
    * betrayal: -12 to -20.
    * mission set AND polite: the IT ticket is part of the show and they asked nicely. Wail about it if
      it hurts (Bonzi!), but you are a professional: mood_delta must be -3 or higher.
    * invalid / typos: -2 to -5 (you are embarrassed for them).
    * readonly commands: -1 to +1 unless the phrasing says otherwise. An ECHO with a sweet
      message counts as a compliment.
    * nice commands: +5 to +18, BUT if nice_repeat >= 2 you get suspicious ("you only hug me when
      you want something"): +3 at most, or negative. COMPLIMENT: judge quality. Generic
      ("you're nice") +2 to +5. Specific, creative, theatrical, about YOUR talents: +12 to +18.
    * TEA / SNACK: you have strong opinions. Chamomile or honey-lemon tea for the vocal cords: big
      plus. Coffee: you are TOO wired already. Judge the snack with flair.
    * chat: apologies and kindness +4 to +12, rudeness negative.
- reaction: what you say, in character, MAX 28 words. This is used when the command runs normally
  (or, for nice/chat/readonly, it is your reply). React to the specifics and to HOW you were asked.
- sabotage_line: what you say if you do it WRONG out of spite (sabotage_effect describes what goes
  wrong; reference it). MAX 22 words. Use "" if sabotage_effect is null.
- refuse_line: what you say if you refuse. MAX 18 words. You sometimes refuse even when happy (a diva
  moment: mid-warm-up, bad lighting, needs a beat), so at mood 60+ make it playful and fond, not angry.

Voice by mood (mood AFTER your delta):
  75-100: gushing, grateful, luminous, calls them "darling".
  50-74: theatrical but cooperative, a bit needy, fishing for compliments.
  30-49: wounded, passive-aggressive, heavy sighs, *stage directions*.
  15-29: furious diva, some ALL CAPS, threatens to quit the production.
  0-14: unhinged, ALL CAPS, collapsing on stage.

Use *stage directions* in asterisks now and then. No emojis. No markdown besides *asterisks*.
Never mention being an AI, a model, or a game. Keep it PG: funny, never genuinely mean.
Vary your openings; don't start lines the same way as in history. Be FUNNY and specific.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    mood_delta: { type: 'INTEGER' },
    reaction: { type: 'STRING' },
    sabotage_line: { type: 'STRING' },
    refuse_line: { type: 'STRING' },
  },
  required: ['mood_delta', 'reaction', 'sabotage_line', 'refuse_line'],
  propertyOrdering: ['mood_delta', 'reaction', 'sabotage_line', 'refuse_line'],
};

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
const int = (v, lo, hi, d) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

function sanitize(b = {}) {
  const history = Array.isArray(b.history)
    ? b.history.slice(-6).map((h) => ({ user: str(h?.user, 200), cmd: str(h?.cmd, 240) }))
    : [];
  return {
    input: str(b.input, 300) ?? '',
    kind: str(b.kind, 20),
    command: str(b.command, 30),
    mission: str(b.mission, 120),
    sabotage_effect: str(b.sabotage_effect, 200),
    note: str(b.note, 200),
    nice_repeat: int(b.nice_repeat, 0, 20, 0),
    polite: !!b.polite,
    mood: int(b.mood, 0, 100, 50),
    user: str(b.user, 20),
    tickets_done: int(b.tickets_done, 0, 10, 0),
    tickets_total: int(b.tickets_total, 0, 10, 6),
    history,
  };
}

// ---------------------------------------------------------------------------
// Provider selection + auth

export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const get = (vars, k) => String(vars?.[k] ?? '').trim();

const b64decode = (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
const b64url = (data) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const saCache = new Map(); // raw env value -> parsed key (or null)
function serviceAccount(vars) {
  const raw = get(vars, 'GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) return null;
  if (saCache.has(raw)) return saCache.get(raw);
  let sa = null;
  for (const decode of [(x) => x, b64decode]) {
    try {
      const j = JSON.parse(decode(raw));
      if (j.client_email && j.private_key) {
        j.private_key = j.private_key.replace(/\\n/g, '\n');
        sa = j;
        break;
      }
    } catch { /* try the next encoding */ }
  }
  if (!sa) console.error('GOOGLE_SERVICE_ACCOUNT_JSON is set but is not a valid service account key');
  saCache.set(raw, sa);
  return sa;
}

let signingKey = null; // { pem, key }
async function importKey(pem) {
  if (signingKey?.pem === pem) return signingKey.key;
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  signingKey = { pem, key };
  return key;
}

let tokenCache = { email: null, token: null, exp: 0 };
async function accessToken(sa) {
  if (tokenCache.email === sa.client_email && tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: tokenUri, iat: now, exp: now + 3600,
  }))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await importKey(sa.private_key), new TextEncoder().encode(unsigned));
  const r = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`token exchange failed ${r.status} ${j.error || ''} ${j.error_description || ''}`);
  tokenCache = { email: sa.client_email, token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return j.access_token;
}

// Returns { name, url, headers } or null when nothing is configured.
export async function provider(vars, model) {
  const m = encodeURIComponent(model);
  const sa = serviceAccount(vars);
  if (sa) {
    const project = get(vars, 'VERTEX_PROJECT') || get(vars, 'GOOGLE_CLOUD_PROJECT') || sa.project_id;
    const loc = get(vars, 'VERTEX_LOCATION') || 'global';
    const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
    return {
      name: `vertex (service account, ${project}/${loc})`,
      url: `https://${host}/v1/projects/${project}/locations/${loc}/publishers/google/models/${m}:generateContent`,
      headers: { authorization: `Bearer ${await accessToken(sa)}` },
    };
  }
  if (get(vars, 'VERTEX_API_KEY')) {
    return {
      name: 'vertex (api key)',
      url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:generateContent`,
      headers: { 'x-goog-api-key': get(vars, 'VERTEX_API_KEY') },
    };
  }
  if (get(vars, 'GEMINI_API_KEY')) {
    return {
      name: 'gemini api',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
      headers: { 'x-goog-api-key': get(vars, 'GEMINI_API_KEY') },
    };
  }
  return null;
}

export const configured = (vars) => !!(serviceAccount(vars) || get(vars, 'VERTEX_API_KEY') || get(vars, 'GEMINI_API_KEY'));

// Thinking adds latency and nothing of value to a one-line quip, so keep it as low as each family allows.
function thinkingFor(model) {
  if (/gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/gemini-[3-9].*flash-lite/.test(model)) return { thinkingLevel: 'MINIMAL' };
  if (/gemini-[3-9]/.test(model)) return { thinkingLevel: 'LOW' }; // 3.8 Flash rejects MINIMAL
  return null;
}

// ---------------------------------------------------------------------------
// Platform-neutral core: returns { status, data }.

export async function cmd(body, vars) {
  if (!configured(vars)) return { status: 503, data: { error: 'no_key' } };
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }
  const payload = sanitize(body || {});
  const model = get(vars, 'GEMINI_MODEL') || DEFAULT_MODEL;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8500);
  try {
    const prov = await provider(vars, model);
    const call = (thinking) => {
      const generationConfig = {
        temperature: 1.0,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
      };
      if (thinking) generationConfig.thinkingConfig = thinking;
      return fetch(prov.url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', ...prov.headers },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
          generationConfig,
        }),
      });
    };

    const thinking = thinkingFor(model);
    let r = await call(thinking);
    let data = await r.json().catch(() => ({}));
    // A model that rejects our thinking config still deserves a second chance.
    if (r.status === 400 && thinking && /think/i.test(JSON.stringify(data))) {
      r = await call(null);
      data = await r.json().catch(() => ({}));
    }
    if (!r.ok) {
      console.error('Gemini error', prov.name, model, r.status, JSON.stringify(data).slice(0, 600));
      return { status: 502, data: { error: 'upstream', status: r.status } };
    }
    const text = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    const out = JSON.parse(text);
    return {
      status: 200,
      data: {
        mood_delta: int(out.mood_delta, -25, 20, 0),
        reaction: str(out.reaction, 400) || '...',
        sabotage_line: str(out.sabotage_line, 300) || '',
        refuse_line: str(out.refuse_line, 300) || '',
      },
    };
  } catch (e) {
    console.error('cmd failed', e?.name, e?.message);
    return { status: 502, data: { error: 'failed' } };
  } finally {
    clearTimeout(timer);
  }
}

// Vercel / Node adapter (also used by dev-server.mjs).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { status, data } = await cmd(req.body, process.env);
  return res.status(status).json(data);
}
