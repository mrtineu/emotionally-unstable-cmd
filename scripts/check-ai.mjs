// Sends one test line to the configured AI provider and prints CMD's reaction.
// Usage: npm run check-ai   (reads .env like the dev server does)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env', '.env.local']) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
}

const { default: handler, provider, configured, DEFAULT_MODEL } = await import('../api/cmd.js');
if (!configured(process.env)) {
  console.error('No AI credentials found. See .env.example.');
  process.exit(1);
}
const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
console.log('Provider:', (await provider(process.env, model)).name, '| model:', model);

const t0 = Date.now();
let status = 200;
const res = {
  status(c) { status = c; return this; },
  json(o) {
    console.log(`HTTP ${status} in ${Date.now() - t0} ms`);
    console.log(JSON.stringify(o, null, 2));
    process.exitCode = status === 200 ? 0 : 1;
  },
};
await handler({
  method: 'POST',
  body: {
    input: 'please taskkill /im bonzibuddy.exe', kind: 'action', command: 'taskkill', polite: true, mood: 55,
    mission: 'A purple gorilla is telling jokes in the boss\'s office again.',
    sabotage_effect: 'kills explorer.exe instead and leaves Bonzi running', note: 'killing BonziBuddy, your secret best friend',
    nice_repeat: 0, user: 'Tester', tickets_done: 0, tickets_total: 6, history: [],
  },
}, res);
