# Emotionally Unstable CMD

A fake Windows 7 desktop whose Command Prompt is a dramatic theatre kid with no emotional
stability. You're the new IT admin in 2009. Close 6 IT tickets using real `cmd` syntax, and be
nice to CMD while you do it. Upset it and it sabotages your commands, refuses, sulks, throws
popups and minimizes itself. If its mood hits 0%, you get a blue screen of death.

Gemini (via **Vertex AI**) judges your tone and writes CMD's lines. Without credentials the game
still works using a built-in offline drama engine.

- No build step and no runtime dependencies. The site is plain HTML/CSS/ES modules in `public/`.
- `api/cmd.js` is a Vercel function that calls Gemini on Vertex AI, so credentials never reach the
  browser. It also accepts a plain Gemini API (AI Studio) key.
- `api/leaderboard.js` stores the Hall of Fame in Cloudflare KV or Upstash Redis. If neither is
  configured, it falls back to the browser's localStorage.
- Deploys to **Cloudflare Workers** (`wrangler.jsonc`, `src/worker.js`) or to Vercel.

## Run locally

```bash
cp .env.example .env      # add AI credentials (optional; offline mode works without them)
npm run check-ai          # one test call: prints provider, latency and CMD's reaction
npm run dev               # http://localhost:3000  (PORT=xxxx to change)
```

## AI setup (Vertex AI)

The default model is `gemini-3.5-flash-lite` on the `global` location, with thinking set to
`MINIMAL`. It replies in about 1s. `GEMINI_MODEL=gemini-3.8-flash` is a bit sharper but takes 2–3s
(it uses thinking `LOW`, because it rejects `MINIMAL`). If a model rejects the thinking setting, the
request is retried without it. (`gemini-2.5-flash` was retired on Vertex in Oct 2026.)

**Option A: service account (recommended; bills your project, so credits apply)**

1. In Google Cloud console, select the project that has the credits and enable the **Agent Platform API** (`aiplatform.googleapis.com`, formerly "Vertex AI API").
2. Go to **IAM & Admin → Service Accounts → Create**. Give it the role **Agent Platform User**
   (`roles/aiplatform.user`, formerly "Vertex AI User"), nothing more.
