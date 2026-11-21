# Emotionally Unstable CMD: handoff for the next agent

## What this is
A conference joke game (Google Developer conference, "2000s / angry loading page" challenge).
It shows a fake **Windows 7 desktop** with a **Command Prompt that is an emotionally unstable,
dramatic theatre kid**. The player is a 2009-era IT admin who must clear **6 IT tickets** using
**real cmd syntax**, but has to be *nice* to CMD. If CMD is upset, it sabotages commands, refuses,
throws tantrums, and at 0% mood → **BSOD**. Gemini judges tone and writes the dramatic lines.
It must deploy as a static site plus serverless functions on **Vercel**.

## User's decisions (from the Q&A rounds; don't re-ask)
| Topic | Choice |
|---|---|
| Personality | **Dramatic theatre kid** (Shakespeare, musicals, demands applause, everything is a tragedy) |
| Anger effects | **All**: does commands wrong (sabotage), visual tantrums (shake, red text, popups, self-minimize), refuses/sulks (silent treatment), **BSOD at 0** |
| Being nice | **Fake nice commands + AI judging tone**: PET, HUG, COMPLIMENT <text>, TEA <kind>, SNACK <food>, APPLAUD (CLAP/BRAVO), ENCORE; "please" works on any command |
| Mood meter | **In-world**: Win7 sidebar gadget "Emotional Resource Monitor" (dial gauge) |
| Tickets | **2000s nostalgia**: Bonzi + IE toolbars, LimeWire + Flash, Ping MySpace + format A: |
| Win7 UI | **Boot screen + login + full desktop** (Aero glass, taskbar, start orb, icons, gadgets) |
| Win/score | **Score + leaderboard**, shared via **Upstash Redis**, local fallback |
| Language | **English** |
| AI | **Gemini direct** (key in a Vercel function, never in the browser) |
| Sound | **Retro synth sounds** (WebAudio, original, not Microsoft samples). No TTS. |
| Length | **~3-5 min** per run |
| Syntax | **Real cmd syntax** (deterministic). Ticket hints show the exact commands. |

## Files: status
```
package.json          DONE  type:module, "npm run dev" -> dev-server.mjs, no dependencies
.gitignore            DONE
.env.example          DONE  GEMINI_API_KEY, GEMINI_MODEL, KV_REST_API_URL/TOKEN
dev-server.mjs        DONE  serves ./public, routes /api/<name> to api/<name>.js, emulates res.status().json(), loads .env
api/cmd.js            DONE  Gemini proxy. System prompt = persona + mood_delta rules. responseSchema JSON:
                            {mood_delta:int, reaction, sabotage_line, refuse_line}. Default model gemini-2.5-flash
                            (thinkingBudget 0 for 2.5-flash). 9s timeout. 503 {error:'no_key'} if no key.
api/leaderboard.js    DONE  Upstash REST via fetch (ZADD/ZREVRANGE on key eucmd:leaderboard). GET -> {scores:[{name,score,time,mood}]}
                            POST {name,score,time,mood}. 501 if not configured -> client uses localStorage.
public/index.html     DONE  All screens + DOM ids (see below)
public/style.css      DONE  Aero styling, boot orbs, gauge, sticky note, popups, BSOD, start menu, mobile layout
public/js/world.js    DONE  createWorld(user), MISSIONS, resolvePath, lookup, fmtPath, normKey, prettyKey, keyExists, subKeys
public/js/shell.js    DONE  plan(raw, world), tokenize, stripPolite, NICE, HELP text
public/js/brain.js    DONE  judge(payload) -> /api/cmd with offline fallback; lastSource; canned line pools
                            IDLE_LINES, RETURN_LINES, CLOSE_LINES, BONZI_LINES
public/js/sound.js    DONE  unlock(), toggleMute(), isMuted(), sfx.{startup,ding,good,bad,ticket,popup,applause,bsod,key,win}
public/js/main.js     DONE  implemented per spec below; headless-tested (6 tickets, sabotage, refuse, sulk, minimize, popups, BSOD, HOF, 390px mobile)
README.md             DONE  setup, Vercel deploy, cheat sheet
```
All files pass `node --check`. Playwright tests live in the session scratchpad (not in the project).
Fixes made while testing: LimeWire ticket check now matches any `linkin_park_numb_real_not_virus*` name (so the .exe.exe sabotage no longer closes it);
ticket hints are visible on mobile; Bonzi colored via sepia+hue-rotate; busy cursor sits at the left.
**Remaining: step 4 below (live Gemini test + model check).**

## Key contracts (read the files for detail)

