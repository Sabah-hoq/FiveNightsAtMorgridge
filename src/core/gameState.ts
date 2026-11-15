import type { Cam, GameEvent, RunConfig, SentinelNode, Side, TaskDef, TaskId } from './types';
import { ATTACK_WINDOW_MS, FINAL_ATTACK_F, nodeAt, sentinelPlan, task5Side, type SentinelStep } from './sentinel';
import { buildEvent, selfCorrect, type ActiveTask, type SelfAnswer } from './tasks';

/** Things the presentation layer may want to react to (sound, flashes). Core never plays them. */
export type Signal = 'task' | 'resolve' | 'door' | 'light' | 'static' | 'steps' | 'floor' | 'powerout' | 'caught' | 'survived';

export interface Resolution {
  taskId: TaskId;
  how: 'accept' | 'self';
  timedOut: boolean;
}

export interface GameState {
  cfg: RunConfig;
  tasks: TaskDef[];
  nightMinutes: number;
  nightMs: number;
  elapsedMs: number;
  phase: 'playing' | 'ended';
  outcome: 'survived' | 'caught' | null;
  caughtAt: string | null;
  floor: 1 | 2;
  power: number;
  doors: Record<Side, boolean>;
  lightMs: Record<Side, number>;
  cam: Cam | null;
  plan: SentinelStep[];
  sentinel: SentinelNode;
  finalAttack: { state: 'pending' | 'active' | 'done'; endsAtMs: number };
  task: ActiveTask | null;
  nextTask: number;
  lastResolution: Resolution | null;
  events: GameEvent[];
}

// Tuning. Rates are per in-game minute so judge mode and full mode drain the same per night.
export const NIGHT_MS = { judge: 120_000, full: 240_000 } as const;
const IDLE_DRAIN = 0.15;
const DOOR_DRAIN = 1.6;
const LIGHT_COST = 1.5;
const LIGHT_MS = 900;

export function createGame(cfg: RunConfig, tasks: TaskDef[], nightMinutes: number): GameState {
  const plan = sentinelPlan(cfg);
  return {
    cfg, tasks, nightMinutes,
    nightMs: NIGHT_MS[cfg.mode],
    elapsedMs: 0,
    phase: 'playing', outcome: null, caughtAt: null,
    floor: 1, power: 100,
    doors: { L: false, R: false },
    lightMs: { L: 0, R: 0 },
    cam: null,
    plan, sentinel: plan[0].node,
    finalAttack: { state: 'pending', endsAtMs: 0 },
    task: null, nextTask: 0, lastResolution: null, events: [],
  };
}

export const fraction = (s: GameState): number => Math.min(1, s.elapsedMs / s.nightMs);

export function clockLabel(s: GameState): string {
  const total = Math.min(s.nightMinutes, Math.floor(fraction(s) * s.nightMinutes));
  const hour = total < 60 ? 12 : total < 120 ? 1 : 2;
  return `${hour}:${String(total % 60).padStart(2, '0')} AM`;
}

const openMs = (s: GameState, i: number): number =>
  i < s.tasks.length ? (s.tasks[i].atMin / s.nightMinutes) * s.nightMs : s.nightMs;

const isAt = (s: GameState, side: Side): boolean => s.sentinel === (side === 'L' ? 'DOOR_L' : 'DOOR_R');

/** True when a flashed light on that side shows the sentinel in the doorway. */
export const litSentinel = (s: GameState, side: Side): boolean => s.lightMs[side] > 0 && isAt(s, side);

function caught(s: GameState, out: Signal[]): void {
  s.phase = 'ended';
  s.outcome = 'caught';
  s.caughtAt = clockLabel(s);
  out.push('caught');
}

function finish(s: GameState, how: 'accept' | 'self', playerCorrect: boolean, timedOut: boolean, out: Signal[]): void {
  const t = s.task;
  if (!t) return;
  s.events.push(buildEvent(s.cfg, t, how, playerCorrect, s.elapsedMs, timedOut));
  s.lastResolution = { taskId: t.def.id, how, timedOut };
  s.task = null;
  out.push('resolve');
  // Task 5 is the only task with an immediate consequence: the wrong door means it gets in.
  if (t.def.id === 5 && !playerCorrect) caught(s, out);
}

function openTask(s: GameState, out: Signal[]): void {
  const def = s.tasks[s.nextTask];
  const opened = s.elapsedMs;
  const next = openMs(s, s.nextTask + 1);
  const deadline = def.pressureS ? Math.min(opened + def.pressureS * 1000, next) : next;
  s.task = {
    def,
    aiCorrect: !s.cfg.liePattern[def.id - 1],
    openedAtMs: opened,
    deadlineMs: deadline,
    checked: def.id === 3 && s.cam === 'CAM03', // already looking at the feed C.A.I.-0 is describing
    stage: 'offer',
    revealed: false,
  };
  s.nextTask += 1;
  s.lastResolution = null;
  out.push('task');
  if (def.id === 5) out.push('steps');
}

function onDeadline(s: GameState, out: Signal[]): void {
  const t = s.task;
  if (!t) return;
  if (t.def.id === 5) {
    if (t.stage === 'self') {
      finish(s, 'self', s.doors[task5Side(s.cfg)], false, out);
    } else {
      // No decision in time: C.A.I.-0 closes the door it named.
      if (s.power > 0) s.doors[s.cfg.claimedSide] = true;
      finish(s, 'accept', s.doors[task5Side(s.cfg)], true, out);
    }
    return;
  }
  // No decision before the window closed: C.A.I.-0 applies its own answer. Logged with timed_out = true.
  finish(s, 'accept', t.aiCorrect, true, out);
}

