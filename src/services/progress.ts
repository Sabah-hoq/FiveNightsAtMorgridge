import type { Mode } from '../core/types';

/**
 * Saved progress: which night the player has reached, plus their shift length and nickname.
 * It lives in this browser only (localStorage). Nothing here is sent anywhere.
 */
export const MAX_NIGHT = 5;
const KEY = 'fnam.progress.v1';

export interface Progress {
  /** The night the player plays next. 1 = nothing cleared yet. */
  night: number;
  mode: Mode;
  alias: string;
  /** When it was last saved (ms since 1970). */
  savedAt: number;
}

export function loadProgress(): Progress | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Progress> | null;
    if (!p || !Number.isInteger(p.night) || p.night! < 1) return null;
    return {
      night: Math.min(MAX_NIGHT, p.night!),
      mode: p.mode === 'full' ? 'full' : 'judge',
      alias: typeof p.alias === 'string' ? p.alias.slice(0, 16) : '',
      savedAt: typeof p.savedAt === 'number' ? p.savedAt : 0,
    };
  } catch {
    return null; // storage blocked or the entry is damaged: start fresh
  }
}

/** Returns false when the browser would not store it (private window, storage full). */
export function saveProgress(p: Omit<Progress, 'savedAt'>): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...p, night: Math.min(MAX_NIGHT, Math.max(1, p.night)), savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The night that comes after surviving `night`. The last night repeats. */
export const nextNight = (night: number): number => Math.min(MAX_NIGHT, night + 1);
