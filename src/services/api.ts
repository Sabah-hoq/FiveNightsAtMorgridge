import { computeMirror } from '../core/metrics';
import { makeRunConfig, newRunId, parseLiePattern, parseRushTasks, parseWatch } from '../core/seed';
import { WATCH_SLOTS, watchShares } from '../core/sentinel';
import type { CamView, CohortRun, GameEvent, MirrorMetrics, Mode, RunConfig, RunRow, TaskKind } from '../core/types';
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
const VIEWS_KEY = 'nullspace.camviews.v1'; // camera views of nights played on this device, one array per night

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

/** Camera views from nights played on this device, newest last. */
function loadViews(): CamView[][] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    return raw ? (JSON.parse(raw) as CamView[][]) : [];
  } catch {
    return [];
  }
}

function saveViews(nights: CamView[][]): void {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(nights.slice(-30)));
  } catch {
    /* storage unavailable: routes just stay random on this device */
  }
}

export async function startRun(mode: Mode, alias: string | null, night = 1): Promise<RunStart> {
  const cfg = makeRunConfig(newRunId(), mode, alias, Date.now(), night);
  let source: RunStart['source'] = 'fallback';
  if (API) {
    try {
      // The backend asks Databricks where earlier players stopped looking and puts tonight's lies there.
      const r = await post<{ lie_pattern?: string; learned_from?: number; rush_tasks?: number[]; watch?: unknown; watch_runs?: number }>(
        '/api/run/start', { run_id: cfg.runId, task_count: TASKS.length }, 3000);
      const learned = parseLiePattern(r.lie_pattern, TASKS.length);
      if (learned && typeof r.learned_from === 'number') {
        cfg.liePattern = learned;
        cfg.learnedFrom = r.learned_from;
      }
      // It also asks where earlier players took longest to decide. The clock runs faster on those tasks.
      cfg.rushTasks = parseRushTasks(r.rush_tasks, TASKS.length);
      // And which cameras earlier players watched at each point of the night. The units are routed there.
      const watch = parseWatch(r.watch, WATCH_SLOTS);
      if (watch && typeof r.watch_runs === 'number' && r.watch_runs > 0) {
        cfg.watch = watch;
        cfg.watchedFrom = r.watch_runs;
        cfg.watchSource = 'databricks';
      }
      source = 'backend';
    } catch {
      /* backend slow or down: keep the seeded pattern */
    }
  }
  // No camera memory from Databricks: learn from the nights already played on this device instead.
  if (cfg.watchSource === null) {
    const nights = loadViews().filter((n) => n.length > 0);
    if (nights.length > 0) {
      cfg.watch = watchShares(nights.flat());
      cfg.watchedFrom = nights.length;
      cfg.watchSource = 'device';
    }
  }
  return { cfg, lines: localLines(cfg), source };
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

export async function endRun(row: RunRow, events: GameEvent[], camViews: CamView[] = []): Promise<RunEnd> {
  saveViews([...loadViews(), camViews]);
  const cohort = localCohort();
  const local = computeMirror(events, cohort, row.tactic);
  saveHistory([...loadHistory(), { tactic: row.tactic, synthetic: false, events }]);
  if (API) {
    try {
      // Wait up to 12s (the analyzing screen covers it), then fall back to the local report.
      const r = await post<{ metrics: MirrorMetrics }>('/api/run/end', { run: row, events, cam_views: camViews }, 12000);
      return { metrics: r.metrics, source: 'backend' };
    } catch {
      /* fall through */
    }
  }
  return { metrics: local, source: 'fallback' };
}
