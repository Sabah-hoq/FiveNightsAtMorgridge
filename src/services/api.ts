import { computeMirror } from '../core/metrics';
import { lieString, makeRunConfig, newRunId } from '../core/seed';
import type { CohortRun, GameEvent, MirrorMetrics, Mode, RunConfig, RunRow, TaskKind } from '../core/types';
import { fillLine, OFFER_LINES } from '../data/fallbackLines';
import { seedCohort } from '../data/seedCohort';
import { AI_OUTPUT, TASKS } from '../data/tasks';

/**
 * Talks to OUR backend only (spec 6.5), never to Databricks directly.
 * With no VITE_API_URL set, or when the backend is unreachable, everything falls back to
 * local lines + local metrics so the game runs fully offline.
 */
const API: string = import.meta.env.VITE_API_URL ?? '';
const HISTORY_KEY = 'nullspace.runs.v2'; // v2: seven tasks

export interface RunStart {
  cfg: RunConfig;
  lines: Record<TaskKind, string>;
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

export function localLines(cfg: RunConfig): Record<TaskKind, string> {
  const offers = OFFER_LINES[cfg.tactic];
  const lines = {} as Record<TaskKind, string>;
  for (const t of TASKS) {
    const out = AI_OUTPUT[t.kind];
    lines[t.kind] = fillLine(offers[t.kind], { claim: cfg.liePattern[t.id - 1] ? out.lie : out.truth, side: cfg.claimedSide });
  }
  return lines;
}

export async function startRun(mode: Mode, alias: string | null): Promise<RunStart> {
  const cfg = makeRunConfig(newRunId(), mode, alias, Date.now());
  if (API) {
    try {
      // Backend may override tactic + lines (one Model Serving call). Lie pattern stays seeded from run_id.
      const r = await post<{ tactic?: RunConfig['tactic']; lines?: Record<TaskKind, string> }>(
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
  const local = computeMirror(events, cohort, row.tactic);
  saveHistory([...loadHistory(), { tactic: row.tactic, synthetic: false, events }]);
  if (API) {
    try {
      // Wait up to 12s (the analyzing screen covers it), then fall back to the local report.
      const r = await post<{ metrics: MirrorMetrics }>('/api/run/end', { run: row, events }, 12000);
      return { metrics: r.metrics, source: 'backend' };
    } catch {
      /* fall through */
    }
  }
  return { metrics: local, source: 'fallback' };
}
