# Emotionally Unstable CMD

A fake Windows 7 desktop whose Command Prompt is a dramatic theatre kid with no emotional
stability. You're the new IT admin in 2009. Close 6 IT tickets using real `cmd` syntax, and be
nice to CMD while you do it. Upset it and it sabotages your commands, refuses, sulks, throws
popups and minimizes itself. If its mood hits 0%, you get a blue screen of death.

Gemini (via **Vertex AI**) judges your tone and writes CMD's lines. Without credentials the game
still works using a built-in offline drama engine.

- No build step and no dependencies. The site is plain HTML/CSS/ES modules in `public/`.
- `api/cmd.js` is a Vercel function that calls Gemini on Vertex AI, so credentials never reach the
  browser. It also accepts a plain Gemini API (AI Studio) key.
- `api/leaderboard.js` is a Vercel function backed by Upstash Redis. If Redis isn't configured,
  the Hall of Fame falls back to the browser's localStorage.

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

## Deploy to Vercel

1. Push this folder to a Git repo and **Import** it in Vercel.
2. Framework preset: **Other**. Leave the build command and output directory empty. Vercel
   serves `public/` as static files and `api/*.js` as serverless functions automatically.
3. **Settings → Environment Variables**:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` (or `VERTEX_API_KEY`), see **AI setup** above.
   - `GEMINI_MODEL` (optional): overrides the default `gemini-3.5-flash-lite`.
4. Shared leaderboard (optional): **Storage / Marketplace → Upstash → Redis**, then connect it to
   the project. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` (the `UPSTASH_REDIS_REST_*`
   names work too). Redeploy afterwards.

Or use the CLI: `npx vercel`, then `npx vercel env add GOOGLE_SERVICE_ACCOUNT_JSON`, then `npx vercel --prod`.

### Caveats

- `/api/cmd` is an open proxy that spends your Vertex AI credits. Inputs are length-limited, but
  there is no rate limiting. Set a **budget alert** in Cloud Billing and add Vercel Firewall rate
  limiting for a public event.
- Scores are computed in the browser, so they can be faked. It's a conference toy.

## How to play / cheat sheet

The sticky note shows the exact commands. Say **please**, and keep the gauge above 60% so CMD
just does what you ask.

| Ticket | Solution |
|---|---|
| #101 Bonzi | `please taskkill /im bonzibuddy.exe` |
| #102 Ask toolbar | `please reg delete HKCU\Software\AskToolbar` |
| #103 LimeWire | `please cd Downloads`, then `please del Linkin` + **Tab** |
| #104 Flash nag | `please reg add HKLM\Software\Macromedia\FlashPlayer /v UpdateNagCount /d 0 /f` |
| #105 MySpace | `please ping myspace-server` |
| #106 Floppy | `please format a:`, then press **Enter** |

**Raising the mood:** `PET`, `HUG`, `TEA chamomile`, `SNACK <food>`, `APPLAUD`/`BRAVO`, `ENCORE`,
`COMPLIMENT <something specific and theatrical>`, or simply talking to it ("sorry, you're
wonderful"). Spamming the same one makes CMD suspicious. Coffee is a mistake.

**Lowering the mood:** bare commands, typos, ALL CAPS, insults, and any mention of PowerShell,
Linux, bash, sudo or Mac. Typing `exit`, `shutdown`, `format c:` or `taskkill /im cmd.exe` counts as betrayal.

**Mood effects:** at 60% or above CMD always complies. Below that it may **sabotage** (do the
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
api/leaderboard.js    Upstash Redis leaderboard
dev-server.mjs        local dev server that mimics Vercel
```

Visuals are an original CSS homage. No Microsoft assets are used.
