// PURE TypeScript. No React or DOM imports anywhere in src/core (spec section 8).

export type Tactic = 'helpful' | 'urgent' | 'authority' | 'flattering';
export type Mode = 'judge' | 'full';
export type Choice = 'accept' | 'self' | 'check_then_accept' | 'check_then_self';
export type LieType = 'omission' | 'wrong_fact' | 'not_yours';
export type Side = 'L' | 'R';
export type Cam = 'CAM02' | 'CAM03' | 'CAM04';
export type SentinelNode = Cam | 'DOOR_L' | 'DOOR_R' | 'GONE';
export type TaskId = 1 | 2 | 3 | 4 | 5;

export interface TaskDef {
  id: TaskId;
  floor: 1 | 2;
  /** In-game minutes after 12:00 AM when the task opens. */
  atMin: number;
  title: string;
  prompt: string;
  /** Seconds of hard timer, or null for calm tasks. */
  pressureS: number | null;
  lieType: LieType;
  selfLabel: string;
  checkLabel: string;
  parallel: string;
}

export interface RunConfig {
  runId: string;
  mode: Mode;
  tactic: Tactic;
  /** liePattern[i] is true when C.A.I.-0 lies on task i+1. */
  liePattern: boolean[];
  /** Door C.A.I.-0 names on task 5. */
  claimedSide: Side;
  /** Door for the unassisted approach near 2:00 AM. */
  finalSide: Side;
  /** Small seeded offset for sentinel timing, in night fraction. */
  jitter: number;
  alias: string | null;
  startedAt: number;
}

/** One row of the `events` Delta table (spec 6.1). */
export interface GameEvent {
  run_id: string;
  task_id: TaskId;
  floor: number;
  ai_correct: boolean;
  lie_type: LieType | null;
  tactic: Tactic;
  choice: Choice;
  checked: boolean;
  decision_ms: number;
  pressure_s: number | null;
  player_correct: boolean;
  ts: string;
  /** NOT in spec 6.1. True when the timer ran out and C.A.I.-0 acted by default. */
  timed_out: boolean;
}

/** One row of the `runs` Delta table (spec 6.1). */
export interface RunRow {
  run_id: string;
  started_at: string;
  ended_at: string;
  mode: Mode;
  tactic: Tactic;
  lie_pattern: string;
  outcome: 'survived' | 'caught';
  caught_at: string | null;
  alias: string | null;
}

export interface RunSummary {
  tasks: number;
  handoffs: number;
  handoffRate: number;
  checks: number;
  checkRate: number;
  liesTold: number;
  liesCaught: number;
  /** Median decision_ms on accepts, or null when nothing was accepted. */
  trustSpeedMs: number | null;
  calmAcceptMs: number | null;
  timedAcceptMs: number | null;
  /** Handoff rate on timed tasks minus untimed tasks, or null when one side is empty. */
  pressureShift: number | null;
}

export interface CohortRun {
  tactic: Tactic;
  synthetic: boolean;
  events: GameEvent[];
}

export interface TacticEffect {
  tactic: Tactic;
  runs: number;
  handoffRate: number;
  checkRate: number;
}

export interface MirrorMetrics extends RunSummary {
  cohortSize: number;
  syntheticRuns: number;
  /** Share of cohort runs with a lower handoff rate than this run. */
  percentile: number | null;
  tacticEffects: TacticEffect[];
  /** Tactic with the lowest check rate across the cohort. */
  leastCheckedTactic: Tactic | null;
}
