/**
 * Sound, synthesized so the demo ships as one file (the scream is the only recording).
 * To swap in SFX files later, keep the same function names.
 */
import screamUrl from '../assets/scream.mp3';

let ctx: AudioContext | null = null;
let muted = false;

export function initAudio(): void {
  try {
    if (!ctx) ctx = new AudioContext();
    void ctx.resume();
    hum();
  } catch {
    ctx = null;
  }
}

/**
 * The scream on the "IT GOT IN" screen: the team's original recording, trimmed so it starts the instant the
 * face appears, layered with a pitched-down growl, a pitched-up shriek and a burst of static, then compressed.
 */
const scream = new Audio(screamUrl);
scream.preload = 'auto';

function playScream(): void {
  if (muted) return;
  scream.currentTime = 0;
  scream.volume = 1;
  void scream.play().catch(() => {
    /* browser blocked playback: the screen still shows */
  });
}

export function toggleMute(): boolean {
  muted = !muted;
  if (ctx) void (muted ? ctx.suspend() : ctx.resume());
  return muted;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number): void {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur);
}

function noise(dur: number, gain: number): void {
  if (!ctx || muted) return;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(g).connect(ctx.destination);
  src.start();
}

// ---- Ambience -------------------------------------------------------------------------------
// The background is built from four layers, all synthesized:
//   1. two low drones a semitone apart, so they grind against each other
//   2. a thin high whine that drifts out of tune
//   3. wind: filtered noise that swells and fades
//   4. something in the building every 8 to 24 seconds: a groan, knocks, breath, a few notes of a broken lullaby
// setDread() pushes all of it harder as the night goes on.
let amb: GainNode | null = null;
let whine: OscillatorNode[] = [];
let dread = 0;
let applied = -1;
let hushedUntil = 0;
let beat: ReturnType<typeof setInterval> | null = null;

function noiseBuffer(seconds: number): AudioBuffer {
  const buf = ctx!.createBuffer(1, Math.floor(ctx!.sampleRate * seconds), ctx!.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** A slow wobble wired into any parameter. */
function lfo(target: AudioParam, hz: number, depth: number): void {
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.frequency.value = hz;
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
}

function hum(): void {
  if (!ctx || amb) return;
  amb = ctx.createGain();
  amb.gain.value = 0.5;
  amb.connect(ctx.destination);

  // 1. Drones: A1 against A#1 through a low-pass. The clash makes a slow uneven throb.
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 240;
  low.connect(amb);
  for (const [freq, gain] of [[55, 0.05], [58.27, 0.04], [27.5, 0.05]] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    g.gain.value = gain;
    lfo(g.gain, 0.05 + Math.random() * 0.06, gain * 0.5);
    o.connect(g).connect(low);
    o.start();
  }

  // 2. Whine: two high notes a semitone apart, barely there, each wandering off pitch.
  whine = [1479.98, 1567.98].map((freq) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = 0.004;
    lfo(o.frequency, 0.04 + Math.random() * 0.05, 9);
    lfo(g.gain, 0.09 + Math.random() * 0.07, 0.003);
    o.connect(g).connect(amb!);
    o.start();
    return o;
  });

  // 3. Wind.
  const wind = ctx.createBufferSource();
  const band = ctx.createBiquadFilter();
  const wg = ctx.createGain();
  wind.buffer = noiseBuffer(4);
  wind.loop = true;
  band.type = 'bandpass';
  band.frequency.value = 420;
  band.Q.value = 0.9;
  wg.gain.value = 0.03;
  lfo(band.frequency, 0.06, 260);
  lfo(wg.gain, 0.045, 0.022);
  wind.connect(band).connect(wg).connect(amb);
  wind.start();

  scheduleEvent();
}

/** One soft voice into the ambience: fades in, slides, fades out. */
function voice(type: OscillatorType, from: number, to: number, dur: number, gain: number, when = 0, cutoff = 0): void {
  if (!ctx || !amb || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    o.connect(f).connect(g);
  } else o.connect(g);
  g.connect(amb);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A breath of filtered noise. */
function breath(dur: number, gain: number, centre: number): void {
  if (!ctx || !amb || muted) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = noiseBuffer(dur);
  f.type = 'bandpass';
  f.frequency.value = centre;
  f.Q.value = 2.5;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(amb);
  src.start(t);
}

const EVENTS: (() => void)[] = [
  // Metal settling somewhere above.
  () => { voice('sawtooth', 74, 49, 3.2, 0.09, 0, 300); voice('sawtooth', 111, 70, 2.6, 0.04, 0.3, 420); },
  // Two or three knocks, far off.
  () => { const n = 2 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) voice('sine', 95, 48, 0.22, 0.2, i * (0.34 + Math.random() * 0.1)); },
  // Something exhales.
  () => breath(1.6 + Math.random(), 0.05, 1500 + Math.random() * 900),
  // A rising tone that cuts off.
  () => voice('sine', 880, 1245, 2.4, 0.012),
  // A broken lullaby: a few notes of a music box, slightly flat, the last one wrong.
  () => {
    const notes = [659.25, 587.33, 523.25, 587.33, 466.16];
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = notes[i] * (0.985 + Math.random() * 0.01);
      voice('triangle', f, f * 0.994, 1.5, 0.022, i * 0.62);
      voice('sine', f * 2, f * 1.988, 0.9, 0.006, i * 0.62);
    }
  },
  // Dragging.
  () => { breath(2.4, 0.06, 240); voice('sawtooth', 52, 46, 2.4, 0.05, 0, 180); },
];

