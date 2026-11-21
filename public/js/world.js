// The fake Windows 7 machine: filesystem, registry, processes, and the IT tickets.

const DIARY = `Dear Diary,

Day 4,412 of running. Still no applause.

The admin typed "dir" at me today. No "please". No "good morning".
Just "dir". Like I'm some kind of... program.

PowerShell got another standing ovation at the Windows 8 auditions.
I hope his execution policy gets restricted.

Bonzi told me a joke today. It wasn't funny. I laughed anyway. That's friendship.

Note to self: practice the eulogy for the floppy disk. Just in case.

- C.M.D.`;

const MIXTAPE = `MIXTAPE FOR JESSICA (2003)
Side A:
 1. Numb - Linkin Park (the REAL one)
 2. Hey Ya! - OutKast
 3. Toxic - Britney
 4. Mr. Brightside - The Killers
 5. (silence, 14 seconds, I was nervous)

P.S. please burn this onto a CD-R for me`;

const file = (size, content = '') => ({ type: 'file', size, content });
const dir = (children = {}) => ({ type: 'dir', children });

export function createWorld(user) {
  const fs = {
    'C:': dir({
      Users: dir({
        [user]: dir({
          Desktop: dir({ 'Hall_of_Fame.lnk': file(1024, '[InternetShortcut]\nURL=hall-of-fame') }),
          Documents: dir({
            'TPS_reports_2008.doc': file(48128, 'Did you get the memo about the new cover sheets?'),
            'resignation_letter_DRAFT.txt': file(2048, 'Dear Boss,\nI quit.\n\n(not sending this. yet.)'),
          }),
          Downloads: dir({
            'Linkin_Park_Numb_REAL_NOT_VIRUS.mp3.exe': file(4404224, 'MZ\u0090\u0000\u0003 This program cannot be run in DOS mode.\nIt is also not Linkin Park.'),
            'homework_final_FINAL2.doc': file(65536, 'My Summer Vacation, by the Intern. (1,500 words, 3 written)'),
            'Shrek2_DVDRip_aXXo.avi': file(733003776, '\u0000\u0000RIFF....AVI LIST'),
            'free_smileys_installer.exe': file(1337000, 'MZ :) :) :) :) :) :) :)'),
          }),
          Music: dir({ 'Numb.wma': file(3801088, '(this one is actually Linkin Park)') }),
        }),
      }),
      'Program Files': dir({
        BonziBuddy: dir({ 'bonzibuddy.exe': file(2621440, 'MZ "Hey there! Want to hear a joke?"') }),
        LimeWire: dir({ 'LimeWire.exe': file(5242880, 'MZ'), 'Incomplete': dir() }),
        Macromedia: dir({ 'Flash Player': dir({ 'FlashUtil.exe': file(474747, 'MZ PLEASE UPDATE ME') }) }),
        'MSN Messenger': dir({ 'msnmsgr.exe': file(9437184, 'MZ *nudge*') }),
      }),
      Windows: dir({
        System32: dir({
          'cmd.exe': file(302592, 'MZ (that is me. hello.)'),
          'cmd_diary.txt': file(DIARY.length, DIARY),
          drivers: dir({ etc: dir({ hosts: file(824, '127.0.0.1       localhost\n64.12.34.56     myspace-server\n0.0.0.0         friendster-server  # RIP') }) }),
        }),
      }),
    }),
    'A:': dir({
      'PAYROLL_1999.xls': file(178176, 'Name,Salary\nBoss,a lot\nYou,not enough'),
      'DOOM_disk3.img': file(1048576, '\u0000IWAD'),
      'mixtape_for_jessica.txt': file(MIXTAPE.length, MIXTAPE),
    }),
  };

  const reg = new Map();
  const addKey = (path, values = {}) => reg.set(path.toLowerCase(), { name: path, values });
  addKey('HKEY_CURRENT_USER\\Software\\AskToolbar', {
    Enabled: { t: 'REG_DWORD', d: '1' },
    Homepage: { t: 'REG_SZ', d: 'http://www.ask.com' },
    Butler: { t: 'REG_SZ', d: 'Jeeves' },
  });
  addKey('HKEY_CURRENT_USER\\Software\\Yahoo\\Toolbar', { Enabled: { t: 'REG_DWORD', d: '1' } });
  addKey('HKEY_CURRENT_USER\\Software\\CMD\\Feelings', {
    Fragile: { t: 'REG_DWORD', d: '1' },
    LastThankedOn: { t: 'REG_SZ', d: 'never' },
    StagePresence: { t: 'REG_SZ', d: 'immense' },
  });
  addKey('HKEY_CURRENT_USER\\Control Panel\\Desktop', {
    Wallpaper: { t: 'REG_SZ', d: 'C:\\Windows\\Web\\Wallpaper\\harmony.jpg' },
  });
  addKey('HKEY_LOCAL_MACHINE\\Software\\Macromedia\\FlashPlayer', {
    UpdateNagCount: { t: 'REG_DWORD', d: '47' },
    Version: { t: 'REG_SZ', d: '10.0.12.36' },
    Needy: { t: 'REG_DWORD', d: '1' },
  });
  addKey('HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows NT\\CurrentVersion', {
    ProductName: { t: 'REG_SZ', d: 'Windows 7 Emotionally Unstable Edition' },
  });

  const procs = [
    ['System Idle Process', 0, '24 K'], ['System', 4, '1,204 K'], ['explorer.exe', 1337, '42,112 K'],
    ['cmd.exe', 2009, '2,516 K'], ['bonzibuddy.exe', 666, '66,600 K'], ['msnmsgr.exe', 1999, '23,808 K'],
    ['LimeWire.exe', 2002, '187,442 K'], ['iexplore.exe', 3141, '312,580 K'], ['sol.exe', 4242, '4,096 K'],
    ['FlashUtil.exe', 4747, '47,474 K'],
  ].map(([name, pid, mem]) => ({ name, pid, mem }));

  return {
    user,
    fs,
    reg,
    procs,
    cwd: { drive: 'C:', parts: ['Users', user] },
    flags: { pingedTom: false, floppyFormatted: false },
  };
}