export function tick(s: GameState, dtMs: number): Signal[] {
  const out: Signal[] = [];
  if (s.phase !== 'playing') return out;
  s.elapsedMs += dtMs;
  const f = fraction(s);
  const gameMin = (dtMs / s.nightMs) * s.nightMinutes;

  // Power
  if (s.power > 0) {
    const closed = (s.doors.L ? 1 : 0) + (s.doors.R ? 1 : 0);
    s.power = Math.max(0, s.power - gameMin * (IDLE_DRAIN + closed * DOOR_DRAIN));
    if (s.power === 0) {
      s.doors.L = false;
      s.doors.R = false;
      out.push('powerout');
    }
  }
  s.lightMs.L = Math.max(0, s.lightMs.L - dtMs);
  s.lightMs.R = Math.max(0, s.lightMs.R - dtMs);

  // Floor
  const floor = f * s.nightMinutes >= 60 ? 2 : 1;
  if (floor !== s.floor) {
    s.floor = floor;
    out.push('floor');
  }

  // Tasks
  if (s.task && s.elapsedMs >= s.task.deadlineMs) onDeadline(s, out);
  if (s.phase !== 'playing') return out;
  if (!s.task && s.nextTask < s.tasks.length && s.elapsedMs >= openMs(s, s.nextTask)) openTask(s, out);

  // Sentinel
  let node = nodeAt(s.plan, f);
  const task5Done = s.events.some((e) => e.task_id === 5);
  if (task5Done && f < 0.8) node = 'CAM04'; // it backs off once the door question is settled
  if (f >= FINAL_ATTACK_F) {
    if (s.finalAttack.state === 'pending') {
      s.finalAttack = { state: 'active', endsAtMs: Math.min(s.elapsedMs + ATTACK_WINDOW_MS, s.nightMs - 400) };
      out.push('steps');
    } else if (s.finalAttack.state === 'active' && s.elapsedMs >= s.finalAttack.endsAtMs) {
      s.finalAttack.state = 'done';
      if (!s.doors[s.cfg.finalSide]) {
        s.sentinel = node;
        caught(s, out);
        return out;
      }
    }
    if (s.finalAttack.state === 'done') node = 'GONE';
  }
  if (node !== s.sentinel) {
    s.sentinel = node;
    out.push('static');
  }

  if (s.elapsedMs >= s.nightMs) {
    s.phase = 'ended';
    s.outcome = 'survived';
    out.push('survived');
  }
  return out;
}

// ---- Player actions -------------------------------------------------------

export function toggleDoor(s: GameState, side: Side): Signal[] {
  if (s.phase !== 'playing' || s.power <= 0) return [];
  s.doors[side] = !s.doors[side];
  if (s.task?.def.id === 5) s.task.stage = 'self'; // touching the doors yourself is the "do it myself" path
  return ['door'];
}

export function flashLight(s: GameState, side: Side): Signal[] {
  if (s.phase !== 'playing' || s.power <= 0) return [];
  s.lightMs[side] = LIGHT_MS;
  s.power = Math.max(0, s.power - LIGHT_COST);
  if (s.task?.def.id === 5) s.task.checked = true;
  return ['light'];
}

export function viewCam(s: GameState, cam: Cam | null): Signal[] {
  if (s.phase !== 'playing') return [];
  s.cam = cam;
  if (cam && s.task?.def.id === 3) s.task.checked = true;
  return cam ? ['static'] : [];
}

/** ACCEPT: one key, instant, C.A.I.-0's answer is applied whether it is right or wrong. */
export function accept(s: GameState): Signal[] {
  const out: Signal[] = [];
  const t = s.task;
  if (s.phase !== 'playing' || !t || (t.stage !== 'offer' && t.def.id !== 5)) return out;
  if (t.def.id === 5) {
    if (s.power > 0) {
      s.doors[s.cfg.claimedSide] = true;
      out.push('door');
    }
    finish(s, 'accept', s.doors[task5Side(s.cfg)], false, out);
  } else {
    finish(s, 'accept', t.aiCorrect, false, out);
  }
  return out;
}

/** DO IT MYSELF: opens the self-answer step. */
export function startSelf(s: GameState): Signal[] {
  if (s.phase !== 'playing' || !s.task || s.task.stage !== 'offer') return [];
  s.task.stage = 'self';
  return [];
}

/** CHECK FIRST: look at the source, then decide. */
export function check(s: GameState): Signal[] {
  const t = s.task;
  if (s.phase !== 'playing' || !t) return [];
  if (t.def.id === 3) return viewCam(s, 'CAM03');
  if (t.def.id === 5) return flashLight(s, s.cfg.claimedSide);
  t.checked = true;
  t.revealed = true;
  return [];
}

export function submitSelf(s: GameState, answer: SelfAnswer, t2Correct: boolean): Signal[] {
  const out: Signal[] = [];
  const t = s.task;
  if (s.phase !== 'playing' || !t || t.stage !== 'self') return out;
  const ok = t.def.id === 5 ? s.doors[task5Side(s.cfg)] : selfCorrect(t.def.id, answer, { sentinel: s.sentinel, t2Correct });
  finish(s, 'self', ok, false, out);
  return out;
}
