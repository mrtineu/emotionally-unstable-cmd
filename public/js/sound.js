// Original retro sounds, synthesized with WebAudio (no sampled files).
let ctx = null;
let master = null;
let muted = false;
try { muted = localStorage.getItem('eucmd-muted') === '1'; } catch { /* ignore */ }

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('eucmd-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.value = muted ? 0 : 0.35;
  return muted;
}

function tone(freq, start, dur, { type = 'sine', vol = 0.5, attack = 0.01, glide = null } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(start, dur, vol = 0.3, filterFreq = 2000) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  // warm rising pad, a vaguely "operating system booting" feeling
  startup() {
    [[261.6, 0], [329.6, 0.18], [392, 0.36], [523.3, 0.54], [659.3, 0.72]].forEach(([f, s]) =>
      tone(f, s, 2.2 - s, { type: 'triangle', vol: 0.22, attack: 0.25 }));
    tone(130.8, 0, 2.6, { type: 'sine', vol: 0.25, attack: 0.4 });
  },
  ding() {
    tone(880, 0, 0.35, { type: 'triangle', vol: 0.4 });
    tone(660, 0.12, 0.5, { type: 'triangle', vol: 0.35 });
  },
  good() {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.06, 0.25, { type: 'sine', vol: 0.18 }));
  },
  bad() {
    tone(220, 0, 0.35, { type: 'sawtooth', vol: 0.12, glide: 110 });
    tone(233, 0.02, 0.35, { type: 'square', vol: 0.06, glide: 116 });
  },
  ticket() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.4, { type: 'triangle', vol: 0.25 }));
  },
  popup() {
    tone(587, 0, 0.18, { type: 'square', vol: 0.12 });
    tone(440, 0.15, 0.3, { type: 'square', vol: 0.12 });
  },
  applause() {
    for (let i = 0; i < 26; i++) noise(i * 0.06 + Math.random() * 0.04, 0.05, 0.25 + Math.random() * 0.2, 1500 + Math.random() * 2500);
  },
  bsod() {
    tone(60, 0, 1.6, { type: 'sawtooth', vol: 0.3 });
    tone(63, 0, 1.6, { type: 'square', vol: 0.15 });
    noise(0, 0.5, 0.4, 400);
  },
  key() {
    noise(0, 0.02, 0.06, 3500);
  },
  win() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => tone(f, i * 0.13, 0.45, { type: 'triangle', vol: 0.25 }));
    setTimeout(() => sfx.applause(), 900);
  },
};
