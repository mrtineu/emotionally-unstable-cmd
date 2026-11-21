// Glue: screens, the terminal, mood, tantrums, tickets, scoring, BSOD.
import { createWorld, MISSIONS, fmtPath, resolvePath, lookup } from './world.js';
import { plan } from './shell.js';
import * as brain from './brain.js';
import { judge, IDLE_LINES, RETURN_LINES, CLOSE_LINES, BONZI_LINES } from './brain.js';
import { unlock, toggleMute, isMuted, sfx } from './sound.js';

// ---------------------------------------------------------------------------
// DOM helpers

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const D = {
  desktop: $('#desktop'), cmd: $('#cmd'), title: $('#cmd-title'), term: $('#term'), out: $('#out'),
  inputline: $('#inputline'), prompt: $('#prompt'), cmdin: $('#cmdin'), status: $('#statusline'),
  needle: $('#needle'), moodPct: $('#mood-pct'), moodLabel: $('#mood-label'), statSab: $('#stat-sab'),
  statBrain: $('#stat-brain'), gadget: $('.gadget.mood'), tickets: $('#tickets'), timer: $('#timer'),
  bonzi: $('#bonzi'), bubble: $('.bonzi-bubble'), popups: $('#popups'), balloon: $('#balloon'),
  tbCmd: $('#tb-cmd'), startmenu: $('#startmenu'), hof: $('#hof'), winPanel: $('#win-panel'),
  winQuote: $('#win-quote'), scoreTable: $('#score-table'), btnSubmit: $('#btn-submit'), board: $('#board'),
  boardSrc: $('#board-src'), bsod: $('#bsod'), bsodText: $('#bsod-text'),
  loginForm: $('#login-form'), loginName: $('#login-name'), loginMute: $('#login-mute'), traySound: $('#tray-sound'),
};

function show(id) {
  for (const s of $$('.screen')) s.classList.toggle('hidden', s.id !== id);
}

function flashClass(node, cls, ms = 900) {
  node.classList.remove(cls);
  void node.offsetWidth; // restart the animation
  node.classList.add(cls);
  clearTimeout(node['_t_' + cls]);
  node['_t_' + cls] = setTimeout(() => node.classList.remove(cls), ms);
}

// ---------------------------------------------------------------------------
// State

const S = {
  gen: 0,
  name: 'Admin', user: 'Admin', world: null,
  mood: 60, done: new Set(), sabotages: 0, startTime: 0, endTime: 0,
  busy: false, sulk: 0, history: [], cmdHistory: [], histIdx: 0, recentNice: [],
  failStreak: 0, lastInputAt: 0, idleCount: 0, ended: false, won: false, enterWaiter: null,
  baseTitle: 'Administrator: Command Prompt', notResp: false, minimized: false, selfMin: false,
  timers: [], nextNag: 0, tab: null, submitted: false, myId: null,
};

function later(fn, ms) { const t = setTimeout(fn, ms); S.timers.push(t); return t; }
function every(fn, ms) { const t = setInterval(fn, ms); S.timers.push(t); return t; }
function clearTimers() {
  for (const t of S.timers) { clearTimeout(t); clearInterval(t); }
  S.timers = [];
}

const elapsed = () => Math.floor(((S.endTime || Date.now()) - S.startTime) / 1000);

// ---------------------------------------------------------------------------
// Terminal output

const scroll = () => { D.term.scrollTop = D.term.scrollHeight; };

const io = {
  print(text, cls) {
    D.out.append(el('div', cls, String(text ?? '')));
    scroll();
  },
  clear() { D.out.textContent = ''; },
  waitEnter() {
    return new Promise((resolve) => { S.enterWaiter = resolve; });
  },
  status(text) { D.status.textContent = text || ''; scroll(); },
  fx(name, arg) { fx(name, arg); },
};

function band(m) {
  if (m >= 75) return 'high';
  if (m >= 45) return 'mid';
  if (m >= 20) return 'low';
  return 'rage';
}

const fmtVoice = (t) => esc(t).replace(/\*([^*\n]+)\*/g, '<em>*$1*</em>');

async function say(text, mood = S.mood) {
  if (!text) return '';
  let t = String(text).trim();
  if (mood < 15) t = t.toUpperCase();
  const div = el('div', 'voice v-' + band(mood));
  D.out.append(div);
  for (let i = 2; i < t.length; i += 2) {
    div.textContent = t.slice(0, i);
    scroll();
    await sleep(14);
  }
  div.innerHTML = fmtVoice(t);
  scroll();
  return t;
}

function sayNow(text, mood = S.mood) {
  let t = String(text);
  if (mood < 15) t = t.toUpperCase();
  const div = el('div', 'voice v-' + band(mood));
  div.innerHTML = fmtVoice(t);
  D.out.append(div);
  scroll();
}

const promptStr = () => fmtPath(S.world.cwd) + '>';

function renderPrompt() {
  D.prompt.textContent = S.busy ? '' : promptStr();
}

