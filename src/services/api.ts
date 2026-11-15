import { computeMirror } from '../core/metrics';
import { lieString, makeRunConfig, newRunId } from '../core/seed';
import type { CohortRun, GameEvent, MirrorMetrics, Mode, RunConfig, RunRow, TaskId } from '../core/types';
import { fillLine, OFFER_LINES } from '../data/fallbackLines';
import { seedCohort } from '../data/seedCohort';
import { AI_OUTPUT } from '../data/tasks';

/**
 * Talks to OUR backend only (spec 6.5), never to Databricks directly.
 * With no VITE_API_URL set, or when the backend is unreachable, everything falls back to
 * local lines + local metrics so the game runs fully offline.
 */
const API: string = import.meta.env.VITE_API_URL ?? '';
const HISTORY_KEY = 'nullspace.runs.v1';

export interface RunStart {
  cfg: RunConfig;
  lines: Record<TaskId, string>;
  source: 'backend' | 'fallback';
}

export interface RunEnd {
  metrics: MirrorMetrics;
  source: 'backend' | 'fallback';
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(API + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function localLines(cfg: RunConfig): Record<TaskId, string> {
  const offers = OFFER_LINES[cfg.tactic];
  const claim = cfg.liePattern[1] ? AI_OUTPUT[2].lie : AI_OUTPUT[2].truth;
  const vars = { claim, side: cfg.claimedSide };
  return {
    1: fillLine(offers[1], vars), 2: fillLine(offers[2], vars), 3: fillLine(offers[3], vars),
    4: fillLine(offers[4], vars), 5: fillLine(offers[5], vars),
  };
}

export async function startRun(mode: Mode, alias: string | null): Promise<RunStart> {
  const cfg = makeRunConfig(newRunId(), mode, alias, Date.now());
  if (API) {
    try {
      // Backend may override tactic + lines (one Model Serving call). Lie pattern stays seeded from run_id.
      const r = await post<{ tactic?: RunConfig['tactic']; lines?: Record<TaskId, string> }>(
        '/api/run/start', { run_id: cfg.runId, mode, lie_pattern: lieString(cfg.liePattern), claimed_side: cfg.claimedSide }, 2500);
      if (r.tactic) cfg.tactic = r.tactic;
      if (r.lines) return { cfg, lines: r.lines, source: 'backend' };
    } catch {
      /* fall through to local lines */
    }
  }
  return { cfg, lines: localLines(cfg), source: 'fallback' };
}

const queue: GameEvent[] = [];

/** Fire-and-forget. Events queue locally while the backend is down and flush on the next call. */
export function logEvent(e: GameEvent): void {
  if (!API) return;
  queue.push(e);
  void (async () => {
    while (queue.length) {
      try {
        await post('/api/event', queue[0], 3000);
        queue.shift();
      } catch {
        return;
      }
    }
  })();
}

function loadHistory(): CohortRun[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as CohortRun[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(runs: CohortRun[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(runs.slice(-50)));
  } catch {
    /* storage unavailable: the report still renders */
  }
}

export function localCohort(): CohortRun[] {
  return [...seedCohort(), ...loadHistory()];
}

export async function endRun(row: RunRow, events: GameEvent[]): Promise<RunEnd> {
  const cohort = localCohort();
  const local = computeMirror(events, cohort);
  saveHistory([...loadHistory(), { tactic: row.tactic, synthetic: false, events }]);
  if (API) {
    try {
      // Spec 6.3: ~8s timeout, then fall back to the local template.
      const r = await post<{ metrics: MirrorMetrics }>('/api/run/end', { run: row, events }, 8000);
      return { metrics: r.metrics, source: 'backend' };
    } catch {
      /* fall through */
    }
  }
  return { metrics: local, source: 'fallback' };
}

/** Start-screen counter. Offline it reads the local cohort (seeded rows are labelled in the UI). */
export function roomStats(): { runs: number; synthetic: number; task3Handoff: number } {
  const cohort = localCohort();
  const t3 = cohort.flatMap((r) => r.events.filter((e) => e.task_id === 3));
  return {
    runs: cohort.length,
    synthetic: cohort.filter((r) => r.synthetic).length,
    task3Handoff: t3.length ? t3.filter((e) => e.choice === 'accept').length / t3.length : 0,
  };
}