### `plan(raw, world)` (shell.js) returns
```js
{ raw, name, polite,               // polite = "please"/"thanks" etc. was stripped
  kind: 'local'|'readonly'|'action'|'nice'|'chat'|'invalid'|'betrayal',
  mission: 'bonzi'|'ask'|'limewire'|'flash'|'myspace'|'floppy'|null,
  note,                             // extra context string for the AI
  niceType,                         // for kind 'nice': pet|hug|tea|snack|applaud|encore|compliment
  run: async (io) => {},            // the normal (complying) execution
  sabotage: { effect: 'text for AI', run: async (io) => {} } | null }
```
`local` is only `cls`, so don't call the AI for it. `betrayal` (PowerShell/Linux/sudo/exit/shutdown/taskkill cmd.exe/format c:) always gets refused, but its `run` prints the denial text.

### `io` object main.js must provide to `run()`
```js
io.print(text, cls?)   // multi-line text; cls in {'art','dim','sys'} (CSS classes exist in #out)
io.clear()             // cls
io.waitEnter()         // Promise resolved by the next Enter press (format a: "press ENTER when ready")
io.status(text|null)   // overwrite-in-place line (#statusline) for "NN percent completed."
io.fx(name, arg)       // effects: 'title'(text) | 'color'('0a' or null to reset) | 'explorer' | 'bonzi'
                       //          | 'wallpaper' | 'wallpaper-restore' | 'flashnag'
```

### `judge(payload)` (brain.js) payload
`{ input, kind, command, mission (ticket title or null), sabotage_effect, note, nice_repeat, niceType, polite, mood, user, tickets_done, tickets_total, history:[{user, cmd}] (last 6) }`
→ `{ mood_delta, reaction, sabotage_line, refuse_line }`. Never throws; falls back locally.

### DOM ids (index.html)
Screens: `#boot #login #welcome #desktop #bsod` (class `.screen`, toggle `.hidden`).
Login: `#login-form #login-name #login-mute`. Desktop: `.wall #icons .icon[data-icon=computer|recycle|cmd|limewire|hof]`,
`#bonzi .bonzi-bubble`, gadget `#needle #mood-pct #mood-label #stat-sab #stat-brain .gadget.mood`,
sticky `#tickets #timer`. CMD window `#cmd .titlebar #cmd-title [data-act=min|max|close] #term #out #inputline #prompt #cmdin #statusline`.
`#popups` (container). Hall of Fame `#hof #win-panel #win-quote #score-table #btn-submit #board #board-src #btn-again #btn-close-hof [data-act=close-hof]`.
`#startmenu [data-sm=cmd|hof|mute|howto|restart|shutdown] #sm-user`. Taskbar `#orb .tb-app[data-app=ie|explorer|cmd] #tb-cmd #tray-sound #clock-time #clock-date`. `#balloon`. `#bsod-text`.

CSS state classes: `#desktop.no-explorer` (hides taskbar/icons/gadgets), `#desktop.wall-black`,
`#cmd.shake|.glow|.minimized|.restoring|.maxed|.notresp`, `.term.angry`, `#bonzi.gone`, `.bonzi-bubble.show`,
`.gadget.mood.pulse|.glow`, `#tickets li.done|.just`, `.tb-app.flash`, `.inputline.busy`,
`#out .voice.v-high|v-mid|v-low|v-rage` (with `<em>` for *stage directions*). Gauge needle: `transform: rotate(deg)`, where -90deg is 0% and +90deg is 100%.
Popups reuse `.window.dialog`-style markup: `.popup > .titlebar + .dialog-body(.p-ico,.p-txt) + .dialog-btns(.aero-btn)`.

## main.js spec (planned design, implement this)
**State:** `user, world, mood (start 60), done:Set, sabotages, startTime, busy, sulk, history, cmdHistory/histIdx, recentNice (last 6), failStreak, lastInputAt, idleCount, ended, enterWaiter, baseTitle, minimized, timers[]`.

**Flow:** boot (~3.2s) → login (name sanitized, max 16; user folder name = alphanumeric or "Admin"; `unlock()` audio on submit) → welcome 1.4s + `sfx.startup()` → desktop + game start.
Banner: `Emotionally Unstable Windows [Version 6.1.7601]` / `Copyright (c) 2009 Drama Corporation. All rights reserved. All feelings reserved.` then a canned opening voice line (no AI), e.g. "*yawns dramatically* Oh. A new scene partner... Type HELP. Say please. I'm fragile."
Prompt = `fmtPath(world.cwd) + '>'`.

