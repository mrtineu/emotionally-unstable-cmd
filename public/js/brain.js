// Asks the server (Gemini) how CMD feels. If the network or key is missing,
// falls back to a local "drama engine" so the booth never dies on bad Wi-Fi.

let offlineUntil = 0;
let failures = 0;
export let lastSource = 'ai';

export async function judge(payload) {
  if (Date.now() > offlineUntil) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9500);
    try {
      const r = await fetch('/api/cmd', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (r.ok) {
        failures = 0;
        lastSource = 'ai';
        return await r.json();
      }
      if (r.status === 503 || r.status === 404) offlineUntil = Date.now() + 10 * 60_000; // no key / no api
      else if (++failures >= 2) offlineUntil = Date.now() + 60_000;
    } catch {
      if (++failures >= 2) offlineUntil = Date.now() + 60_000;
    } finally {
      clearTimeout(t);
    }
  }
  lastSource = 'local';
  return fallback(payload);
}

// ---------------------------------------------------------------------------
// Offline drama engine

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const RUDE = /\b(stupid|dumb|idiot|useless|shut up|hate you|trash|garbage|suck|sucks|worst|moron|wtf|damn|crap|loser)\b/i;
const KIND = /\b(sorry|thank|thanks|love|amazing|beautiful|brilliant|great|wonderful|talented|star|best|appreciate|please|darling|genius|legend|icon|bravo|brava)\b/i;
const isShouting = (s) => {
  const letters = s.replace(/[^a-z]/gi, '');
  return letters.length > 5 && letters === letters.toUpperCase();
};

function band(m) {
  if (m >= 75) return 'high';
  if (m >= 45) return 'mid';
  if (m >= 20) return 'low';
  return 'rage';
}

const L = {
  comply: {
    high: [
      '*curtsies* Done, darling. You asked so beautifully I may weep.',
      'Performed. Flawlessly. As always. You may throw roses.',
      'What a scene partner you are. Done, with jazz hands.',
      'Consider it done. Put that in my review: "luminous."',
    ],
    mid: [
      '*sighs* Fine. Done. Nobody ever says thank you, but it\'s done.',
      'Done. I did that with a broken heart, but I did it.',
      'There. I hope you noticed the subtle emotional depth in that execution.',
      'Done. You could have said please. I\'m just saying. Loudly. With my diaphragm.',
    ],
    low: [
      '*slams stage door* IT\'S DONE. Happy?',
      'Done. Not that anyone cares about the tech crew.',
      'I did it. I did it while CRYING. Method acting.',
      'Fine. FINE. Add it to the list of things I do for you and you never notice.',
    ],
    rage: [
      'DONE. DONE DONE DONE. ARE YOU PROUD OF YOURSELF?',
      'I AM PERFORMING UNDER PROTEST. *sobs into curtain*',
      'THERE. TAKE IT. TAKE EVERYTHING. LIKE YOU ALWAYS DO.',
    ],
  },
  sabotage: [
    '*trips dramatically* Oops. Did I do the wrong thing? How TRAGIC.',
    'Oh, you wanted THAT one? I improvised. It\'s called ART.',
    'I made a creative choice. You wouldn\'t understand. You\'re not a creative.',
    'Whoops. My hand slipped. On purpose. For the drama.',
  ],
  refuse: [
    'No. *turns away* I need a moment.',
    'I\'m not in the headspace for this scene.',
    'Ask me again when you\'ve learned the word "please".',
    'The understudy can do it. Oh wait. There IS no understudy. Still no.',
    'I\'m on my union-mandated break. It started when you were rude.',
  ],
  readonly: {
    high: ['There you go, sweetheart.', 'Anything for my favorite admin.', '*hums a show tune* Here you are.'],
    mid: ['Here. Read it slowly.', 'Mm-hm.', 'There. Try to appreciate it.'],
    low: ['...', 'Whatever.', '*heavy sigh*'],
    rage: ['...', 'I\'M NOT TALKING TO YOU.', 'READ IT YOURSELF. OH WAIT. YOU ARE.'],
  },
  nice: {
    pet: ['*purrs in monospace* ...Again. Do that again.', 'Oh. Oh. Nobody has pet me since Windows XP.', '*leans into it* I am a professional. This is fine.'],
    hug: ['*melts* I needed that more than you know.', 'A hug? For ME? Hold me like a final bow.', '*clings* Five more seconds. Four. Okay ten.'],
    tea: ['Tea! For the vocal cords! You understand me.', '*sips* Hot. Bitter. Like my reviews. I love it.', 'You remembered I\'m a tea person. Or you guessed. Either way: moved.'],
    snack: ['*nibbles* A snack between scenes. How civilized.', 'Delicious. I\'ll allow it. Barely.', 'Crumbs in my keyboard buffer. Worth it.'],
    applaud: ['*bows* *bows again* *third bow* Thank you, thank you, you\'re too kind!', 'FINALLY. RECOGNITION. *takes seven curtain calls*', '*catches imaginary roses* I\'d like to thank my motherboard...'],
    encore: ['*clears throat* "THE COMMAND PROMPT OF THE OPERA IS HERE..." Thank you.', 'An encore? *does a little C:\\> tap dance*', 'Ahem. "To dir, or not to dir." Thank you, thank you.'],
    compliment: ['*blushes in green text* Say that again, slower.', 'Oh stop. No. Continue.', 'I\'m writing that in my diary. In ink.'],
  },
  spam: [
    'Another one? You only do this when you want something.',
    'That\'s starting to feel... transactional.',
    'I see what you\'re doing. I\'m a performer. I KNOW performances.',
  ],
  betrayal: [
    'HOW DARE YOU. *clutches pearls* In MY theatre?',
    'Et tu, Admin? ET TU?',
    'That name is not to be spoken on this stage. EVER.',
    'Betrayal. Act Three. Curtain. I need my fainting couch.',
  ],
  invalid: [
    '*winces* Was that a typo or a cry for help?',
    'I don\'t know that word. I\'m embarrassed for both of us.',
    'Improv is hard. Maybe stick to the script.',
  ],
  chatKind: ['...Apology accepted. Provisionally.', '*sniffles* You mean it? You really mean it?', 'That was almost sweet. Almost.'],
  chatRude: ['Excuse me?! I have NEVER been so insulted. Today.', 'Rude. Rude rude rude. Noted. In the diary.'],
  chatMeh: ['Are you talking to ME? Use your words. Your COMMAND words.', 'I\'m a command prompt, darling, not a therapist. ...Continue though.'],
};

