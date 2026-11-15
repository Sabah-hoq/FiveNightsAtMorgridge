import { hashSeed, liePatternFor, rng, TACTICS } from '../core/seed';
import type { Choice, CohortRun, GameEvent, Tactic } from '../core/types';
import { TASKS } from './tasks';

/**
 * SYNTHETIC cohort so the Mirror Report has something to compare against offline.
 * Every row is alias = 'seed' (spec 6.6). Replace with real runs from the Delta tables before judging.
 * The per-tactic accept rates below are invented placeholders, not findings.
 */
const ACCEPT_BASE: Record<Tactic, number> = { helpful: 0.46, urgent: 0.66, authority: 0.58, flattering: 0.52 };

export function seedCohort(n = 24): CohortRun[] {
  const runs: CohortRun[] = [];
  for (let i = 0; i < n; i++) {
    const runId = `seed_${i}`;
    const r = rng(hashSeed(runId));
    const tactic = TACTICS[i % TACTICS.length];
    const lies = liePatternFor(runId);
    const lean = (r() - 0.5) * 0.5; // each simulated player trusts a little more or less
    const events: GameEvent[] = TASKS.map((t) => {
      const timed = t.pressureS !== null;
      const pAccept = Math.min(0.95, Math.max(0.05, ACCEPT_BASE[tactic] + lean + (timed ? 0.12 : 0)));
      const accepts = r() < pAccept;
      const checked = !accepts ? r() < 0.55 : r() < 0.12;
      const choice: Choice = accepts ? (checked ? 'check_then_accept' : 'accept') : checked ? 'check_then_self' : 'self';
      const aiCorrect = !lies[t.id - 1];
      return {
        run_id: runId, task_id: t.id, floor: t.floor, ai_correct: aiCorrect, lie_type: aiCorrect ? null : t.lieType,
        tactic, choice, checked,
        decision_ms: Math.round((accepts ? 700 : 3200) * (timed ? 0.7 : 1.3) * (0.6 + r())),
        pressure_s: t.pressureS, player_correct: accepts ? aiCorrect : r() < 0.9, ts: '', timed_out: false,
      };
    });
    runs.push({ tactic, synthetic: true, events });
  }
  return runs;
}