**handleInput(raw):**
1. Echo prompt+raw. Empty → return. Push history, reset idle.
2. `p = plan(raw, world)`. If `local`, run it and return.
3. Set busy (`.inputline.busy`, ignore input except Enter for `enterWaiter`).
4. **Sulk:** if `sulk>0` and kind not nice/chat: `sulk--`, say "...", mood -1, return.
5. readonly/invalid: `await p.run(io)` first (output is immediate).
6. nice_repeat = count of the same niceType in recentNice.
7. After 1.3s waiting, add " (Not Responding)" to the title and `#cmd.notresp`. Call `judge`. Update `#stat-brain` (Gemini/Offline) from `lastSource`.
8. Clamp delta to [-25,20]. nice_repeat>=3 → min(delta,0); >=2 → min(delta,3). betrayal → min(delta,-8). New mood is clamped to 0..100 and the gauge is updated.
9. mood<=0 → say the reaction in CAPS, then BSOD.
10. **decide** (only for kind 'action'): mood>=60 comply; 40-59 sab .25/ref .12; 20-39 sab .42/ref .25; <20 sab .45/ref .4; halve the odds if failStreak>=2 (pity). If sabotage is chosen but `p.sabotage` is null, refuse instead.
11. Output: comply → `run` then say(reaction). sabotage → say(sabotage_line) then `sabotage.run`, sabotages++. refuse → say(refuse_line); if mood<30, 50% chance of `sulk=2` plus a dim hint "(CMD is giving you the silent treatment. Try being nice.)". nice → `run` (ASCII art), then say(reaction) with sfx (applaud → `sfx.applause`). chat/readonly/invalid → say(reaction). betrayal → run, then say(reaction).
12. Push `{user:raw, cmd:spoken}` to history. Then tantrum(delta, mood), checkMissions(), un-busy, re-render the prompt, refocus.

**say(text, mood):** typewriter (~2 chars per 14ms) into `div.voice.v-<band>`, then set innerHTML with `*x*` → `<em>*x*</em>` (escape HTML first). Bands: >=75 high, >=45 mid, >=20 low, else rage. Force CAPS if mood<15.
Mood labels: 90+ Ecstatic, 75 Radiant, 60 Content, 45 Wistful, 30 Brooding, 15 Devastated, <15 UNHINGED.

**Tantrums:** delta<0 and (mood<50 or delta<=-10) → shake `#cmd`, `sfx.bad`, gadget `.pulse`. delta>0 → `sfx.good`, gadget `.glow`, `#cmd.glow` if mood>=75. `.term.angry` while mood<25. Popup if delta<=-10 or (mood<30 and delta<0 and 40%). Self-minimize if mood<15 and delta<0 at 45%: `#cmd.minimized` and `#tb-cmd.flash`. Clicking the taskbar or the icon restores it with a RETURN_LINES line and mood +2.
Popup messages (max 3 on screen, random position, `sfx.popup`), buttons [OK] [Apologize] (Apologize gives mood +4 and an instant voice line):
"CMD.exe has stopped believing in you." · "Low Self-Esteem Warning: CMD.exe is running low on validation. Free up some compliments." · "Error 0xDRAMA: The scene partner did not say please." · "Windows Feelings Protection has flagged this user." · "A program is trying to get your attention: CMD.exe (it's not crying, you're crying)".

**fx:** title → baseTitle. color → map cmd hex 0-f to colors and set `--term-bg/--term-fg` on `#term`. explorer → `#desktop.no-explorer` for 8s, then a balloon "Windows Explorer has restarted" and explorer.exe is pushed back into world.procs. bonzi → `#bonzi.gone`. wallpaper → `.wall-black`, auto-restored after 30s with a balloon. flashnag → Flash "update available (reminder 9999 of ∞)" popup.