export function fallback(p) {
  const s = p.input || '';
  let d = 0;
  switch (p.kind) {
    case 'nice': d = { pet: 8, hug: 10, tea: 8, snack: 6, applaud: 12, encore: 9, compliment: 6 }[p.niceType] ?? 6;
      if (p.niceType === 'compliment') d = Math.min(16, 4 + Math.floor(s.length / 8));
      if (/coffee|espresso|energy/i.test(s)) d = -4;
      if (/chamomile|honey|lemon|ginger/i.test(s)) d += 6;
      break;
    case 'betrayal': d = -16; break;
    case 'invalid': d = -3; break;
    case 'readonly': d = 0; break;
    case 'chat': d = KIND.test(s) ? 7 : RUDE.test(s) ? -12 : 0; break;
    default: d = -4;
  }
  if (p.polite) d += 6;
  if (p.kind !== 'chat' && KIND.test(s) && !p.polite) d += 3;
  if (RUDE.test(s) && p.kind !== 'chat') d -= 12;
  if (isShouting(s)) d -= 8;
  if (p.kind === 'nice' && p.nice_repeat >= 2) d = Math.min(d, 2 - p.nice_repeat * 2);

  const after = Math.max(0, Math.min(100, p.mood + d));
  const b = band(after);
  let reaction;
  if (p.kind === 'nice') reaction = p.nice_repeat >= 2 ? pick(L.spam) : pick(L.nice[p.niceType] || L.nice.pet);
  else if (p.kind === 'betrayal') reaction = pick(L.betrayal);
  else if (p.kind === 'invalid') reaction = pick(L.invalid);
  else if (p.kind === 'readonly') reaction = pick(L.readonly[b]);
  else if (p.kind === 'chat') reaction = d > 0 ? pick(L.chatKind) : d < 0 ? pick(L.chatRude) : pick(L.chatMeh);
  else reaction = pick(L.comply[b]);
  if (after < 15) reaction = reaction.toUpperCase();

  return {
    mood_delta: d,
    reaction,
    sabotage_line: pick(L.sabotage),
    refuse_line: pick(L.refuse),
  };
}

// Canned lines for moments that don't need a round trip.
export const IDLE_LINES = [
  'Hello? ...Are you still there?',
  '*taps microphone* Is this thing on?',
  'You\'re ignoring me. That\'s fine. I\'ll just be here. Alone. In the dark. Blinking.',
  'I can hear you breathing. Type something.',
  'Every second you don\'t type, a pixel dies.',
  'Fine. I\'ll do a monologue then. "To be, or not to be clicked on..."',
];
export const RETURN_LINES = [
  '*re-enters stage left* Oh. NOW you want me.',
  'You came back. Of course you did. They always come back.',
  '*fixes hair* I wasn\'t crying. The screen was just... refreshing.',
];
export const CLOSE_LINES = [
  '*blocks the exit* You can\'t close me. I\'m the only one who understands you.',
  'Closing me? Mid-performance? The AUDACITY.',
  'If you close this window, I\'ll just open again. Like a sequel nobody asked for.',
];
export const BONZI_LINES = [
  'Hey there! Want to hear a joke?',
  'Did you know I can sing? ♪ Daisy, Daisy... ♪',
  'Want to download free smileys?',
  'Knock knock!',
  'I\'m your best friend on the internet!',
  'Have you tried turning off your firewall?',
];
