/**
 * Placeholder sound, synthesized so the demo ships as one file.
 * The spec cuts procedural audio from the MVP: swap these for free SFX files and keep the same function names.
 */
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

let humming = false;
function hum(): void {
  if (!ctx || humming) return;
  humming = true;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.value = 55;
  g.gain.value = 0.012;
  o.connect(g).connect(ctx.destination);
  o.start();
}

export const sfx = {
  door: () => { tone(90, 0.22, 'square', 0.12, 0, 40); noise(0.12, 0.08); },
  static: () => noise(0.28, 0.06),
  task: () => { tone(660, 0.09, 'sine', 0.06); tone(880, 0.12, 'sine', 0.06, 0.1); },
  resolve: () => tone(440, 0.08, 'triangle', 0.05),
  steps: () => { for (let i = 0; i < 6; i++) tone(70, 0.14, 'sine', 0.22, i * 0.42, 45); },
  floor: () => tone(220, 0.5, 'sine', 0.05, 0, 110),
  powerout: () => tone(200, 1.1, 'sawtooth', 0.1, 0, 30),
  caught: () => { noise(1.1, 0.3); tone(120, 1.0, 'sawtooth', 0.18, 0, 50); },
  survived: () => { tone(523, 0.3, 'sine', 0.07); tone(784, 0.6, 'sine', 0.07, 0.3); },
};
