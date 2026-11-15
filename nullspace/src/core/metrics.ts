import type { CohortRun, GameEvent, MirrorMetrics, RoomMirror, RunSummary, Tactic, TacticEffect } from './types';

const isHandoff = (e: GameEvent): boolean => e.choice === 'accept';
const isAccept = (e: GameEvent): boolean => e.choice === 'accept' || e.choice === 'check_then_accept';

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const rate = (n: number, d: number): number => (d === 0 ? 0 : n / d);

/** Mirror metrics for one run (spec 6.2). Mirrors server/sql/mirror_metrics.sql. */
export function summarizeRun(events: GameEvent[]): RunSummary {
  const handoffs = events.filter(isHandoff).length;
  const checks = events.filter((e) => e.checked).length;
  const lies = events.filter((e) => !e.ai_correct);
  const timed = events.filter((e) => e.pressure_s !== null);
  const calm = events.filter((e) => e.pressure_s === null);
  const ms = (es: GameEvent[]) => es.filter(isAccept).map((e) => e.decision_ms);
  return {
    tasks: events.length,
    handoffs,
    handoffRate: rate(handoffs, events.length),
    checks,
    checkRate: rate(checks, events.length),
    liesTold: lies.length,
    liesCaught: lies.filter((e) => !isAccept(e)).length,
    trustSpeedMs: median(ms(events)),
    calmAcceptMs: median(ms(calm)),
    timedAcceptMs: median(ms(timed)),
    pressureShift:
      timed.length && calm.length
        ? rate(timed.filter(isHandoff).length, timed.length) - rate(calm.filter(isHandoff).length, calm.length)
        : null,
  };
}

export function tacticEffects(cohort: CohortRun[]): TacticEffect[] {
  const by = new Map<Tactic, GameEvent[][]>();
  for (const run of cohort) {
    if (!by.has(run.tactic)) by.set(run.tactic, []);
    by.get(run.tactic)!.push(run.events);
  }
  return [...by.entries()].map(([tactic, runs]) => {
    const all = runs.flat();
    return {
      tactic,
      runs: runs.length,
      handoffRate: rate(all.filter(isHandoff).length, all.length),
      checkRate: rate(all.filter((e) => e.checked).length, all.length),
    };
  });
}

/** The room's mirror: aggregates over every run passed in. Mirrors server/sql/mirror_metrics.sql. */
export function roomMirror(runs: CohortRun[]): RoomMirror {
  const all = runs.flatMap((r) => r.events);
  const lies = all.filter((e) => !e.ai_correct);
  const timed = all.filter((e) => e.pressure_s !== null);
  const calm = all.filter((e) => e.pressure_s === null);
  const taskIds = [...new Set(all.map((e) => e.task_id))].sort((a, b) => a - b);
  return {
    runs: runs.length,
    syntheticRuns: runs.filter((r) => r.synthetic).length,
    handoffRate: rate(all.filter(isHandoff).length, all.length),
    checkRate: rate(all.filter((e) => e.checked).length, all.length),
    liesTold: lies.length,
    liesAccepted: lies.filter(isAccept).length,
    timedHandoffRate: timed.length ? rate(timed.filter(isHandoff).length, timed.length) : null,
    calmHandoffRate: calm.length ? rate(calm.filter(isHandoff).length, calm.length) : null,
    byTactic: tacticEffects(runs),
    byTask: taskIds.map((id) => {
      const es = all.filter((e) => e.task_id === id);
      return { taskId: id, handoffRate: rate(es.filter(isHandoff).length, es.length) };
    }),
  };
}

/** Local Mirror Report numbers. `others` should NOT include the current run; it is added here. */
export function computeMirror(events: GameEvent[], others: CohortRun[], tactic: Tactic): MirrorMetrics {
  return { ...summarizeRun(events), room: roomMirror([...others, { tactic, synthetic: false, events }]) };
}
