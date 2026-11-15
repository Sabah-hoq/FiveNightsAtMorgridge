import type { CohortRun, GameEvent, MirrorMetrics, RunSummary, Tactic, TacticEffect } from './types';

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

/** Local Mirror Report numbers. `cohort` should NOT include the current run. */
export function computeMirror(events: GameEvent[], cohort: CohortRun[]): MirrorMetrics {
  const mine = summarizeRun(events);
  const others = cohort.map((r) => summarizeRun(r.events).handoffRate);
  const effects = tacticEffects(cohort);
  const least = effects.length ? effects.reduce((a, b) => (b.checkRate < a.checkRate ? b : a)).tactic : null;
  return {
    ...mine,
    cohortSize: cohort.length,
    syntheticRuns: cohort.filter((r) => r.synthetic).length,
    percentile: others.length ? rate(others.filter((h) => h < mine.handoffRate).length, others.length) : null,
    tacticEffects: effects,
    leastCheckedTactic: least,
  };
}