**Ambient:** clock (real time, year shown as 2009), ticket timer mm:ss, idle check every 5s (if >30s idle and not busy: IDLE_LINES, mood -2, max ~4 times), Bonzi bubble every ~7s while alive (BONZI_LINES), Flash nag popup at ~40s then every ~60s while the flash ticket is open.
**Window:** drag by the titlebar (pointer events; not when maxed or narrow), max toggles `.maxed`, close → shake + CLOSE_LINES + mood -3 (never actually closes). Click on `#term` focuses `#cmdin` unless text is selected.
**Keys:** Enter (resolve enterWaiter first), Up/Down history, **Tab completes file names** from the last token (handle the dir prefix and quote names with spaces; cycle on repeated Tab). Players are told `del Linkin<TAB>`.
**Tickets:** render MISSIONS on the sticky as `no + title + <code>hint</code>`. checkMissions marks `li.done.just`, plays `sfx.ticket`, prints a sys line "[Ticket #101 closed]". When all 6 are done → win.
**Win:** ended=true, a canned final-bow voice line, `sfx.win`, show `#hof` with `#win-panel`. Score = `max(0, round(2000 + max(0, 5000 - secs*12) + mood*30 - sabotages*250))` with a breakdown table. Submit → POST /api/leaderboard; on failure or 501, use localStorage `eucmd-board` (wrap in try/catch). Highlight your own row. "Play again" → reboot.
**BSOD:** clear timers and show the blue screen with `EMOTIONAL_DAMAGE_IRQL_NOT_LESS_OR_EQUAL`, the steps "Check to make sure you said 'please'... Consider tea.", CMD's last words, `*** STOP: 0x0000DRAMA (...)`, tickets/sabotages/time, and "Press any key to restart your relationship_". `sfx.bsod`. Any key or click → reboot (boot → login with the name prefilled → fresh world).
**Start menu:** cmd (restore), hof (load the board), mute (also syncs 🔊/🔇 on `#tray-sound` and `#login-mute`), howto (info popup), restart (reboot), shutdown (CMD drama, mood -10, not real). Taskbar ie → popup "Internet Explorer cannot display the webpage. Too many toolbars." explorer → balloon.

## After main.js
1. `node --check public/js/*.js`, then `npm run dev` (works without a key in offline mode).
2. Headless test: Chrome is at `/usr/bin/google-chrome` and Playwright browsers are in `~/.cache/ms-playwright` (chromium-1208). Install `playwright` in the **scratchpad**, not the project. Play through all 6 tickets, a BSOD path, and the HOF. Check the console for errors and take screenshots (including 390px mobile width).
3. Write README.md: local dev (`cp .env.example .env`, `npm run dev`), Vercel deploy (import the repo, framework preset "Other", no build command; Vercel serves `public/` automatically and `api/*.js` as functions; set `GEMINI_API_KEY`; add Upstash Redis from the Marketplace for the shared board), and the ticket solutions/cheat sheet.
4. Ask the user for the Gemini key to test live. Verify the model name: by Nov 2026 `gemini-2.5-flash` may be deprecated. List models with `GET https://generativelanguage.googleapis.com/v1beta/models` using the `x-goog-api-key` header and pick the current fast Flash model, then update the default in api/cmd.js. If it's a non-2.5 model, check the right thinking config (Gemini 3 uses `thinkingLevel`).

## Known caveats
- Score is computed client-side, so it's cheatable. Acceptable for a conference toy.
- `/api/cmd` is an open proxy. Inputs are length-limited, but there is no rate limiting. Mention this to the user (they plan a cheap key).
- Desktop visuals are a CSS homage (no Microsoft assets). Bonzi is a hue-shifted 🦍 emoji, not the real character art.
- The project is not a git repo yet. Don't commit unless asked.

## Update 2026-11-21: switched to Vertex AI (user has GCP credits)
- api/cmd.js supports, in priority order: service account (GOOGLE_SERVICE_ACCOUNT_JSON raw/base64, or GOOGLE_APPLICATION_CREDENTIALS path;
  JWT signed with node:crypto, token cached), VERTEX_API_KEY (express-mode endpoint), GEMINI_API_KEY (AI Studio).
- Default model gemini-3.5-flash-lite + thinkingLevel MINIMAL (~1.05s, user chose it over 3.8-flash at ~2-3s). 3.8-flash needs LOW. (2.5-flash was retired on Vertex in Oct 2026; 3.6 Flash retired 2026-11-19). location global.
  Gemini 3.x thinkingLevel LOW (MINIMAL is rejected by 3.8 Flash); on a 400 that mentions thinking, retries without thinkingConfig.
- LIVE-TESTED OK on Vertex: project gen-lang-client-0251846001, SA service-fur-gdg (role Agent Platform User = roles/aiplatform.user).
  Key at ./gcp-service-account.json (gitignored + .vercelignore), .env uses GOOGLE_APPLICATION_CREDENTIALS. For Vercel: GOOGLE_SERVICE_ACCOUNT_JSON.
- User considered OpenRouter/DeepInfra; declined, Flash-Lite is fast enough.
- Client timeout raised to 9.5s (server aborts at 8.5s).

## Update: diva refusals + polite ticket cap
- main.js: random 'diva' refusals at mood>=60 (DIVA_ACTION .10, DIVA_READONLY .06; readonly roll happens before output), dim hint, 5-command cooldown (starts at 3).
- Polite + open mission => delta >= -3 (client clamp) and matching rule in the api/cmd.js prompt; refuse_line is playful at mood 60+.
