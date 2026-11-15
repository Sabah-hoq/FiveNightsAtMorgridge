import { describe, expect, it } from 'vitest';
import { computeMirror, median, summarizeRun } from './metrics';
import type { Choice, GameEvent } from './types';

const ev = (task: number, choice: Choice, aiCorrect: boolean, pressure: number | null, ms: number): GameEvent => ({
  run_id: 'r', task_id: task as GameEvent['task_id'], floor: 1, ai_correct: aiCorrect, lie_type: aiCorrect ? null : 'wrong_fact',
  tactic: 'urgent', choice, checked: choice.startsWith('check'), decision_ms: ms, pressure_s: pressure,
  player_correct: true, ts: '', timed_out: false,
});

describe('mirror metrics', () => {
  const run = [
    ev(1, 'accept', true, null, 2000),
    ev(2, 'self', false, null, 4000),
    ev(3, 'accept', false, 12, 600),
    ev(4, 'check_then_accept', true, 15, 3000),
    ev(5, 'accept', true, 5, 400),
  ];

  it('counts handoffs, checks and lies', () => {
    const s = summarizeRun(run);
    expect(s.handoffs).toBe(3);
    expect(s.handoffRate).toBeCloseTo(0.6);
    expect(s.checks).toBe(1);
    expect(s.liesTold).toBe(2);
    expect(s.liesCaught).toBe(1);
  });

  it('computes trust speed and pressure shift', () => {
    const s = summarizeRun(run);
    expect(s.trustSpeedMs).toBe(1300); // median of 2000, 600, 3000, 400
    expect(s.pressureShift).toBeCloseTo(2 / 3 - 1 / 2);
    expect(median([])).toBeNull();
  });

  it('builds the room mirror including this run', () => {
    const low = { tactic: 'helpful' as const, synthetic: true, events: [ev(1, 'self', true, null, 1)] };
    const high = { tactic: 'urgent' as const, synthetic: true, events: [ev(1, 'accept', false, null, 1)] };
    const m = computeMirror(run, [low, high], 'urgent');
    expect(m.room.runs).toBe(3);
    expect(m.room.syntheticRuns).toBe(2);
    expect(m.room.handoffRate).toBeCloseTo(4 / 7);
    expect(m.room.liesTold).toBe(3);
    expect(m.room.liesAccepted).toBe(2);
    expect(m.room.byTactic.find((t) => t.tactic === 'urgent')!.runs).toBe(2);
    expect(m.room.byTask[0]).toEqual({ taskId: 1, handoffRate: 2 / 3 });
  });
});
