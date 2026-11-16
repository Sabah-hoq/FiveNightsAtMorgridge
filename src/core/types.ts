// PURE TypeScript. No React or DOM imports anywhere in src/core (spec section 8).

export type Tactic = 'helpful' | 'urgent' | 'authority' | 'flattering';
export type Mode = 'judge' | 'full';
export type Choice = 'accept' | 'self' | 'check_then_accept' | 'check_then_self';
export type LieType = 'omission' | 'wrong_fact' | 'not_yours';
export type Side = 'L' | 'R';
/**
 * CAM 01 watches Door L, CAM 02 watches Door R, CAM 03 watches the hall just outside the office.
 * CAM 04 to CAM 07 watch the rest of the building, where the units wander before they come close.
 */
export type Cam = 'CAM01' | 'CAM02' | 'CAM03' | 'CAM04' | 'CAM05' | 'CAM06' | 'CAM07';
export type SentinelNode = 'CAM03' | 'CAM04' | 'CAM05' | 'CAM06' | 'CAM07' | 'DOOR_L' | 'DOOR_R' | 'GONE';
/** For one slot of the night: each camera's share (0 to 1) of the time players spent watching feeds. */
export type WatchSlot = Partial<Record<Cam, number>>;
/** The black unit walks all night. The white unit joins on floor 2. */
export type Unit = 'black' | 'white';
export type TaskId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** What a task is about. Core and UI switch on this, not on the task number. */
export type TaskKind = 'note' | 'math' | 'code' | 'cam' | 'rank' | 'radio' | 'door';

export interface TaskDef {
  id: TaskId;
  kind: TaskKind;
  /** False when the only choices are accept or do it myself. */
  hasCheck: boolean;
  floor: 1 | 2;
  /** In-game minutes after 12:00 AM when the task opens. */
  atMin: number;
  title: string;
  prompt: string;
  /** Always null: tasks have no timer of their own. The night clock is the only pressure. */
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
  /**
   * How many earlier nights C.A.I.-0 learned from when it chose where to lie (read from Databricks).
   * null = the lies were placed by the seeded random pattern instead.
   */
  learnedFrom: number | null;
  /**
   * Task ids where earlier players took longest to decide (read from Databricks). The night clock runs
   * faster while one of them is open. Empty = nothing learned yet, the clock runs at one speed.
   */
  rushTasks: number[];
  /**
   * Where players look, one entry per slot of the night (see WATCH_SLOTS). The units are routed through the
   * cameras that are watched most in each slot. Empty = nothing learned yet, the route is seeded at random.
   */
  watch: WatchSlot[];
  /** How many earlier nights `watch` was learned from, and where it was read from. null = not learned. */
  watchedFrom: number | null;
  watchSource: 'databricks' | 'device' | null;
  /** Door C.A.I.-0 names on the door task. */
  claimedSide: Side;
  /** Night number. Night 1 is the easy one; power drains faster on later nights. */
  night: number;
  /** Door the white unit tries near 2:00 AM, with no offer from C.A.I.-0. */
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
  /** True when the player took too long to decide and C.A.I.-0's answer was applied for them. */
  timed_out: boolean;
}

/** One row of the `cam_views` Delta table: how long one camera was watched in one slot of one night. */
export interface CamView {
  run_id: string;
  cam: Cam;
  /** Slot of the night, 0 to WATCH_SLOTS - 1. */
  slot: number;
  view_ms: number;
  /** Times the feed was opened in that slot. */
  opens: number;
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

/** What everyone who played did. Shown only after a run ends, never before or during play. */
export interface RoomMirror {
  runs: number;
  syntheticRuns: number;
  handoffRate: number;
  checkRate: number;
  liesTold: number;
  liesAccepted: number;
  timedHandoffRate: number | null;
  calmHandoffRate: number | null;
  byTactic: TacticEffect[];
  byTask: { taskId: number; handoffRate: number }[];
}

export interface MirrorMetrics extends RunSummary {
  /** Includes the run that just ended. */
  room: RoomMirror;
}