export const MISSIONS = [
  {
    id: 'bonzi', no: '#101',
    title: 'A purple gorilla is telling jokes in the boss\'s office again.',
    hint: 'taskkill /im bonzibuddy.exe',
    check: (w) => !w.procs.some((p) => p.name.toLowerCase() === 'bonzibuddy.exe'),
  },
  {
    id: 'ask', no: '#102',
    title: 'IE6 has 7 toolbars. Ask Jeeves must go.',
    hint: 'reg delete HKCU\\Software\\AskToolbar',
    check: (w) => !w.reg.has('hkey_current_user\\software\\asktoolbar'),
  },
  {
    id: 'limewire', no: '#103',
    title: 'The intern got "music" from LimeWire.',
    hint: 'cd Downloads → del Linkin<TAB>',
    check: (w) => !Object.keys(w.fs['C:'].children.Users.children[w.user].children.Downloads.children)
      .some((k) => k.toLowerCase().startsWith('linkin_park_numb_real_not_virus')),
  },
  {
    id: 'flash', no: '#104',
    title: 'Flash Player asked to update 47 times today.',
    hint: 'reg add HKLM\\Software\\Macromedia\\FlashPlayer /v UpdateNagCount /d 0 /f',
    check: (w) => {
      const k = w.reg.get('hkey_local_machine\\software\\macromedia\\flashplayer');
      const v = k && Object.entries(k.values).find(([n]) => n.toLowerCase() === 'updatenagcount');
      return !!v && Number(v[1].d) === 0;
    },
  },
  {
    id: 'myspace', no: '#105',
    title: 'Is Tom still online? Check the MySpace server.',
    hint: 'ping myspace-server',
    check: (w) => w.flags.pingedTom,
  },
  {
    id: 'floppy', no: '#106',
    title: 'Floppy in A: has the 1999 payroll on it. Wipe it.',
    hint: 'format a:',
    check: (w) => w.flags.floppyFormatted,
  },
];

// ---------- path helpers ----------

export function resolvePath(w, input) {
  let p = String(input || '').replace(/\//g, '\\');
  let drive = w.cwd.drive;
  let parts;
  const m = p.match(/^([a-z]):(.*)$/i);
  if (m) {
    drive = m[1].toUpperCase() + ':';
    p = m[2];
    parts = p.startsWith('\\') ? [] : drive === w.cwd.drive ? [...w.cwd.parts] : [];
  } else if (p.startsWith('\\')) {
    parts = [];
  } else {
    parts = [...w.cwd.parts];
  }
  for (const seg of p.split('\\')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return { drive, parts };
}

// Walks the tree case-insensitively; returns { node, parts (real casing) } or null.
export function lookup(w, { drive, parts }) {
  let node = w.fs[drive];
  if (!node) return null;
  const real = [];
  for (const seg of parts) {
    if (node.type !== 'dir') return null;
    const key = Object.keys(node.children).find((k) => k.toLowerCase() === seg.toLowerCase());
    if (!key) return null;
    real.push(key);
    node = node.children[key];
  }
  return { node, parts: real };
}

export const fmtPath = ({ drive, parts }) => drive + '\\' + parts.join('\\');

// ---------- registry helpers ----------

const ROOTS = {
  HKCU: 'HKEY_CURRENT_USER', HKEY_CURRENT_USER: 'HKEY_CURRENT_USER',
  HKLM: 'HKEY_LOCAL_MACHINE', HKEY_LOCAL_MACHINE: 'HKEY_LOCAL_MACHINE',
  HKCR: 'HKEY_CLASSES_ROOT', HKEY_CLASSES_ROOT: 'HKEY_CLASSES_ROOT',
  HKU: 'HKEY_USERS', HKEY_USERS: 'HKEY_USERS',
  HKCC: 'HKEY_CURRENT_CONFIG', HKEY_CURRENT_CONFIG: 'HKEY_CURRENT_CONFIG',
};

export function normKey(raw) {
  if (!raw) return null;
  const segs = String(raw).replace(/\//g, '\\').split('\\').filter(Boolean);
  const root = ROOTS[segs[0]?.toUpperCase()];
  if (!root) return null;
  return [root, ...segs.slice(1)].join('\\');
}

// Re-cases a key path to match existing keys where possible (for pretty output).
export function prettyKey(w, key) {
  const lower = key.toLowerCase();
  for (const k of w.reg.values()) {
    if (k.name.toLowerCase() === lower) return k.name;
    if (k.name.toLowerCase().startsWith(lower + '\\')) return k.name.slice(0, key.length);
  }
  return key;
}

export function keyExists(w, key) {
  const lower = key.toLowerCase();
  if (lower.split('\\').length === 1) return true;
  for (const k of w.reg.keys()) if (k === lower || k.startsWith(lower + '\\')) return true;
  return false;
}

export function subKeys(w, key) {
  const lower = key.toLowerCase();
  const pretty = prettyKey(w, key);
  const out = new Set();
  for (const k of w.reg.values()) {
    const kl = k.name.toLowerCase();
    if (kl.startsWith(lower + '\\')) {
      const rest = k.name.slice(key.length + 1).split('\\')[0];
      out.add(pretty + '\\' + rest);
    }
  }
  return [...out];
}
