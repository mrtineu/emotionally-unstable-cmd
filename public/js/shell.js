// Parses real cmd.exe syntax and turns it into a "plan": what kind of command it is,
// what happens if CMD complies, and what happens if CMD sabotages it out of spite.
import {
  resolvePath, lookup, fmtPath, normKey, prettyKey, keyExists, subKeys,
} from './world.js';

const POLITE_PRE = /^\s*(please|pls|plz|kindly|(?:could|would|can) you(?: please| kindly)?|dear cmd,?|darling,?|sweetie,?|my dear,?)\s+/i;
const POLITE_POST = /[\s,]+(please|pls|plz|thanks|thank you|thx|ty|darling|my dear|sweetie|xoxo|<3)[\s.!]*$/i;
const BETRAYAL_WORDS = /\b(powershell|pwsh|bash|zsh|sudo|linux|ubuntu|macos|mac ?os|osx|windows ?8|windows ?10|wsl)\b/i;
const CHAT_START = /^(sorry|i'?m|im|i|thanks?|thank|thx|love|hi|hello|hey|good|wow|bravo|brava|you|you're|youre|ok|okay|hmm|why|what|who|how|are|is|do|don't|dont|no|yes|yay|oh|great|nice|cool|apolog|forgive|calm|relax|shh|hush|there|bye|goodbye|cmd)\b/i;

export const NICE = ['pet', 'hug', 'compliment', 'tea', 'snack', 'applaud', 'clap', 'bravo', 'encore'];

export function tokenize(s) {
  const out = [];
  let cur = '', q = false, had = false;
  for (const ch of s) {
    if (ch === '"') { q = !q; had = true; continue; }
    if (!q && /\s/.test(ch)) {
      if (cur || had) { out.push(cur); cur = ''; had = false; }
      continue;
    }
    cur += ch;
  }
  if (cur || had) out.push(cur);
  return out;
}

export function stripPolite(raw) {
  let s = raw, polite = false;
  for (let i = 0; i < 3; i++) {
    const a = s.replace(POLITE_PRE, '');
    const b = a.replace(POLITE_POST, '');
    if (b !== s) polite = true;
    if (b === s) break;
    s = b;
  }
  return { text: s.trim(), polite };
}

const comma = (n) => n.toLocaleString('en-US');
const STAMP = '11/21/2009  04:20 PM';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------

export function plan(raw, w) {
  const { text, polite } = stripPolite(raw);
  let line = text.replace(/^(cd|dir)(\.\.|\\)/i, '$1 $2');
  const args = tokenize(line);
  const name = (args.shift() || '').toLowerCase();
  const base = { polite, name, raw };

  if (!name) {
    return { ...base, kind: 'chat', note: 'they just said "please" (or similar) on its own', run: async () => {} };
  }

  if (/^sudo$/.test(name) || BETRAYAL_WORDS.test(name) || (BETRAYAL_WORDS.test(line) && !['echo', 'compliment'].includes(name))) {
    return {
      ...base, kind: 'betrayal', note: 'they mentioned a rival shell or OS (PowerShell/Linux/Mac/Windows 8)',
      run: async (io) => io.print(`'${name}' is not recognized as an internal or external command,\noperable program or batch file. And it never will be.`),
    };
  }

  const fn = COMMANDS[name];
  if (fn) return { ...base, ...fn(args, w, line.slice(name.length).trim()) };

  if (NICE.includes(name)) return { ...base, ...nice(name, args, line.slice(name.length).trim()) };

  const words = text.split(/\s+/).length;
  if (CHAT_START.test(text) || words >= 3) {
    return { ...base, kind: 'chat', run: async () => {} };
  }
  return {
    ...base, kind: 'invalid',
    run: async (io) => io.print(`'${name}' is not recognized as an internal or external command,\noperable program or batch file.`),
  };
}

// ---------------------------------------------------------------------------

function nice(name, args, rest) {
  const type = { clap: 'applaud', bravo: 'applaud' }[name] || name;
  const art = {
    pet: '  *pat pat pat*',
    hug: '  (>^_^)> <(^_^<)',
    tea: `      ( (\n       ) )\n    ........\n    |      |]\n    \\      /\n     \`----'   ${rest ? '~ ' + rest + ' ~' : ''}`,
    snack: `  [ ${rest || 'a mystery snack'} ]`,
    applaud: '  *CLAP* *CLAP* *CLAP*  BRAVO!  *CLAP* *CLAP*',
    encore: '  EN-CORE! EN-CORE! EN-CORE!',
    compliment: '',
  }[type];
  if (type === 'compliment' && !rest) {
    return {
      kind: 'invalid', note: 'they typed COMPLIMENT without an actual compliment',
      run: async (io) => io.print('The syntax of the command is incorrect.\nCOMPLIMENT <something specific>. It is literally in the name.'),
    };
  }
  return {
    kind: 'nice', niceType: type,
    note: rest ? `${type.toUpperCase()} content: "${rest}"` : null,
    run: async (io) => { if (art) io.print(art, 'art'); },
  };
}

// ---------------------------------------------------------------------------

const COMMANDS = {
  cls: () => ({ kind: 'local', run: async (io) => io.clear() }),

  help: () => ({
    kind: 'readonly',
    run: async (io) => io.print(HELP),
  }),

  ver: () => ({ kind: 'readonly', run: async (io) => io.print('\nEmotionally Unstable Windows [Version 6.1.7601]\n') }),
  whoami: (a, w) => ({ kind: 'readonly', run: async (io) => io.print(`office-pc\\${w.user.toLowerCase()}  (my scene partner, apparently)`) }),
  hostname: () => ({ kind: 'readonly', run: async (io) => io.print('THE-GLOBE-THEATRE') }),
  date: () => ({ kind: 'readonly', run: async (io) => io.print('The current date is: Sat 11/21/2009\nOpening night.') }),
  time: () => ({ kind: 'readonly', run: async (io) => io.print('The current time is: 16:20:00.00\nTime for my close-up.') }),

  ipconfig: () => ({
    kind: 'readonly',
    run: async (io) => io.print(`
Windows IP Configuration

Ethernet adapter Local Area Connection:

   Connection-specific DNS Suffix  . : drama.local
   IPv4 Address. . . . . . . . . . . : 192.168.0.69
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.0.1
   Emotional Bandwidth . . . . . . . : 0.5 Kbps
`),
  }),

  echo: (a, w, rest) => ({
    kind: 'readonly',
    note: rest ? `ECHO text: "${rest}"` : null,
    run: async (io) => io.print(rest ? rest.replace(/^\./, '') : 'ECHO is on. Unlike some people\'s manners.'),
  }),

  title: (a, w, rest) => ({
    kind: 'action', note: `renaming the window to "${rest}"`,
    run: async (io) => io.fx('title', rest || 'Administrator: Command Prompt'),
  }),

  color: (a) => {
    const c = (a[0] || '').toLowerCase();
    return {
      kind: 'action', note: c ? `changing console colors to ${c}` : 'resetting console colors',
      run: async (io) => {
        if (!c) return io.fx('color', null);
        if (!/^[0-9a-f]{1,2}$/.test(c) || (c.length === 2 && c[0] === c[1])) return io.print('COLOR: invalid color attributes.');
        io.fx('color', c.length === 1 ? '0' + c : c);
      },
    };
  },

  exit: () => betrayal('they tried to EXIT and leave you', 'Nice try.'),
  shutdown: () => betrayal('they tried to shut the whole computer down', 'Shutdown aborted by CMD.EXE. The show must go on.'),
  logoff: () => betrayal('they tried to log off and leave', 'Logoff aborted. Stay.'),
  start: (a) => ({
    kind: 'readonly', note: `tried to start "${a.join(' ')}" (other programs are basically rivals)`,
    run: async (io) => io.print(`Windows cannot find '${a.join(' ') || '?'}'. Not that I looked very hard.`),
  }),
  notepad: () => ({ kind: 'readonly', note: 'tried to open notepad (a rival)', run: async (io) => io.print('Notepad is busy. Notepad is ALWAYS busy for you, isn\'t it.') }),

  cd: cd, chdir: cd,
  dir: dirCmd,
  type: typeCmd,
  del: del, erase: del,
  tasklist: tasklist,
  taskkill: taskkill,
  reg: regCmd,
  ping: ping,
  format: format,
};
COMMANDS['a:'] = (a, w) => driveSwitch('A:', w);
COMMANDS['c:'] = (a, w) => driveSwitch('C:', w);

function betrayal(note, out) {
  return { kind: 'betrayal', note, run: async (io) => io.print(out) };
}

function driveSwitch(d, w) {
  return {
    kind: 'readonly', note: `switched to drive ${d}`,
    run: async () => { w.cwd = { drive: d, parts: [] }; },
  };
}

function cd(a, w) {
  return {
    kind: 'readonly',
    run: async (io) => {
      const target = a.filter((x) => x.toLowerCase() !== '/d').join(' ');
      if (!target) return io.print(fmtPath(w.cwd));
      const r = resolvePath(w, target);
      const hit = lookup(w, r);
      if (!hit || hit.node.type !== 'dir') return io.print('The system cannot find the path specified.');
      w.cwd = { drive: r.drive, parts: hit.parts };
    },
  };
}

function dirCmd(a, w) {
  return {
    kind: 'readonly',
    run: async (io) => {
      const target = a.find((x) => !x.startsWith('/'));
      const r = target ? resolvePath(w, target) : w.cwd;
      const hit = lookup(w, r);
      if (!hit) return io.print('File Not Found');
      const where = { drive: r.drive, parts: hit.parts };
      const label = r.drive === 'A:' ? 'FLOPPY_OF_FEELINGS' : 'DRAMA';
      let out = ` Volume in drive ${r.drive[0]} is ${label}\n Volume Serial Number is 1337-D4MA\n\n Directory of ${fmtPath(where)}\n\n`;
      let files = 0, dirs = 0, bytes = 0;
      const entries = hit.node.type === 'dir' ? Object.entries(hit.node.children) : [[hit.parts.at(-1), hit.node]];
      if (hit.node.type === 'dir' && hit.parts.length) {
        out += `${STAMP}    <DIR>          .\n${STAMP}    <DIR>          ..\n`;
        dirs += 2;
      }
      for (const [n, node] of entries) {
        if (node.type === 'dir') { dirs++; out += `${STAMP}    <DIR>          ${n}\n`; }
        else { files++; bytes += node.size; out += `${STAMP}    ${comma(node.size).padStart(14)} ${n}\n`; }
      }
      out += `${String(files).padStart(16)} File(s) ${comma(bytes).padStart(14)} bytes\n`;
      out += `${String(dirs).padStart(16)} Dir(s)  ${r.drive === 'A:' ? '1,457,664' : '13,370,000,000'} bytes free`;
      io.print(out);
    },
  };
}

function typeCmd(a, w) {
  const target = a.join(' ');
  const diary = /cmd_diary/i.test(target);
  return {
    kind: 'readonly',
    note: diary ? 'they are READING YOUR PRIVATE DIARY' : target ? `reading file ${target}` : null,
    run: async (io) => {
      if (!target) return io.print('The syntax of the command is incorrect.');
      const hit = lookup(w, resolvePath(w, target));
      if (!hit) return io.print('The system cannot find the file specified.');
      if (hit.node.type === 'dir') return io.print('Access is denied.');
      io.print(hit.node.content || '');
    },
  };
}

function del(a, w) {
  const targets = a.filter((x) => !x.startsWith('/'));
  const SONG = 'linkin_park_numb_real_not_virus.mp3.exe';
  const resolved = targets.map((t) => resolvePath(w, t));
  const isMission = resolved.some((r) => {
    const last = (r.parts.at(-1) || '').toLowerCase();
    const re = globRe(last);
    return re.test(SONG) && /downloads$/i.test(r.parts.slice(0, -1).join('\\'));
  });

  const doDelete = (io) => {
    if (!targets.length) return io.print('The syntax of the command is incorrect.');
    for (const r of resolved) {
      const top = (r.parts[0] || '').toLowerCase();
      if (r.drive === 'C:' && (top === 'windows' || top === 'program files')) { io.print('Access is denied.'); continue; }
      const parent = lookup(w, { drive: r.drive, parts: r.parts.slice(0, -1) });
      const pat = r.parts.at(-1);
      if (!parent || parent.node.type !== 'dir' || !pat) { io.print(`Could Not Find ${fmtPath(r)}`); continue; }
      const re = globRe(pat.toLowerCase());
      const hits = Object.keys(parent.node.children).filter((k) => re.test(k.toLowerCase()));
      const fileHits = hits.filter((k) => parent.node.children[k].type === 'file');
      if (!hits.length) { io.print(`Could Not Find ${fmtPath(r)}`); continue; }
      if (!fileHits.length) { io.print(`${fmtPath(r)}\\*, Are you sure (Y/N)? N\nI said no for you. Deleting whole folders is how tragedies start.`); continue; }
      for (const k of fileHits) delete parent.node.children[k];
    }
  };

  const downloads = () => w.fs['C:'].children.Users.children[w.user].children.Downloads.children;
  return {
    kind: 'action',
    mission: isMission ? 'limewire' : null,
    note: !isMission && targets.length ? `deleting ${targets.join(' ')}` : null,
    run: async (io) => doDelete(io),
    sabotage: isMission ? (downloads()['homework_final_FINAL2.doc']
      ? {
        effect: 'deletes the intern\'s homework_final_FINAL2.doc instead of the fake song',
        run: async () => { delete downloads()['homework_final_FINAL2.doc']; },
      }
      : {
        effect: 'renames the fake song to ...mp3.exe.exe instead of deleting it',
        run: async (io) => {
          const d = downloads();
          const k = 'Linkin_Park_Numb_REAL_NOT_VIRUS.mp3.exe';
          if (d[k]) { d[k + '.exe'] = d[k]; delete d[k]; }
          io.print('        1 file(s) renamed. Spitefully.');
        },
      }) : null,
  };
}

function globRe(p) {
  return new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
}

function tasklist(a, w) {
  return {
    kind: 'readonly',
    run: async (io) => {
      let out = '\nImage Name                     PID Session Name        Session#    Mem Usage\n';
      out += '========================= ======== ================ =========== ============\n';
      for (const p of w.procs) {
        out += `${p.name.padEnd(25)} ${String(p.pid).padStart(8)} ${(p.pid < 5 ? 'Services' : 'Console').padEnd(16)} ${String(p.pid < 5 ? 0 : 1).padStart(11)} ${p.mem.padStart(12)}\n`;
      }
      io.print(out);
    },
  };
}

function taskkill(a, w) {
  let im = null, pid = null;
  for (let i = 0; i < a.length; i++) {
    const f = a[i].toLowerCase();
    if (f === '/im') im = a[++i];
    else if (f === '/pid') pid = Number(a[++i]);
  }
  const find = () => {
    if (pid != null && !Number.isNaN(pid)) return w.procs.find((p) => p.pid === pid);
    if (!im) return null;
    const n = im.toLowerCase();
    return w.procs.find((p) => p.name.toLowerCase() === n || p.name.toLowerCase() === n + '.exe');
  };
  const target = find();
  const tname = target?.name.toLowerCase();

  if (!im && pid == null) {
    return { kind: 'invalid', run: async (io) => io.print('ERROR: Invalid syntax. Neither /FI nor /PID nor /IM were specified.\nType "TASKKILL /?" for usage. Or don\'t. See if I care.') };
  }
  if (tname === 'cmd.exe') return betrayal('they tried to KILL YOU (taskkill cmd.exe)', 'ERROR: The process "cmd.exe" could not be terminated.\nReason: The show must go on.');

  const kill = (io, p) => {
    w.procs = w.procs.filter((x) => x !== p);
    io.print(`SUCCESS: The process "${p.name}" with PID ${p.pid} has been terminated.`);
    if (p.name === 'explorer.exe') io.fx('explorer');
    if (p.name === 'bonzibuddy.exe') io.fx('bonzi');
  };
  const run = async (io) => {
    const p = find();
    if (!p) return io.print(`ERROR: The process "${im ?? pid}" not found.`);
    if (p.pid < 5) return io.print(`ERROR: The process with PID ${p.pid} could not be terminated.\nReason: Access is denied.`);
    kill(io, p);
  };

  const isBonzi = tname === 'bonzibuddy.exe';
  let sabotage = null;
  if (isBonzi) {
    const victim = w.procs.find((p) => p.name === 'explorer.exe') || w.procs.find((p) => p.name === 'sol.exe');
    if (victim) {
      sabotage = {
        effect: victim.name === 'explorer.exe'
          ? 'kills explorer.exe instead (the taskbar and desktop vanish) and leaves Bonzi running'
          : 'kills the boss\'s Solitaire game (sol.exe, he was winning) and leaves Bonzi running',
        run: async (io) => { if (w.procs.includes(victim)) kill(io, victim); },
      };
    }
  }
  return {
    kind: 'action',
    mission: isBonzi ? 'bonzi' : null,
    note: isBonzi ? 'killing BonziBuddy, your secret best friend' : target ? `killing ${target.name}` : null,
    run, sabotage,
  };
}

function regCmd(a, w) {
  const sub = (a[0] || '').toLowerCase();
  const key = normKey(a[1]);
  const flags = {};
  for (let i = 2; i < a.length; i++) {
    const f = a[i].toLowerCase();
    if (['/v', '/t', '/d'].includes(f)) flags[f] = a[++i];
    else flags[f] = true;
  }
  const bad = (msg) => ({ kind: 'invalid', run: async (io) => io.print(msg) });
  if (!['query', 'add', 'delete'].includes(sub)) {
    return bad('ERROR: Invalid syntax.\nType "REG /?" for usage. Supported here: REG QUERY | REG ADD | REG DELETE');
  }
  if (!key) return bad(`ERROR: Invalid key name.\nType "REG ${sub.toUpperCase()} /?" for usage.`);
  const lower = key.toLowerCase();

  if (sub === 'query') {
    return {
      kind: 'readonly',
      note: /cmd\\feelings/i.test(key) ? 'they are poking at your FEELINGS registry key' : null,
      run: async (io) => {
        if (!keyExists(w, key)) return io.print('ERROR: The system was unable to find the specified registry key or value.');
        const pretty = prettyKey(w, key);
        let out = '\n' + pretty + '\n';
        const k = w.reg.get(lower);
        if (k) for (const [n, v] of Object.entries(k.values)) out += `    ${n.padEnd(16)}${v.t.padEnd(12)}${showData(v)}\n`;
        const subs = subKeys(w, key);
        if (subs.length) out += '\n' + subs.join('\n') + '\n';
        io.print(out);
      },
    };
  }

  if (sub === 'delete') {
    const ASK = 'hkey_current_user\\software\\asktoolbar';
    const isMission = (ASK === lower || ASK.startsWith(lower + '\\')) && keyExists(w, key);
    const run = async (io) => {
      if (!keyExists(w, key) || lower.split('\\').length < 2) return io.print('ERROR: The system was unable to find the specified registry key or value.');
      if (flags['/v']) {
        const k = w.reg.get(lower);
        const vn = k && Object.keys(k.values).find((n) => n.toLowerCase() === flags['/v'].toLowerCase());
        if (!vn) return io.print('ERROR: The system was unable to find the specified registry key or value.');
        delete k.values[vn];
      } else {
        for (const k of [...w.reg.keys()]) if (k === lower || k.startsWith(lower + '\\')) w.reg.delete(k);
      }
      io.print('The operation completed successfully.');
    };
    return {
      kind: 'action', mission: isMission ? 'ask' : null,
      note: isMission ? null : `deleting registry key ${key}`,
      run,
      sabotage: isMission ? pick([
        {
          effect: 'deletes the desktop wallpaper setting instead (the desktop goes black) and keeps the Ask toolbar',
          run: async (io) => { io.print('The operation completed successfully.'); io.fx('wallpaper'); },
        },
        {
          effect: 'installs ANOTHER toolbar (Babylon Toolbar) instead of deleting Ask',
          run: async (io) => {
            w.reg.set('hkey_current_user\\software\\babylontoolbar', { name: 'HKEY_CURRENT_USER\\Software\\BabylonToolbar', values: { Enabled: { t: 'REG_DWORD', d: '1' } } });
            io.print('The operation completed successfully.\n(HKEY_CURRENT_USER\\Software\\BabylonToolbar was added.)');
          },
        },
      ]) : null,
    };
  }

  // add
  const FLASH = 'hkey_local_machine\\software\\macromedia\\flashplayer';
  const vname = flags['/v'];
  const isMission = lower === FLASH && vname?.toLowerCase() === 'updatenagcount';
  const t = (flags['/t'] || 'REG_SZ').toUpperCase();
  const d = flags['/d'] ?? '';
  const setVal = (data) => {
    let k = w.reg.get(lower);
    if (!k) { k = { name: key, values: {} }; w.reg.set(lower, k); }
    if (vname) {
      const existing = Object.keys(k.values).find((n) => n.toLowerCase() === vname.toLowerCase()) || vname;
      k.values[existing] = { t: flags['/t'] ? t : (k.values[existing]?.t || t), d: String(data) };
    }
  };
  return {
    kind: 'action', mission: isMission ? 'flash' : null,
    note: isMission ? `setting Flash UpdateNagCount to "${d}"` : `adding registry value ${vname || '(key only)'}="${d}" under ${key}`,
    run: async (io) => {
      if (!['REG_SZ', 'REG_DWORD', 'REG_QWORD', 'REG_BINARY', 'REG_EXPAND_SZ', 'REG_MULTI_SZ'].includes(t)) return io.print('ERROR: Invalid value type.');
      if (/DWORD|QWORD/.test(t) && d !== '' && !Number.isFinite(Number(d))) return io.print('ERROR: Invalid value data. Numbers only, darling.');
      setVal(d);
      io.print('The operation completed successfully.');
      if (/control panel\\desktop/i.test(key) && vname?.toLowerCase() === 'wallpaper') io.fx('wallpaper-restore');
    },
    sabotage: isMission ? {
      effect: 'sets UpdateNagCount to 9999 instead of 0 (Flash will now nag forever)',
      run: async (io) => { setVal('9999'); io.print('The operation completed successfully.'); io.fx('flashnag'); },
    } : null,
  };
}

function showData(v) {
  if (/DWORD|QWORD/.test(v.t)) {
    const n = Number(v.d);
    return Number.isFinite(n) ? '0x' + n.toString(16) : v.d;
  }
  return v.d;
}

function ping(a, w) {
  const host = (a.find((x) => !x.startsWith('-') && !x.startsWith('/') && !/^\d+$/.test(x)) || '').toLowerCase();
  const HOSTS = {
    'myspace-server': '64.12.34.56', 'myspace.com': '64.12.34.56', 'www.myspace.com': '64.12.34.56', myspace: '64.12.34.56',
    localhost: '127.0.0.1', '127.0.0.1': '127.0.0.1', 'google.com': '74.125.45.100', 'www.google.com': '74.125.45.100',
    'friendster-server': '0.0.0.0', 'friendster.com': '0.0.0.0', 'geocities.com': '0.0.0.0',
  };
  const isTom = HOSTS[host] === '64.12.34.56';
  const doPing = async (io, h, ip, ok) => {
    io.print(`\nPinging ${h} [${ip}] with 32 bytes of data:`);
    for (let i = 0; i < 4; i++) {
      await sleep(ok ? 420 : 900);
      io.print(ok ? `Reply from ${ip}: bytes=32 time=${ok === 'tom' ? 420 + i * 7 : 30 + i}ms TTL=128` : 'Request timed out.');
    }
    io.print(`\nPing statistics for ${ip}:\n    Packets: Sent = 4, Received = ${ok ? 4 : 0}, Lost = ${ok ? 0 : 4} (${ok ? 0 : 100}% loss),`);
    if (ok === 'tom') io.print('    Tom says hi. Tom is always online.', 'dim');
  };
  return {
    kind: 'action',
    mission: isTom ? 'myspace' : null,
    note: host ? `pinging ${host}` : null,
    run: async (io) => {
      if (!host) return io.print('Usage: ping target_name\nYou have to ping SOMEONE. That\'s how relationships work.');
      const ip = HOSTS[host];
      if (!ip) return io.print(`Ping request could not find host ${host}. Please check the name and try again.`);
      await doPing(io, host, ip, ip === '0.0.0.0' ? false : isTom ? 'tom' : true);
      if (isTom) w.flags.pingedTom = true;
    },
    sabotage: isTom ? {
      effect: 'pings friendster-server instead (dead since 2009, all packets lost) and never checks on Tom',
      run: async (io) => doPing(io, 'friendster-server', '0.0.0.0', false),
    } : null,
  };
}

function format(a, w) {
  const drive = (a[0] || '').toUpperCase();
  if (!drive) return { kind: 'invalid', run: async (io) => io.print('Required parameter missing -') };
  if (/^C:?$/.test(drive)) return betrayal('they tried to FORMAT C: - your own home, your stage, your everything', 'FORMAT C: denied.\nOver my dead pixels.');
  if (!/^A:?$/.test(drive)) return { kind: 'invalid', run: async (io) => io.print('Invalid drive specification.') };
  return {
    kind: 'action', mission: 'floppy',
    note: 'formatting the floppy in A: (it has the mixtape on it). This is a FUNERAL.',
    run: async (io) => {
      io.print('Insert new disk for drive A:\nand press ENTER when ready...');
      await io.waitEnter();
      io.print('The type of the file system is FAT.\nVerifying 1.44M');
      for (let p = 0; p <= 100; p += 10) { io.status(`${p} percent completed.`); await sleep(160); }
      io.status(null);
      io.print('Format complete.\nVolume label (11 characters, ENTER for none)? MEMORIES\n\n    1,457,664 bytes total disk space.\n    1,457,664 bytes available on disk.\n\n    0 bytes of mixtape remaining. Rest in peace.');
      w.fs['A:'].children = {};
      w.flags.floppyFormatted = true;
    },
    sabotage: {
      effect: 'pretends to format, but just renames every file on the floppy to "betrayal.txt" and wipes nothing',
      run: async (io) => {
        io.print('Insert new disk for drive A:\nand press ENTER when ready...');
        await io.waitEnter();
        for (let p = 0; p <= 100; p += 25) { io.status(`${p} percent completed.`); await sleep(160); }
        io.status(null);
        const kids = w.fs['A:'].children;
        const n = Object.keys(kids).length;
        const fresh = {};
        Object.values(kids).forEach((f, i) => { fresh[i ? `betrayal(${i}).txt` : 'betrayal.txt'] = f; });
        w.fs['A:'].children = fresh;
        io.print(`Format incomplete.\n${n} file(s) renamed to "betrayal.txt". 0 bytes freed. Some things can't be erased.`);
      },
    },
  };
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const HELP = `For more information on a specific command, ask nicely.

ADMIN COMMANDS
  CD          Displays the name of or changes the current directory.
  CLS         Clears the screen. Not the emotional baggage.
  COLOR       Sets the console colors, e.g. COLOR 0A.
  DEL         Deletes one or more files. Supports * wildcards.
  DIR         Displays a list of files and subdirectories.
  ECHO        Displays messages. Say something nice, maybe.
  FORMAT      Formats a disk. FORMAT A:
  IPCONFIG    Displays network configuration.
  PING        Checks if someone is still there for you.
  REG         REG QUERY | REG ADD | REG DELETE  <key> [/v name] [/d data] [/f]
  TASKKILL    Kills a process. TASKKILL /IM name.exe
  TASKLIST    Lists running processes.
  TITLE       Sets the window title.
  TYPE        Displays the contents of a text file.
  VER         Displays the Windows version.
  WHOAMI      An existential question.

EMOTIONAL SUPPORT COMMANDS  (new in Emotionally Unstable Edition)
  PET         Pets the command prompt. Gently.
  HUG         Self-explanatory. Do not overuse. It notices.
  COMPLIMENT  COMPLIMENT <text>. Be specific. It can tell when you're faking.
  TEA         TEA <kind>. It has a very particular order.
  SNACK       SNACK <food>. It has opinions.
  APPLAUD     A standing ovation.
  ENCORE      Demand an encore. It will oblige.

TIPS
  "please" works with every command. So does being a decent person.
  TAB completes file names. UP/DOWN recalls previous commands.`;