3. Open the account, then **Keys → Add key → JSON**, and download the file.
4. Local dev: set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json` in `.env`.
   Vercel: set `GOOGLE_SERVICE_ACCOUNT_JSON` to the file's contents (paste the JSON, or
   `base64 -w0 key.json`).
5. Optional: `VERTEX_PROJECT` (defaults to the key's `project_id`) and `VERTEX_LOCATION`
   (default `global`).

If your org blocks service-account key creation (`iam.disableServiceAccountKeyCreation`), use
Option B.

**Option B: Vertex AI API key (express mode).** Create a key in the Vertex AI console and set
`VERTEX_API_KEY`.

**Option C: AI Studio.** Set `GEMINI_API_KEY` (this does not use Cloud credits).

Never commit key files. `.gitignore` covers the usual names, but double-check.

Needs Node 18+. `dev-server.mjs` serves `public/` and routes `/api/<name>` to `api/<name>.js`,
just like Vercel does.

## Deploy to Cloudflare Workers (recommended)

`src/worker.js` serves `public/` as static assets and routes `/api/*`. The Hall of Fame uses
Cloudflare KV, and `/api/cmd` has a free per-IP rate limit (120/min) to protect your Vertex
credits. All of this is configured in `wrangler.jsonc`.

```bash
npm install                                   # installs wrangler (dev dependency)
npx wrangler login                            # once; opens the browser
npx wrangler kv namespace create BOARD        # paste the printed id into wrangler.jsonc
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON < gcp-service-account.json
npm run deploy                                # -> https://emotionally-unstable-cmd.<you>.workers.dev
```

To test in the Workers runtime locally, put
`GOOGLE_SERVICE_ACCOUNT_JSON=<base64 of the key file>` in `.dev.vars` (gitignored) and run
`npm run cf:dev`. `npm run dev` (plain Node) also still works.

## Deploy to Vercel (alternative)

The same `api/*.js` files work as Vercel functions with no changes.

1. Import the repo in Vercel. Framework preset: **Other**. Leave the build command empty.
2. Set the env var `GOOGLE_SERVICE_ACCOUNT_JSON` (or `VERTEX_API_KEY`). See **AI setup** above.
3. Shared leaderboard (optional): Marketplace → Upstash Redis. It sets `KV_REST_API_URL`/`KV_REST_API_TOKEN`.

### Caveats

- `/api/cmd` is a public endpoint that spends your Vertex AI credits. On Cloudflare it's
  rate-limited per IP, but a determined abuser can still use it. Set a **budget alert** in Cloud
  Billing.
- Scores are computed in the browser, so they can be faked. It's a conference toy.

## How to play / cheat sheet

The sticky note shows the exact commands. Say **please**, and keep the gauge above 60% so CMD
just does what you ask.

| Ticket | Solution |
|---|---|
| #101 Bonzi | `please taskkill /im bonzibuddy.exe` |
| #102 Ask toolbar | `please reg delete HKCU\Software\AskToolbar` (also stops the "HOT Google Developers in your area" ads) |
| #103 LimeWire | `please cd Downloads`, then `please del Linkin` + **Tab** |
| #104 Flash nag | `please reg add HKLM\Software\Macromedia\FlashPlayer /v UpdateNagCount /d 0 /f` |
| #105 MySpace | `please ping myspace-server` |
| #106 Floppy | `please format a:`, then press **Enter** |

**Raising the mood:** `PET`, `HUG`, `TEA chamomile`, `SNACK <food>`, `APPLAUD`/`BRAVO`, `ENCORE`,
`COMPLIMENT <something specific and theatrical>`, or simply talking to it ("sorry, you're
wonderful"). Spamming the same one makes CMD suspicious. Coffee is a mistake.

**Lowering the mood:** bare commands, typos, ALL CAPS, insults, and any mention of PowerShell,
Linux, bash, sudo or Mac. Typing `exit`, `shutdown`, `format c:` or `taskkill /im cmd.exe` counts as betrayal.

**Mood effects:** at 60% or above CMD almost always complies. It still has the occasional diva
moment and refuses (10% of actions, 6% of read-only commands, never twice in a row), so just ask
again. A ticket command asked politely costs at most 3 mood points, even for poor Bonzi. Below that it may **sabotage** (do the
wrong thing on purpose, for example killing explorer.exe instead of Bonzi) or **refuse**. Below
30% it may give you the silent treatment. Below 15% it may minimize itself; click the flashing
taskbar button to bring it back. At 0% you get a BSOD.

**Score** = 2000 + speed bonus (5000 − 12 per second) + mood × 30 − 250 per sabotage.

Extra commands: `dir`, `cd`, `type`, `tasklist`, `reg query`, `ipconfig`, `whoami`, `color 0a`,
`title`, `echo`, `ver`, `cls`, `help`. Try `type C:\Windows\System32\cmd_diary.txt`.

## Files

```
public/index.html     screens and DOM
public/style.css      Aero styling, gauge, popups, BSOD, mobile layout
public/js/main.js     game loop, terminal, mood, tantrums, tickets, scoring
public/js/shell.js    cmd parser → plan {kind, run, sabotage}
public/js/world.js    fake filesystem, registry, processes, tickets
public/js/brain.js    /api/cmd client and offline drama engine
public/js/sound.js    WebAudio synth sound effects
api/cmd.js            Gemini on Vertex AI (persona, mood rules, service-account auth)
scripts/check-ai.mjs  one-shot test of the AI credentials
api/leaderboard.js    leaderboard (Cloudflare KV or Upstash Redis)
src/worker.js         Cloudflare Workers entry (assets + /api routes + rate limit)
wrangler.jsonc        Cloudflare config (KV, rate limit, assets)
dev-server.mjs        local dev server that mimics Vercel
```

Visuals are an original CSS homage. No Microsoft assets are used.