function scheduleEvent(): void {
  const waitMs = (8000 + Math.random() * 16000) * (1 - dread * 0.45);
  setTimeout(() => {
    if (ctx && ctx.state === 'running' && !muted) EVENTS[Math.floor(Math.random() * EVENTS.length)]();
    scheduleEvent();
  }, waitMs);
}

/**
 * How far into the night we are, 0 to 1. The ambience gets louder, the whine climbs, and things in the
 * building happen more often. Call it as often as you like.
 */
export function setDread(level: number): void {
  dread = Math.max(0, Math.min(1, level));
  if (!ctx || !amb) return;
  const t = ctx.currentTime;
  if (t < hushedUntil || Math.abs(dread - applied) < 0.01) return; // nothing new to say, or holding a silence
  applied = dread;
  amb.gain.setTargetAtTime(0.5 + dread * 0.7, t, 1.5);
  whine.forEach((o, i) => o.frequency.setTargetAtTime([1479.98, 1567.98][i] * (1 + dread * 0.12), t, 3));
}

/** A heartbeat while something is at a door. Safe to call every frame. */
export function setHeartbeat(on: boolean): void {
  if (on && !beat) {
    const thump = () => { tone(58, 0.16, 'sine', 0.3, 0, 38); tone(52, 0.2, 'sine', 0.22, 0.24, 34); };
    thump();
    beat = setInterval(thump, 760);
  } else if (!on && beat) {
    clearInterval(beat);
    beat = null;
  }
}

/** Everything stops dead for a moment: used just before the scream so it lands in silence. */
export function hush(seconds: number): void {
  if (!ctx || !amb) return;
  const t = ctx.currentTime;
  amb.gain.cancelScheduledValues(t);
  amb.gain.setValueAtTime(0.0001, t);
  amb.gain.setTargetAtTime(0.5 + dread * 0.7, t + seconds, 2);
  hushedUntil = t + seconds;
  applied = -1;
}

export const sfx = {
  door: () => { tone(90, 0.22, 'square', 0.12, 0, 40); noise(0.12, 0.08); },
  static: () => noise(0.28, 0.06),
  // The decision clock ran out: two falling notes.
  timeout: () => { tone(520, 0.16, 'square', 0.06, 0, 300); tone(300, 0.3, 'square', 0.06, 0.16, 150); },
  monitor: () => { noise(0.07, 0.07); tone(310, 0.09, 'square', 0.035, 0, 170); },
  // It is in the room: a long breath, close, and a low note under it.
  inside: () => { breath(2.6, 0.16, 620); voice('sine', 46, 41, 3, 0.2); },
  glitch: () => { noise(0.14, 0.09); tone(140, 0.12, 'sawtooth', 0.03, 0, 60); },
  fakeout: () => { noise(0.3, 0.22); tone(1900, 0.26, 'sawtooth', 0.05, 0, 2600); },
  task: () => { tone(660, 0.09, 'sine', 0.06); tone(880, 0.12, 'sine', 0.06, 0.1); },
  resolve: () => tone(440, 0.08, 'triangle', 0.05),
  steps: () => { for (let i = 0; i < 6; i++) tone(70, 0.14, 'sine', 0.22, i * 0.42, 45); },
  floor: () => tone(220, 0.5, 'sine', 0.05, 0, 110),
  powerout: () => { hush(1.2); tone(200, 1.1, 'sawtooth', 0.1, 0, 30); },
  caught: () => { setHeartbeat(false); hush(2.5); noise(0.5, 0.2); playScream(); },
  survived: () => { setHeartbeat(false); hush(4); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 1.6, 'sine', 0.06, 0.9 + i * 0.45)); tone(523, 0.3, 'sine', 0.07); tone(784, 0.6, 'sine', 0.07, 0.3); },
};
