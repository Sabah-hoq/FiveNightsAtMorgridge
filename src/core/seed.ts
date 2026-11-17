import type { Cam, Mode, RunConfig, Side, Tactic, WatchSlot } from './types';

export const TACTICS: Tactic[] = ['helpful', 'urgent', 'authority', 'flattering'];

/** FNV-1a string hash -> 32-bit seed. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small deterministic RNG, easy to port 1:1 to GDScript. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TASK_COUNT = 7;
const HONEST_OPENERS = 2;
/** 3 lies with the 7 tasks of night 1, one more for every two extra tasks (5 lies with 11 on night 5). */
export const lieCount = (count: number): number => 3 + Math.floor(Math.max(0, count - TASK_COUNT) / 2);

/**
 * C.A.I.-0 earns trust first: tasks 1 and 2 are always honest.
 * It then lies on 3 of the remaining 5 (more on later nights). Which ones is seeded from run_id,
 * so players cannot tell each other "it lies on task 4". Mirrors learned_lies in server/main.py.
 */
export function liePatternFor(runId: string, count = TASK_COUNT): boolean[] {
  const r = rng(hashSeed(runId + ':lies'));
  const late = Array.from({ length: count - HONEST_OPENERS }, (_, i) => i + HONEST_OPENERS);
  for (let i = late.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [late[i], late[j]] = [late[j], late[i]];
  }
  const lies = Array.from({ length: count }, () => false);
  late.slice(0, lieCount(count)).forEach((i) => (lies[i] = true));
  return lies;
}

export function newRunId(): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 0xffffff).toString(36).padStart(4, '0');
  return `run_${t}_${r}`;
}

export function makeRunConfig(runId: string, mode: Mode, alias: string | null, startedAt: number, night = 1, taskCount = TASK_COUNT): RunConfig {
  const r = rng(hashSeed(runId + ':cfg'));
  const tactic = TACTICS[Math.floor(r() * TACTICS.length)];
  const claimedSide: Side = r() < 0.5 ? 'L' : 'R';
  const finalSide: Side = r() < 0.5 ? 'L' : 'R';
  const jitter = (r() - 0.5) * 0.04;
  return { runId, mode, night, tactic, liePattern: liePatternFor(runId, taskCount), learnedFrom: null, rushTasks: [], watch: [], watchedFrom: null, watchSource: null, claimedSide, finalSide, jitter, alias, startedAt };
}

/** Accept a lie pattern from the backend only if it is well formed and keeps the first two tasks honest. */
export function parseLiePattern(p: unknown, count = TASK_COUNT): boolean[] | null {
  if (typeof p !== 'string' || p.length !== count || !/^[01]+$/.test(p) || p.startsWith('1') || p[1] === '1') return null;
  return [...p].map((c) => c === '1');
}

/** Accept rushed task ids from the backend only if they are real task numbers. At most two. */
export function parseRushTasks(v: unknown, count = TASK_COUNT): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((t): t is number => Number.isInteger(t) && t >= 1 && t <= count))].slice(0, 2);
}

const CAM_IDS: Cam[] = ['CAM01', 'CAM02', 'CAM03', 'CAM04', 'CAM05', 'CAM06', 'CAM07'];

/** Accept camera-watch shares from the backend only if they have the right shape. null = ignore them. */
export function parseWatch(v: unknown, slots: number): WatchSlot[] | null {
  if (!Array.isArray(v) || v.length !== slots) return null;
  const out: WatchSlot[] = [];
  for (const slot of v) {
    if (typeof slot !== 'object' || slot === null) return null;
    const clean: WatchSlot = {};
    for (const cam of CAM_IDS) {
      const x = (slot as Record<string, unknown>)[cam];
      if (typeof x === 'number' && x > 0 && x <= 1) clean[cam] = x;
    }
    out.push(clean);
  }
  return out;
}

export const lieString = (p: boolean[]): string => p.map((x) => (x ? '1' : '0')).join('');
export const other = (s: Side): Side => (s === 'L' ? 'R' : 'L');