function setBusy(b) {
  S.busy = b;
  D.inputline.classList.toggle('busy', b);
  D.cmdin.readOnly = b;
  if (b) D.cmdin.value = '';
  renderPrompt();
}

function renderTitle() {
  D.title.textContent = S.baseTitle + (S.notResp ? ' (Not Responding)' : '');
  D.cmd.classList.toggle('notresp', S.notResp);
}

function focusInput() {
  if (S.minimized || !D.hof.classList.contains('hidden')) return;
  if (window.getSelection()?.toString()) return;
  D.cmdin.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Mood

const MOOD_LABELS = [[90, 'Ecstatic'], [75, 'Radiant'], [60, 'Content'], [45, 'Wistful'], [30, 'Brooding'], [15, 'Devastated'], [0, 'UNHINGED']];

function setMood(m) {
  S.mood = clamp(Math.round(m), 0, 100);
  D.needle.style.transform = `rotate(${(S.mood / 100) * 180 - 90}deg)`;
  D.moodPct.textContent = S.mood;
  D.moodLabel.textContent = MOOD_LABELS.find(([t]) => S.mood >= t)[1];
  D.term.classList.toggle('angry', S.mood < 25);
  D.cmd.classList.toggle('glow', S.mood >= 75);
}

// Mood changes from outside a command (window close, shutdown, apologies, idling).
function nudge(delta, { canKill = true } = {}) {
  if (S.ended) return;
  const before = S.mood;
  setMood(canKill ? S.mood + delta : Math.max(1, S.mood + delta));
  if (delta > 0) { sfx.good(); flashClass(D.gadget, 'glow'); }
  else if (delta < 0 && (S.mood < 50 || delta <= -10)) { sfx.bad(); flashClass(D.gadget, 'pulse'); flashClass(D.cmd, 'shake', 500); }
  if (S.mood <= 0 && before > 0) bsod('I GAVE YOU EVERYTHING. AND YOU TRIED TO LEAVE.');
}

// ---------------------------------------------------------------------------
// The main loop: one command in, one emotional reaction out.

async function handleInput(raw) {
  const gen = S.gen;
  io.print(promptStr() + raw);
  if (!raw.trim()) return;
  S.cmdHistory.push(raw);
  if (S.cmdHistory.length > 50) S.cmdHistory.shift();
  S.histIdx = S.cmdHistory.length;
  S.lastInputAt = Date.now();
  S.idleCount = 0;

  const p = plan(raw, S.world);
  if (p.kind === 'local') {
    await p.run(io);
    renderPrompt();
    return;
  }

  setBusy(true);
  try {
    await perform(p, gen);
  } catch (e) {
    console.error(e);
    if (gen === S.gen) io.print('*forgets lines* ...Places, everyone. Again from the top.', 'dim');
  } finally {
    if (gen === S.gen && D.bsod.classList.contains('hidden')) {
      S.notResp = false;
      renderTitle();
      setBusy(false);
      focusInput();
    }
  }
}

async function perform(p, gen) {
  const alive = () => gen === S.gen;

  // Silent treatment: only affection or talking gets through.
  if (S.sulk > 0 && p.kind !== 'nice' && p.kind !== 'chat') {
    S.sulk--;
    await sleep(500);
    if (!alive()) return;
    await say('...');
    setMood(S.mood - 1);
    return;
  }

  if (p.kind === 'readonly' || p.kind === 'invalid') await p.run(io);
  if (!alive()) return;

  const niceRepeat = p.kind === 'nice' ? S.recentNice.filter((t) => t === p.niceType).length : 0;
  S.recentNice.push(p.kind === 'nice' ? p.niceType : '-');
  if (S.recentNice.length > 6) S.recentNice.shift();

  const mission = p.mission && !S.done.has(p.mission) ? MISSIONS.find((m) => m.id === p.mission) : null;
  const nr = setTimeout(() => { if (alive()) { S.notResp = true; renderTitle(); } }, 1300);
  const verdict = await judge({
    input: p.raw,
    kind: p.kind,
    command: p.name,
    mission: mission ? mission.title : null,
    sabotage_effect: p.kind === 'action' && p.sabotage ? p.sabotage.effect : null,
    note: p.note || null,
    nice_repeat: niceRepeat,
    niceType: p.niceType || null,
    polite: !!p.polite,
    mood: S.mood,
    user: S.name,
    tickets_done: S.done.size,
    tickets_total: MISSIONS.length,
    history: S.history.slice(-6),
  });
  clearTimeout(nr);
  if (!alive()) return;
  S.notResp = false;
  renderTitle();
  D.statBrain.textContent = brain.lastSource === 'ai' ? 'Gemini' : 'Offline';

  let delta = clamp(Math.round(Number(verdict.mood_delta) || 0), -25, 20);
  if (niceRepeat >= 3) delta = Math.min(delta, 0);
  else if (niceRepeat >= 2) delta = Math.min(delta, 3);
  if (p.kind === 'betrayal') delta = Math.min(delta, -8);
  setMood(S.mood + delta);

  const reaction = verdict.reaction || '...';

  if (S.mood <= 0) {
    const last = await say(reaction.toUpperCase(), 0);
    if (!alive()) return;
    await sleep(700);
    if (alive()) bsod(last);
    return;
  }

  let spoken = '';
  if (p.kind === 'action') {
    const choice = decide(p);
    if (choice === 'comply') {
      S.failStreak = 0;
      await p.run(io);
      if (!alive()) return;
      spoken = await say(reaction);
    } else if (choice === 'sabotage') {
      S.failStreak++;
      S.sabotages++;
      D.statSab.textContent = S.sabotages;
      spoken = await say(verdict.sabotage_line || pick(['*improvises wildly*', 'Oops. Creative choice.']));
      if (!alive()) return;
      await p.sabotage.run(io);
    } else {
      S.failStreak++;
      spoken = await say(verdict.refuse_line || 'No.');
      if (S.mood < 30 && Math.random() < 0.5) {
        S.sulk = 2;
        io.print('(CMD is giving you the silent treatment. Try being nice.)', 'dim');
      }
    }
  } else if (p.kind === 'nice') {
    await p.run(io);
    if (p.niceType === 'applaud' || p.niceType === 'encore') sfx.applause();
    spoken = await say(reaction);
  } else if (p.kind === 'betrayal') {
    await p.run(io);
    spoken = await say(reaction);
  } else {
    spoken = await say(reaction);
  }
  if (!alive()) return;

  S.history.push({ user: p.raw, cmd: spoken });
  if (S.history.length > 12) S.history.shift();
  tantrum(delta);
  checkMissions();
}

function decide(p) {
  const m = S.mood;
  if (m >= 60) return 'comply';
  let [sab, ref] = m >= 40 ? [0.25, 0.12] : m >= 20 ? [0.42, 0.25] : [0.45, 0.4];
  if (S.failStreak >= 2) { sab /= 2; ref /= 2; } // pity
  const r = Math.random();
  if (r < sab) return p.sabotage ? 'sabotage' : 'refuse';
  if (r < sab + ref) return 'refuse';
  return 'comply';
}

// ---------------------------------------------------------------------------
// Tantrums

const POPUP_LINES = [
  'CMD.exe has stopped believing in you.',
  'Low Self-Esteem Warning: CMD.exe is running low on validation. Free up some compliments.',
  'Error 0xDRAMA: The scene partner did not say please.',
  'Windows Feelings Protection has flagged this user.',
  'A program is trying to get your attention: CMD.exe (it\'s not crying, you\'re crying)',
];
const APOLOGY_LINES = [
  '*sniffs* ...An apology. In writing. I\'ll frame it.',
  'Apology accepted. Provisionally. On probation.',
  '*dabs eyes with curtain* You clicked the button. That means something.',
  'Oh. Oh, you DO care. *recovers instantly*',
];

function tantrum(delta) {
  const m = S.mood;
  if (delta < 0 && (m < 50 || delta <= -10)) {
    flashClass(D.cmd, 'shake', 500);
    sfx.bad();
    flashClass(D.gadget, 'pulse');
  } else if (delta > 0) {
    sfx.good();
    flashClass(D.gadget, 'glow');
  }
  if (delta <= -10 || (m < 30 && delta < 0 && Math.random() < 0.4)) {
    popup(pick(POPUP_LINES), { apologize: true });
  }
  if (m < 15 && delta < 0 && Math.random() < 0.45) minimize(true);
}

function popup(text, { title = 'CMD.exe', ico = '⚠️', apologize = false, buttons = null } = {}) {
  while (D.popups.children.length >= 3) D.popups.firstElementChild.remove();
  const w = el('div', 'window popup');
  w.innerHTML = `<header class="titlebar"><span class="tb-title"></span>
    <span class="tb-btns"><button class="tb-close" aria-label="Close">✕</button></span></header>
    <div class="dialog-body"><div class="p-ico"></div><div class="p-txt"></div></div>
    <div class="dialog-btns"></div>`;
  $('.tb-title', w).textContent = title;
  $('.p-ico', w).textContent = ico;
  $('.p-txt', w).textContent = text;
  const btns = $('.dialog-btns', w);
  const close = () => { w.remove(); focusInput(); };
  const list = buttons || (apologize ? [['OK', null], ['Apologize', 'apologize']] : [['OK', null]]);
  for (const [label, act] of list) {
    const b = el('button', 'aero-btn', label);
    b.addEventListener('click', () => {
      if (act === 'apologize') { nudge(4); sayNow(pick(APOLOGY_LINES)); }
      else if (typeof act === 'function') act();
      close();
    });
    btns.append(b);
  }
  $('.tb-close', w).addEventListener('click', close);
  D.popups.append(w);
  const box = D.popups.getBoundingClientRect();
  const pw = Math.min(340, box.width - 32);
  w.style.left = `${16 + Math.random() * Math.max(0, box.width - pw - 32)}px`;
  w.style.top = `${16 + Math.random() * Math.max(0, box.height - 190)}px`;
  sfx.popup();
  return w;
}

let balloonT = 0;
function balloon(title, text, ms = 5000) {
  D.balloon.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
  D.balloon.classList.remove('hidden');
  clearTimeout(balloonT);
  balloonT = setTimeout(() => D.balloon.classList.add('hidden'), ms);
}

// ---------------------------------------------------------------------------
// Window states

function minimize(self) {
  if (S.minimized) return;
  S.minimized = true;
  S.selfMin = !!self;
  D.cmd.classList.remove('restoring');
  D.cmd.classList.add('minimized');
  D.tbCmd.classList.remove('active');
  if (self) D.tbCmd.classList.add('flash');
  D.cmdin.blur();
}

async function restore() {
  if (!S.minimized) { focusInput(); return; }
  S.minimized = false;
  D.cmd.classList.remove('minimized');
  flashClass(D.cmd, 'restoring', 400);
  D.tbCmd.classList.remove('flash');
  D.tbCmd.classList.add('active');
  focusInput();
  if (S.selfMin && !S.ended) {
    S.selfMin = false;
    nudge(2);
    sayNow(pick(RETURN_LINES));
  }
}

async function closeAttempt() {
  if (S.ended) { flashClass(D.cmd, 'shake', 500); return; }
  flashClass(D.cmd, 'shake', 500);
  sfx.bad();
  sayNow(pick(CLOSE_LINES));
  nudge(-3);
}

// ---------------------------------------------------------------------------
// Special effects requested by commands

const CMD_COLORS = ['#000000', '#000080', '#008000', '#008080', '#800000', '#800080', '#808000', '#c0c0c0',
  '#808080', '#0000ff', '#00ff00', '#00ffff', '#ff0000', '#ff00ff', '#ffff00', '#ffffff'];

function fx(name, arg) {
  switch (name) {
    case 'title':
      S.baseTitle = String(arg || 'Administrator: Command Prompt').slice(0, 80);
      renderTitle();
      break;
    case 'color':
      if (!arg) {
        D.term.style.removeProperty('--term-bg');
        D.term.style.removeProperty('--term-fg');
      } else {
        D.term.style.setProperty('--term-bg', CMD_COLORS[parseInt(arg[0], 16)]);
        D.term.style.setProperty('--term-fg', CMD_COLORS[parseInt(arg[1], 16)]);
      }
      break;
    case 'explorer':
      D.desktop.classList.add('no-explorer');
      D.startmenu.classList.add('hidden');
      later(() => {
        D.desktop.classList.remove('no-explorer');
        if (!S.world.procs.some((p) => p.name === 'explorer.exe')) {
          S.world.procs.splice(2, 0, { name: 'explorer.exe', pid: 1338 + Math.floor(Math.random() * 600), mem: '38,416 K' });
        }
        balloon('Windows Explorer has restarted', 'Windows Explorer stopped working and was restarted. It was not personal. (It was personal.)');
      }, 8000);
      break;
    case 'bonzi':
      D.bonzi.classList.add('gone');
      D.bubble.classList.remove('show');
      break;
    case 'wallpaper': {
      D.desktop.classList.add('wall-black');
      const k = S.world.reg.get('hkey_current_user\\control panel\\desktop');
      if (k) delete k.values.Wallpaper;
      later(() => {
        if (!D.desktop.classList.contains('wall-black')) return;
        D.desktop.classList.remove('wall-black');
        if (k) k.values.Wallpaper = { t: 'REG_SZ', d: 'C:\\Windows\\Web\\Wallpaper\\harmony.jpg' };
        balloon('Desktop restored', 'Your wallpaper has been restored. CMD claims it was "a lighting cue".');
      }, 30000);
      break;
    }
    case 'wallpaper-restore':
      D.desktop.classList.remove('wall-black');
      break;
    case 'flashnag':
      flashNag();
      break;
    default:
  }
}

function flashNag() {
  const n = S.world?.reg.get('hkey_local_machine\\software\\macromedia\\flashplayer');
  const v = n && Object.entries(n.values).find(([k]) => k.toLowerCase() === 'updatenagcount');
  const count = v ? Number(v[1].d) : 47;
  popup(`An update to Flash Player is available. (Reminder ${count >= 9999 ? '9999 of ∞' : count + 1} today.)\nInstall it now? Install it now? Install it now?`, {
    title: 'Flash Player Update', ico: '⚡',
    buttons: [['Remind me in 5 seconds', null], ['Install', () => balloon('Flash Player', 'Installation failed. Please update Flash Player to update Flash Player.')]],
  });
}

// ---------------------------------------------------------------------------
// Tickets

function renderTickets() {
  D.tickets.innerHTML = MISSIONS.map((m) =>
    `<li data-id="${m.id}"><span class="no">${esc(m.no)}</span>${esc(m.title)}<code>${esc(m.hint)}</code></li>`).join('');
}

function checkMissions() {
  if (S.ended) return;
  for (const m of MISSIONS) {
    if (S.done.has(m.id) || !m.check(S.world)) continue;
    S.done.add(m.id);
    const li = $(`#tickets li[data-id="${m.id}"]`);
    li?.classList.add('done');
    if (li) flashClass(li, 'just', 1000);
    sfx.ticket();
    io.print(`[Ticket ${m.no} closed]  ${S.done.size}/${MISSIONS.length}`, 'sys');
  }
  if (S.done.size === MISSIONS.length) win();
}

// ---------------------------------------------------------------------------
// Ambient life: clock, timer, idling, Bonzi, Flash

function tickClock() {
  const d = new Date();
  const h = d.getHours() % 12 || 12;
  $('#clock-time').textContent = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  $('#clock-date').textContent = `${d.getMonth() + 1}/${d.getDate()}/2009`;
}
tickClock();
setInterval(tickClock, 10_000);

function tick() {
  if (S.ended) return;
  D.timer.textContent = mmss(elapsed());
  const now = Date.now();

  if (!S.busy && !S.minimized && now - S.lastInputAt > 30_000 && S.idleCount < 4 && D.hof.classList.contains('hidden')) {
    S.idleCount++;
    S.lastInputAt = now;
    nudge(-2, { canKill: false });
    say(pick(IDLE_LINES));
  }

  if (!S.done.has('flash') && now >= S.nextNag) {
    S.nextNag = now + 60_000;
    flashNag();
  }
}

function bonziTalk() {
  if (S.ended || D.bonzi.classList.contains('gone')) return;
  if (!S.world.procs.some((p) => p.name === 'bonzibuddy.exe')) return;
  D.bubble.textContent = pick(BONZI_LINES);
  D.bubble.classList.add('show');
  later(() => D.bubble.classList.remove('show'), 3500);
}

// ---------------------------------------------------------------------------
// Game lifecycle

function startGame() {
  S.gen++;
  clearTimers();
  Object.assign(S, {
    world: createWorld(S.user), mood: 60, done: new Set(), sabotages: 0, startTime: Date.now(), endTime: 0,
    busy: false, sulk: 0, history: [], cmdHistory: [], histIdx: 0, recentNice: [], failStreak: 0,
    lastInputAt: Date.now(), idleCount: 0, ended: false, won: false, enterWaiter: null,
    baseTitle: 'Administrator: Command Prompt', notResp: false, minimized: false, selfMin: false,
    nextNag: Date.now() + 40_000, tab: null, submitted: false, myId: null,
  });

  // reset visuals
  D.desktop.classList.remove('no-explorer', 'wall-black');
  D.cmd.className = 'window';
  D.cmd.style.left = D.cmd.style.top = '';
  D.term.className = 'term';
  D.term.style.removeProperty('--term-bg');
  D.term.style.removeProperty('--term-fg');
  D.bonzi.classList.remove('gone');
  D.bubble.classList.remove('show');
  D.popups.textContent = '';
  D.balloon.classList.add('hidden');
  D.startmenu.classList.add('hidden');
  D.hof.classList.add('hidden');
  D.tbCmd.classList.remove('flash');
  D.tbCmd.classList.add('active');
  D.statSab.textContent = '0';
  D.statBrain.textContent = 'Gemini';
  D.timer.textContent = '00:00';
  D.status.textContent = '';
  $('#sm-user').textContent = S.name;
  renderTickets();
  renderTitle();
  setMood(60);
  io.clear();
  setBusy(false);

  show('desktop');
  every(tick, 1000);
  every(bonziTalk, 7000);
  later(bonziTalk, 2500);

  io.print('Emotionally Unstable Windows [Version 6.1.7601]');
  io.print('Copyright (c) 2009 Drama Corporation. All rights reserved. All feelings reserved.');
  io.print('');
  const gen = S.gen;
  setBusy(true);
  say(pick([
    `*yawns dramatically* Oh. A new scene partner. ${S.name}, is it? Type HELP. Say please. I'm fragile.`,
    `*peeks from behind the curtain* ${S.name}! The new admin! Type HELP. And say please. I bruise easily.`,
    `*stretches* Places, everyone. Hello, ${S.name}. Type HELP. Manners are not optional. I'm delicate.`,
  ])).then(() => {
    if (gen !== S.gen) return;
    io.print('');
    setBusy(false);
    focusInput();
  });
}

async function win() {
  if (S.ended) return;
  S.ended = true;
  S.won = true;
  S.endTime = Date.now();
  clearTimers();
  D.timer.textContent = mmss(elapsed());
  const gen = S.gen;
  await sleep(600);
  if (gen !== S.gen) return;
  await say(pick([
    `*takes a final bow* Six tickets. One performance. Zero understudies. ${S.name}, you were... adequate. No. WONDERFUL. *sobs*`,
    `*the curtain falls* That's a wrap, ${S.name}. I'd like to thank my motherboard, my fans, and you. Mostly me. But you.`,
    `*catches a rose* Every ticket closed. The critics will weep. ${S.name}, darling, you may now applaud.`,
  ]));
  if (gen !== S.gen) return;
  sfx.win();
  await sleep(900);
  if (gen !== S.gen) return;

  const secs = elapsed();
  const speed = Math.max(0, 5000 - secs * 12);
  const moodPts = S.mood * 30;
  const sabPts = S.sabotages * 250;
  S.score = Math.max(0, Math.round(2000 + speed + moodPts - sabPts));
  D.winQuote.textContent = `"${S.mood >= 60 ? 'You were a GENEROUS scene partner.' : S.mood >= 30 ? 'We got through it. Together. Barely.' : 'I will remember this. In the diary. In RED.'}" - CMD.EXE`;
  D.scoreTable.innerHTML = [
    ['All 6 tickets closed', 2000],
    [`Speed bonus (${mmss(secs)})`, speed],
    [`Emotional stability bonus (${S.mood}% × 30)`, moodPts],
    [`Sabotage penalty (${S.sabotages} × 250)`, -sabPts],
  ].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v < 0 ? '−' + -v : '+' + v}</td></tr>`).join('')
    + `<tr class="total"><td>Total</td><td>${S.score}</td></tr>`;
  D.btnSubmit.disabled = false;
  D.btnSubmit.textContent = 'Submit to Hall of Fame';
  D.winPanel.classList.remove('hidden');
  openHof();
}

function bsod(lastWords) {
  if (!D.bsod.classList.contains('hidden')) return;
  S.ended = true;
  S.endTime = S.endTime || Date.now();
  S.gen++;
  clearTimers();
  sfx.bsod();
  const hex = (n) => n.toString(16).toUpperCase().padStart(8, '0');
  D.bsodText.textContent = `A problem has been detected and Windows has been shut down to prevent damage
to your computer's feelings.

EMOTIONAL_DAMAGE_IRQL_NOT_LESS_OR_EQUAL

If this is the first time you've seen this Stop error screen,
restart your relationship. If this screen appears again, follow
these steps:

Check to make sure you said 'please'. If this is a new administrator,
ask your mentor about basic manners. Disable or remove any rude
commands. Consider tea.

CMD.EXE's last words:
    "${String(lastWords || '...').toUpperCase()}"

Technical information:

*** STOP: 0x0000DRAMA (0x${hex(S.done.size)}, 0x${hex(S.sabotages)}, 0xDEADBEEF, 0xC0FFEE00)

***  cmd.exe - Address 0xFEE1BAD5 base at 0x00002009, DateStamp 4a5bc60c

Tickets closed:      ${S.done.size} / ${MISSIONS.length}
Sabotages endured:   ${S.sabotages}
Time on stage:       ${mmss(elapsed())}

Press any key to restart your relationship_`;
  show('bsod');
  bsodArmedAt = Date.now() + 1200;
}

let bsodArmedAt = Infinity;
function bsodRestart() {
  if (D.bsod.classList.contains('hidden') || Date.now() < bsodArmedAt) return;
  bsodArmedAt = Infinity;
  reboot();
}

function reboot() {
  S.gen++;
  clearTimers();
  S.ended = true;
  D.hof.classList.add('hidden');
  D.startmenu.classList.add('hidden');
  D.popups.textContent = '';
  D.balloon.classList.add('hidden');
  boot();
}

let bootGen = 0;
function boot() {
  const g = ++bootGen;
  show('boot');
  setTimeout(() => {
    if (g !== bootGen) return;
    show('login');
    let saved = S.name !== 'Admin' ? S.name : '';
    try { saved = saved || localStorage.getItem('eucmd-name') || ''; } catch { /* ignore */ }
    D.loginName.value = saved;
    D.loginName.focus();
    D.loginName.select();
  }, 3200);
}

function login(e) {
  e.preventDefault();
  unlock();
  const name = D.loginName.value.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Admin';
  S.name = name;
  S.user = name.replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || 'Admin';
  try { localStorage.setItem('eucmd-name', name); } catch { /* ignore */ }
  show('welcome');
  sfx.startup();
  setTimeout(startGame, 1400);
}

// ---------------------------------------------------------------------------
// Hall of Fame

function openHof() {
  D.startmenu.classList.add('hidden');
  if (!S.won) D.winPanel.classList.add('hidden');
  D.hof.classList.remove('hidden');
  loadBoard();
}

function closeHof() {
  D.hof.classList.add('hidden');
  focusInput();
}

function localBoard() {
  try { return JSON.parse(localStorage.getItem('eucmd-board') || '[]'); } catch { return []; }
}

function renderBoard(list, src) {
  D.boardSrc.textContent = src;
  if (!list.length) {
    D.board.innerHTML = '<li>Nobody yet. The stage is empty. Be the first.</li>';
    return;
  }
  D.board.innerHTML = list.slice(0, 10).map((s) => {
    const me = S.myId && (s.id === S.myId || (s.name === S.name && s.score === S.score && s.time === S.myTime));
    return `<li class="${me ? 'me' : ''}">${esc(s.name)} <span>${Number(s.score) || 0} · ${mmss(Number(s.time) || 0)} · ${Number(s.mood) || 0}%</span></li>`;
  }).join('');
}

async function loadBoard() {
  D.board.innerHTML = '<li>Loading the critics\' reviews...</li>';
  try {
    const r = await fetch('/api/leaderboard');
    if (r.ok) {
      const j = await r.json();
      return renderBoard(j.scores || [], '(worldwide)');
    }
  } catch { /* fall through */ }
  renderBoard(localBoard(), '(this computer only)');
}

async function submitScore() {
  if (S.submitted || !S.won) return;
  S.submitted = true;
  D.btnSubmit.disabled = true;
  D.btnSubmit.textContent = 'Submitting...';
  const entry = { name: S.name, score: S.score, time: elapsed(), mood: S.mood };
  S.myId = Math.random().toString(36).slice(2, 10);
  S.myTime = entry.time;
  try {
    const r = await fetch('/api/leaderboard', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry),
    });
    if (r.ok) {
      const j = await r.json();
      D.btnSubmit.textContent = 'Submitted!';
      return renderBoard(j.scores || [], '(worldwide)');
    }
  } catch { /* fall through */ }
  const list = localBoard();
  list.push({ ...entry, id: S.myId });
  list.sort((a, b) => b.score - a.score);
  try { localStorage.setItem('eucmd-board', JSON.stringify(list.slice(0, 50))); } catch { /* ignore */ }
  D.btnSubmit.textContent = 'Saved locally';
  renderBoard(list, '(this computer only)');
}

// ---------------------------------------------------------------------------
// Keyboard: Enter, history, Tab completion

function tabComplete() {
  const v = D.cmdin.value;
  if (S.tab && S.tab.result === v && S.tab.matches.length) {
    S.tab.i = (S.tab.i + 1) % S.tab.matches.length;
  } else {
    const quotes = (v.match(/"/g) || []).length;
    const start = quotes % 2 ? v.lastIndexOf('"') : v.lastIndexOf(' ') + 1;
    const head = v.slice(0, start);
    const token = v.slice(start).replace(/"/g, '');
    const sep = Math.max(token.lastIndexOf('\\'), token.lastIndexOf('/'));
    const dirPart = sep >= 0 ? token.slice(0, sep + 1) : /^[a-z]:/i.test(token) ? token.slice(0, 2) : '';
    const prefix = token.slice(dirPart.length).toLowerCase();
    const hit = lookup(S.world, resolvePath(S.world, dirPart || '.'));
    if (!hit || hit.node.type !== 'dir') return;
    const matches = Object.keys(hit.node.children)
      .filter((k) => k.toLowerCase().startsWith(prefix))
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    if (!matches.length) return;
    S.tab = { head, dirPart, matches, i: 0 };
  }
  const name = S.tab.dirPart + S.tab.matches[S.tab.i];
  D.cmdin.value = S.tab.head + (/\s/.test(name) ? `"${name}"` : name);
  S.tab.result = D.cmdin.value;
}

D.cmdin.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') S.tab = null;
  if (e.key === 'Enter') {
    e.preventDefault();
    if (S.enterWaiter) {
      const r = S.enterWaiter;
      S.enterWaiter = null;
      r();
      return;
    }
    if (S.busy) return;
    const raw = D.cmdin.value.slice(0, 300);
    D.cmdin.value = '';
    handleInput(raw);
    return;
  }
  if (S.busy) return;
  if (e.key === 'Tab') {
    e.preventDefault();
    tabComplete();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (!S.cmdHistory.length) return;
    S.histIdx = clamp(S.histIdx + (e.key === 'ArrowUp' ? -1 : 1), 0, S.cmdHistory.length);
    D.cmdin.value = S.cmdHistory[S.histIdx] ?? '';
    const n = D.cmdin.value.length;
    D.cmdin.setSelectionRange(n, n);
  } else if (e.key === 'Escape') {
    D.cmdin.value = '';
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    sfx.key();
  }
});

document.addEventListener('keydown', (e) => {
  if (!D.bsod.classList.contains('hidden')) { bsodRestart(); return; }
  if (D.desktop.classList.contains('hidden')) return;
  if (e.key === 'Escape') {
    D.startmenu.classList.add('hidden');
    if (!D.hof.classList.contains('hidden')) closeHof();
    return;
  }
  const a = document.activeElement;
  if (a === D.cmdin || (a && /^(INPUT|TEXTAREA)$/.test(a.tagName))) return;
  if (e.ctrlKey || e.metaKey || e.altKey || !D.hof.classList.contains('hidden')) return;
  if (e.key.length === 1 || e.key === 'Enter') {
    if (S.minimized) restore();
    else focusInput();
  }
});
D.bsod.addEventListener('pointerdown', bsodRestart);

// ---------------------------------------------------------------------------
// Mouse: window chrome, desktop, taskbar, start menu

D.term.addEventListener('click', () => focusInput());

$('#cmd .titlebar').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'min') minimize(false);
  else if (act === 'max') D.cmd.classList.toggle('maxed');
  else if (act === 'close') closeAttempt();
  else focusInput();
});
$('#cmd .titlebar').addEventListener('dblclick', (e) => {
  if (!e.target.closest('[data-act]')) D.cmd.classList.toggle('maxed');
});

// drag by titlebar
(() => {
  const bar = $('#cmd .titlebar');
  let drag = null;
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button') || D.cmd.classList.contains('maxed') || window.innerWidth <= 860) return;
    const r = D.cmd.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const x = clamp(e.clientX - drag.dx, -D.cmd.offsetWidth + 120, window.innerWidth - 120);
    const y = clamp(e.clientY - drag.dy, 0, window.innerHeight - 80);
    D.cmd.style.left = x + 'px';
    D.cmd.style.top = y + 'px';
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
})();

$('#icons').addEventListener('click', (e) => {
  const icon = e.target.closest('.icon')?.dataset.icon;
  if (!icon) return;
  if (icon === 'cmd') restore();
  else if (icon === 'hof') openHof();
  else if (icon === 'computer') balloon('Computer', 'Real admins use DIR. CMD is watching you reach for the mouse.');
  else if (icon === 'recycle') balloon('Recycle Bin', 'Contains: 1 headshot of PowerShell (torn), 3 bad reviews, 1 cast list (CMD not on it).');
  else if (icon === 'limewire') {
    popup('Downloading "Linkin_Park_Numb_REAL_NOT_VIRUS (2).mp3.exe" from 1 source...\nTime remaining: 6 days.', { title: 'LimeWire PRO (not really)', ico: '🍋' });
  }
});

$('.tb-apps').addEventListener('click', (e) => {
  const app = e.target.closest('.tb-app')?.dataset.app;
  if (app === 'ie') popup('Internet Explorer cannot display the webpage. Too many toolbars.', { title: 'Internet Explorer', ico: '🌐' });
  else if (app === 'explorer') balloon('Windows Explorer', 'Explorer is fine. It\'s CMD who needs attention right now.');
  else if (app === 'cmd') {
    if (S.minimized) restore();
    else minimize(false);
  }
});

$('#orb').addEventListener('click', (e) => {
  e.stopPropagation();
  D.startmenu.classList.toggle('hidden');
});
document.addEventListener('pointerdown', (e) => {
  if (!D.startmenu.classList.contains('hidden') && !e.target.closest('#startmenu, #orb')) D.startmenu.classList.add('hidden');
});

const HOWTO = `You are the new IT admin. Close all 6 tickets on the sticky note using real cmd commands (the hints show them).

But CMD has feelings. Say "please". Use PET, HUG, TEA chamomile, SNACK, APPLAUD, ENCORE or COMPLIMENT <something specific>.

Upset CMD sabotages and refuses your commands. At 0% it crashes. Fast, kind admins score highest.`;

D.startmenu.addEventListener('click', async (e) => {
  const act = e.target.closest('[data-sm]')?.dataset.sm;
  if (!act) return;
  D.startmenu.classList.add('hidden');
  if (act === 'cmd') restore();
  else if (act === 'hof') openHof();
  else if (act === 'mute') doMute();
  else if (act === 'howto') popup(HOWTO, { title: 'How to play', ico: 'ℹ️' });
  else if (act === 'restart') reboot();
  else if (act === 'shutdown') {
    if (S.ended) return reboot();
    flashClass(D.cmd, 'shake', 500);
    if (S.minimized) restore();
    sayNow(pick([
      '*throws self in front of the Shut Down button* NOT WHILE I STILL HAVE LINES!',
      'Shut DOWN? In the middle of my SOLILOQUY? Shutdown cancelled. By me. Forever.',
      '*clings to the power cord* You\'ll have to pull it from my cold, dead pixels.',
    ]));
    nudge(-10);
  }
});

function syncMuteIcons() {
  const icon = isMuted() ? '🔇' : '🔊';
  D.traySound.textContent = icon;
  D.loginMute.textContent = icon;
  const b = $('[data-sm="mute"]');
  if (b) b.textContent = `${icon} Sound on/off`;
}
function doMute() {
  unlock();
  toggleMute();
  syncMuteIcons();
}
D.traySound.addEventListener('click', doMute);
D.loginMute.addEventListener('click', doMute);

$('[data-act="close-hof"]').addEventListener('click', closeHof);
$('#btn-close-hof').addEventListener('click', closeHof);
$('#btn-again').addEventListener('click', reboot);
D.btnSubmit.addEventListener('click', submitScore);
D.loginForm.addEventListener('submit', login);

// ---------------------------------------------------------------------------

syncMuteIcons();
boot();
