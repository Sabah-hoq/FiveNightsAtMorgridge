import type { Mode, RunConfig, Side, Tactic } from './types';

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
const LATE_LIES = 3;

/**
 * C.A.I.-0 earns trust first: the first two tasks are always honest.
 * It then lies on 3 of the remaining 5. Which ones is seeded from run_id,
 * so players cannot tell each other "it lies on task 4".
 */
export function liePatternFor(runId: string, count = TASK_COUNT): boolean[] {
  const r = rng(hashSeed(runId + ':lies'));
  const late = Array.from({ length: count - HONEST_OPENERS }, (_, i) => i + HONEST_OPENERS);
  for (let i = late.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [late[i], late[j]] = [late[j], late[i]];
  }
  const lies = Array.from({ length: count }, () => false);
  late.slice(0, LATE_LIES).forEach((i) => (lies[i] = true));
  return lies;
}

export function newRunId(): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 0xffffff).toString(36).padStart(4, '0');
  return `run_${t}_${r}`;
}

export function makeRunConfig(runId: string, mode: Mode, alias: string | null, startedAt: number, night = 1): RunConfig {
  const r = rng(hashSeed(runId + ':cfg'));
  const tactic = TACTICS[Math.floor(r() * TACTICS.length)];
  const claimedSide: Side = r() < 0.5 ? 'L' : 'R';
  const finalSide: Side = r() < 0.5 ? 'L' : 'R';
  const jitter = (r() - 0.5) * 0.04;
  return { runId, mode, night, tactic, liePattern: liePatternFor(runId), claimedSide, finalSide, jitter, alias, startedAt };
}

export const lieString = (p: boolean[]): string => p.map((x) => (x ? '1' : '0')).join('');
export const other = (s: Side): Side => (s === 'L' ? 'R' : 'L');
