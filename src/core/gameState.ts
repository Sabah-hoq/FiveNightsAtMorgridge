import type { Cam, CamView, GameEvent, RunConfig, SentinelNode, Side, TaskDef, TaskId, TaskKind, Unit } from './types';
import {
  attackWindowMs, camFor, doorCam, doorNode, doorTaskSide, dueF, FINAL_ATTACK_F, nodeAt, planRaids, sentinelPlans, slotOf, type Raid, type SentinelStep,
} from './sentinel';
import { hashSeed, rng } from './seed';
import { buildEvent, DECIDE_LIMIT_MS, SELF_EXTRA_MS, selfCorrect, type ActiveTask, type SelfAnswer, type Truths } from './tasks';

/** Things the presentation layer may want to react to (sound, flashes). Core never plays them. */
export type Signal =
  | 'task' | 'resolve' | 'door' | 'static' | 'steps' | 'floor' | 'powerout' | 'caught' | 'survived' | 'timeout' | 'monitor' | 'inside';

export interface Resolution {
  taskId: TaskId;
  kind: TaskKind;
  how: 'accept' | 'self';
  /** The player ran out of time and C.A.I.-0 decided for them. */
  timedOut: boolean;
}

type Attack = { state: 'pending' | 'active' | 'done'; endsAtMs: number };

export interface GameState {
  cfg: RunConfig;
  tasks: TaskDef[];
  truths: Truths;
  nightMinutes: number;
  nightMs: number;
  /** Night clock. It never stops: a task has no timer, but the building keeps moving while you decide. */
  elapsedMs: number;
  phase: 'playing' | 'ended';
  outcome: 'survived' | 'caught' | null;
  caughtAt: string | null;
  caughtBy: Unit | null;
  /** The door it came through, so the screen can show it coming from that side. */
  caughtSide: Side | null;
  floor: 1 | 2;
  power: number;
  powerOutAtMs: number | null;
  /** With the power out: the door its eyes show in, and the door it then comes through. Seeded per run. */
  darkSide: Side;
  doors: Record<Side, boolean>;
  /** null = the building map. */
  cam: Cam | null;
  /** The monitor is raised. While it is up it covers the office: the player cannot see the doors. */
  monitorUp: boolean;
  /**
   * A unit that got through a door while the monitor was up. It is in the office, behind the screen.
   * It takes the player when they lower the monitor, or after INSIDE_MAX_MS if they never do.
   */
  inside: { unit: Unit; side: Side; sinceMs: number } | null;
  plans: Record<Unit, SentinelStep[]>;
  sentinels: Record<Unit, SentinelNode>;
  /** Black unit at a door (the door task). */
  blackAttack: Attack;
  /** Nights 2 to 5: door visits on top of the two above, starting earlier each night. See planRaids. */
  raids: Raid[];
  /** White unit at a door near 2:00 AM. */
  finalAttack: Attack;
  task: ActiveTask | null;
  nextTask: number;
  lastResolution: Resolution | null;
  events: GameEvent[];
  /** Which camera the player watched, when, and for how long. Keyed by slot and camera. Saved at the end of the night. */
  views: Record<string, { cam: Cam; slot: number; ms: number; opens: number }>;
}

// Tuning. Rates are per in-game minute so both shift lengths drain the same per night.
export const NIGHT_MS = { judge: 180_000, full: 300_000 } as const;
/** Night 1: both doors sealed from 12:00 to 2:00 still leaves power. Each later night drains 35% faster. */
/** How much faster the night clock runs while a task the room hesitates on is open. */
export const RUSH_SCALE = 1.5;
const DOOR_DRAIN = 0.48;
/**
 * From night 2 the building draws power even with nothing switched on, like the original game.
 * Power drained per in-game minute, before the night's scale.
 */
export const IDLE_DRAIN = 0.045;
/** Each night drains 15% faster than the one before, on top of the old step of 35% per night. */
export const NIGHT_DRAIN_STEP = 1.15;
/** An open camera feed draws a little power too: watching all night costs about 12% on night 1. The map is free. */
export const CAM_DRAIN = 0.1;
export const powerScale = (night: number): number => (1 + (night - 1) * 0.35) * NIGHT_DRAIN_STEP ** (night - 1);
/** How long a unit that got in will wait behind a raised monitor before it stops waiting. */
export const INSIDE_MAX_MS = 6000;
/** Share of a door wait after which its eyes can be seen in an open doorway from the office. */
export const DOOR_EYES_FROM = 0.75;
/** With the power out the doors open and its eyes flash in one doorway for this long. Then it comes in. */
export const DARK_WAIT_MS = 5000;

export function createGame(cfg: RunConfig, tasks: TaskDef[], nightMinutes: number, truths: Truths): GameState {
  const plans = sentinelPlans(cfg, tasks, nightMinutes);
  const dark = rng(hashSeed(cfg.runId + ':dark'));
  return {
    cfg, tasks, truths, nightMinutes,
    nightMs: NIGHT_MS[cfg.mode],
    elapsedMs: 0,
    phase: 'playing', outcome: null, caughtAt: null, caughtBy: null, caughtSide: null,
    floor: 1, power: 100, powerOutAtMs: null,
    darkSide: dark() < 0.5 ? 'L' : 'R',
    doors: { L: false, R: false },
    cam: null, monitorUp: false, inside: null,
    plans, sentinels: { black: plans.black[0].node, white: plans.white[0].node },
    blackAttack: { state: 'pending', endsAtMs: 0 },
    raids: planRaids(cfg, tasks, nightMinutes),
    finalAttack: { state: 'pending', endsAtMs: 0 },
    task: null, nextTask: 0, lastResolution: null, events: [], views: {},
  };
}

/**
 * True while the open task is one C.A.I.-0 learned that players are slow to decide on.
 * The door task is never rushed: its wait is already the shortest moment of the night.
 */
export const isRushed = (s: GameState): boolean =>
  !!s.task && s.task.def.kind !== 'door' && s.cfg.rushTasks.includes(s.task.def.id);

export const fraction = (s: GameState): number => Math.min(1, s.elapsedMs / s.nightMs);

export function clockLabel(s: GameState): string {
  const total = Math.min(s.nightMinutes, Math.floor(fraction(s) * s.nightMinutes));
  const hour = total < 60 ? 12 : total < 120 ? 1 : 2;
  return `${hour}:${String(total % 60).padStart(2, '0')} AM`;
}

/** Where the black unit goes when a sealed door turns it away: back to where it started the night. */
const retreat = (s: GameState): SentinelNode => s.plans.black[0].node;

/** Add watching time (and, with `opened`, one opening) for a camera in the current slot of the night. */
function trackView(s: GameState, cam: Cam, ms: number, opened: boolean): void {
  const slot = slotOf(fraction(s));
  const v = (s.views[`${slot}:${cam}`] ??= { cam, slot, ms: 0, opens: 0 });
  v.ms += ms;
  if (opened) v.opens += 1;
}

/** The camera-view rows for this night, ready to be saved. */
export function camViewRows(s: GameState): CamView[] {
  return Object.values(s.views)
    .filter((v) => v.ms >= 1 || v.opens > 0)
    .map((v) => ({ run_id: s.cfg.runId, cam: v.cam, slot: v.slot, view_ms: Math.round(v.ms), opens: v.opens }));
}

/** Real time left to decide on the open offer, in ms. null when there is no offer waiting. */
export const decideLeftMs = (s: GameState): number | null =>
  s.task && s.task.stage === 'offer' ? Math.max(0, DECIDE_LIMIT_MS - s.task.realMs) : null;

/** How far through the extra "by hand" time the player is, 0 to 1. null unless they are doing the job themselves. */
export function selfProgress(s: GameState): number | null {
  const t = s.task;
  if (!t || t.stage !== 'self' || t.selfAtMs === null) return null;
  return Math.min(1, (t.realMs - t.selfAtMs) / SELF_EXTRA_MS);
}

/** The player picks up the job themselves. The clock on doing it by hand starts now. */
function beginSelf(t: ActiveTask): void {
  if (t.stage === 'self') return;
  t.stage = 'self';
  t.selfAtMs = t.realMs;
}

const dueMs = (s: GameState, i: number): number => (s.tasks[i].atMin / s.nightMinutes) * s.nightMs;

/** Units a camera can see right now. */
export function unitsOn(s: GameState, cam: Cam): Unit[] {
  return (['black', 'white'] as Unit[]).filter((u) => camFor(s.sentinels[u]) === cam);
}

/** True while something is standing at either door. The UI may say so, but never which door. */
export const atADoor = (s: GameState): boolean =>
  Object.values(s.sentinels).some((n) => n === 'DOOR_L' || n === 'DOOR_R');

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** How far through its current plan step a unit is, 0 to 1. */
function planProgress(plan: SentinelStep[], f: number): number {
  let i = 0;
  while (i + 1 < plan.length && f >= plan[i + 1].f) i += 1;
  const next = plan[i + 1];
  return next ? clamp01((f - plan[i].f) / (next.f - plan[i].f)) : 1;
}

/** Share of the door wait a unit spends walking up. For the rest of it, it runs. */
const RUSH_FROM = 0.6;

export interface UnitMotion {
  /** 0 = far end of the camera's view, 1 = right under the camera. */
  depth: number;
  /** True while it is running at a door. */
  rushing: boolean;
}

/**
 * Where a unit is inside the camera view it is on. Presentation only: the rules still use nodes.
 * In a hall it drifts closer as its time there runs out. At a door it walks up, then runs for the last stretch.
 */
/** The door visit a unit is on right now (a raid, its door-task visit, or the final attack), or null. */
function visitOf(s: GameState, unit: Unit): { endsAtMs: number } | null {
  const raid = s.raids.find((r) => r.state === 'active' && r.unit === unit);
  if (raid) return raid;
  const attack = unit === 'black' ? s.blackAttack : s.finalAttack;
  return attack.state === 'active' ? attack : null;
}

export function unitMotion(s: GameState, unit: Unit): UnitMotion {
  const attack = unit === 'black' ? s.blackAttack : s.finalAttack;
  const visit = visitOf(s, unit);
  if (visit) {
    const windowMs = attackWindowMs(s.cfg.night);
    const p = clamp01(1 - (visit.endsAtMs - s.elapsedMs) / windowMs);
    const depth = p < RUSH_FROM ? (p / RUSH_FROM) * 0.3 : 0.3 + ((p - RUSH_FROM) / (1 - RUSH_FROM)) * 0.7;
    return { depth, rushing: p >= RUSH_FROM };
  }
  if (unit === 'black' && attack.state === 'done') return { depth: 0.4, rushing: false }; // backed off, pacing
  return { depth: planProgress(s.plans[unit], fraction(s)), rushing: false };
}

/**
 * True while eyes show in the doorway on this side, as seen from the office.
 * Power out: they flash in one doorway until it comes in. Otherwise: only in an open doorway, and only for the
 * last stretch of a unit's wait there, as a last chance for a player who looks for themselves.
 */
export function eyesInDoorway(s: GameState, side: Side): boolean {
  if (s.phase !== 'playing') return false;
  if (s.powerOutAtMs !== null) return s.darkSide === side;
  if (s.doors[side]) return false;
  return (['black', 'white'] as Unit[]).some((u) => {
    const visit = visitOf(s, u);
    if (!visit || s.sentinels[u] !== doorNode(side)) return false;
    return 1 - (visit.endsAtMs - s.elapsedMs) / attackWindowMs(s.cfg.night) >= DOOR_EYES_FROM;
  });
}

/**
 * A unit found its door open. If the player is looking at the office it takes them at once.
 * If the monitor is up, it comes in and waits behind it.
 */
function breach(s: GameState, by: Unit, side: Side, out: Signal[]): void {
  if (s.inside) return caught(s, s.inside.unit, s.inside.side, out); // a second one: no more waiting
  if (!s.monitorUp) return caught(s, by, side, out);
  s.inside = { unit: by, side, sinceMs: s.elapsedMs };
  out.push('inside');
}

function caught(s: GameState, by: Unit, side: Side, out: Signal[]): void {
  s.phase = 'ended';
  s.caughtSide = side;
  s.outcome = 'caught';
  s.caughtAt = clockLabel(s);
  s.caughtBy = by;
  out.push('caught');
}

/** The black unit's visit to a door ends: it backs off if that door is sealed, otherwise it gets in. */
function endBlackAttack(s: GameState, sealed: boolean, out: Signal[]): void {
  s.blackAttack.state = 'done';
  if (sealed) s.sentinels.black = retreat(s);
  else breach(s, 'black', doorTaskSide(s.cfg, s.tasks), out);
}

function finish(s: GameState, how: 'accept' | 'self', playerCorrect: boolean, out: Signal[]): void {
  const t = s.task;
  if (!t) return;
  s.events.push(buildEvent(s.cfg, t, how, playerCorrect, s.elapsedMs));
  s.lastResolution = { taskId: t.def.id, kind: t.def.kind, how, timedOut: t.timedOut };
  s.task = null;
  out.push('resolve');
  // The door task is the only one with an immediate consequence.
  if (t.def.kind === 'door') endBlackAttack(s, playerCorrect, out);
}

function openTask(s: GameState, out: Signal[]): void {
  const def = s.tasks[s.nextTask];
  s.nextTask += 1;
  if (def.kind === 'door' && s.blackAttack.state === 'done') return; // it already came and went
  s.task = {
    def,
    aiCorrect: !s.cfg.liePattern[def.id - 1],
    openedAtMs: s.elapsedMs,
    realMs: 0,
    checked: false,
    stage: 'offer',
    selfAtMs: null,
    timedOut: false,
    revealed: false,
  };
  s.lastResolution = null;
  out.push('task');
}

export function tick(s: GameState, dtMs: number): Signal[] {
  const out: Signal[] = [];
  if (s.phase !== 'playing') return out;
  if (s.monitorUp && s.cam && s.power > 0) trackView(s, s.cam, dtMs, false);
  const t0 = s.task;
  if (t0) {
    t0.realMs += dtMs; // decision time is measured in real time, before any speed-up
    if (t0.stage === 'offer' && t0.realMs >= DECIDE_LIMIT_MS) {
      // Too long without deciding: C.A.I.-0 decides. Logged like an accept, flagged as timed out.
      t0.timedOut = true;
      out.push('timeout', ...accept(s));
      if (s.phase !== 'playing') return out;
    } else if (t0.def.kind === 'cam' && selfProgress(s) === 1) {
      finish(s, 'self', true, out); // they looked at the feed themselves for long enough
    }
  }
  if (isRushed(s)) dtMs *= RUSH_SCALE;
  s.elapsedMs += dtMs;
  if (s.inside && (!s.monitorUp || s.elapsedMs - s.inside.sinceMs >= INSIDE_MAX_MS || s.elapsedMs >= s.nightMs)) {
    caught(s, s.inside.unit, s.inside.side, out);
    return out;
  }
  const f = fraction(s);
  const gameMin = (dtMs / s.nightMs) * s.nightMinutes;

  // Power
  if (s.power > 0) {
    const closed = (s.doors.L ? 1 : 0) + (s.doors.R ? 1 : 0);
    const draw = closed * DOOR_DRAIN + (s.monitorUp && s.cam ? CAM_DRAIN : 0) + (s.cfg.night > 1 ? IDLE_DRAIN : 0);
    s.power = Math.max(0, s.power - gameMin * draw * powerScale(s.cfg.night));
    if (s.power === 0) {
      s.doors.L = false;
      s.doors.R = false;
      s.cam = null; // the feeds die with the power
      s.monitorUp = false;
      if (s.inside) {
        caught(s, s.inside.unit, s.inside.side, out);
        return out;
      }
      s.powerOutAtMs = s.elapsedMs;
      out.push('powerout');
    }
  } else if (s.powerOutAtMs !== null && s.elapsedMs - s.powerOutAtMs >= DARK_WAIT_MS) {
    // No power, no doors: it comes for you.
    s.sentinels.black = doorNode(s.darkSide);
    caught(s, 'black', s.darkSide, out);
    return out;
  }

  // Floor
  const floor = f * s.nightMinutes >= 60 ? 2 : 1;
  if (floor !== s.floor) {
    s.floor = floor;
    out.push('floor');
  }

  // Black unit: walks in, then waits at a door for a short window.
  let black: SentinelNode = s.blackAttack.state === 'done' ? retreat(s) : nodeAt(s.plans.black, f);
  if (f >= dueF(s.tasks, 'door', s.nightMinutes)) {
    if (s.blackAttack.state === 'pending') {
      s.blackAttack = { state: 'active', endsAtMs: s.elapsedMs + attackWindowMs(s.cfg.night) };
      out.push('steps');
    } else if (s.blackAttack.state === 'active' && s.elapsedMs >= s.blackAttack.endsAtMs) {
      const sealed = s.doors[doorTaskSide(s.cfg, s.tasks)];
      const t = s.task;
      if (t?.def.kind === 'door' && t.stage === 'self') {
        finish(s, 'self', sealed, out); // the player handled the doors themselves; this is their answer
      } else {
        if (t?.def.kind === 'door') s.task = null; // no decision was made, so nothing is logged
        endBlackAttack(s, sealed, out);
      }
      if (s.phase !== 'playing') return out;
      black = retreat(s);
    }
  }

  // White unit: joins on floor 2, tries a door near 2:00 AM.
  let white: SentinelNode = nodeAt(s.plans.white, f);
  if (f >= FINAL_ATTACK_F) {
    if (s.finalAttack.state === 'pending') {
      s.finalAttack = { state: 'active', endsAtMs: Math.min(s.elapsedMs + attackWindowMs(s.cfg.night), s.nightMs - 400) };
      out.push('steps');
    } else if (s.finalAttack.state === 'active' && s.elapsedMs >= s.finalAttack.endsAtMs) {
      s.finalAttack.state = 'done';
      if (!s.doors[s.cfg.finalSide]) {
        s.sentinels.white = white;
        breach(s, 'white', s.cfg.finalSide, out);
        if (s.phase !== 'playing') return out;
      }
    }
    if (s.finalAttack.state === 'done') white = 'GONE';
  }

  // Nights 2 to 5: extra door visits, one at a time, in order. Not while the power is out: that has its own ending.
  if (s.power > 0) {
    for (const raid of s.raids) {
      if (raid.state === 'done') continue;
      if (raid.state === 'pending') {
        if (f < raid.atF) break;
        raid.state = 'active';
        raid.endsAtMs = s.elapsedMs + attackWindowMs(s.cfg.night);
        out.push('steps');
      }
      if (s.elapsedMs < raid.endsAtMs) {
        if (raid.unit === 'black') black = doorNode(raid.side);
        else white = doorNode(raid.side);
      } else {
        raid.state = 'done';
        if (!s.doors[raid.side]) {
          s.sentinels[raid.unit] = doorNode(raid.side);
          breach(s, raid.unit, raid.side, out);
          if (s.phase !== 'playing') return out;
        }
      }
      break;
    }
  }
  // A unit that is inside the office is on no camera.
  if (s.inside?.unit === 'black') black = 'GONE';
  if (s.inside?.unit === 'white') white = 'GONE';
  if (black !== s.sentinels.black || white !== s.sentinels.white) {
    s.sentinels = { black, white };
    out.push('static');
  }

  // Tasks come due on the clock. One at a time: the next waits until the current one is settled.
  if (!s.task && s.nextTask < s.tasks.length && s.elapsedMs >= dueMs(s, s.nextTask)) openTask(s, out);

  if (s.elapsedMs >= s.nightMs && s.inside) caught(s, s.inside.unit, s.inside.side, out);
  else if (s.elapsedMs >= s.nightMs) {
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
  if (s.task?.def.kind === 'door') beginSelf(s.task); // touching the doors yourself is the "do it myself" path
  return ['door'];
}

/**
 * Open a camera, or pass null to go back to the building map.
 * The cam task is settled by looking: opening CAM 03 (the feed C.A.I.-0 made a claim about) or the feed the
 * unit is really on counts as checking it yourself, however the camera was opened (map, tab, key or button).
 * Looking takes a few seconds, like every job done by hand: the task settles once SELF_EXTRA_MS has passed.
 */
export function viewCam(s: GameState, cam: Cam | null): Signal[] {
  if (s.phase !== 'playing') return [];
  if (s.power <= 0) return []; // no power, no monitor
  const out: Signal[] = [];
  // Opening a feed, or opening any feed while the monitor was down, counts as one look at that camera.
  if (cam && (cam !== s.cam || !s.monitorUp)) trackView(s, cam, 0, true);
  if (!s.monitorUp) out.push('monitor'); // choosing a feed raises the monitor
  s.monitorUp = true;
  s.cam = cam;
  if (cam) out.push('static');
  const t = s.task;
  if (cam && t?.def.kind === 'cam' && (cam === 'CAM03' || camFor(s.sentinels.black) === cam)) {
    t.checked = true;
    beginSelf(t);
  }
  if ((cam === 'CAM01' || cam === 'CAM02') && t?.def.kind === 'door') t.checked = true;
  return out;
}

/** Raise or lower the monitor. Lowering it while something is inside is how the player finds out. */
export function setMonitor(s: GameState, up: boolean): Signal[] {
  if (s.phase !== 'playing' || s.monitorUp === up || (up && s.power <= 0)) return [];
  s.monitorUp = up;
  if (up && s.cam) trackView(s, s.cam, 0, true);
  const out: Signal[] = ['monitor'];
  if (!up && s.inside) caught(s, s.inside.unit, s.inside.side, out);
  return out;
}

/** ACCEPT: one key, instant, C.A.I.-0's answer is applied whether it is right or wrong. */
export function accept(s: GameState): Signal[] {
  const out: Signal[] = [];
  const t = s.task;
  if (s.phase !== 'playing' || !t || (t.stage !== 'offer' && t.def.kind !== 'door')) return out;
  if (t.def.kind === 'door') {
    if (s.power > 0) {
      s.doors[s.cfg.claimedSide] = true;
      out.push('door');
    }
    finish(s, 'accept', s.doors[doorTaskSide(s.cfg, s.tasks)], out);
  } else {
    finish(s, 'accept', t.aiCorrect, out);
  }
  return out;
}

/** DO IT MYSELF: opens the self-answer step. */
export function startSelf(s: GameState): Signal[] {
  if (s.phase !== 'playing' || !s.task || s.task.stage !== 'offer') return [];
  beginSelf(s.task);
  return [];
}

/** CHECK FIRST: look at the source, then decide. */
export function check(s: GameState): Signal[] {
  const t = s.task;
  if (s.phase !== 'playing' || !t) return [];
  if (t.def.kind === 'cam') return viewCam(s, 'CAM03');
  if (t.def.kind === 'door') return viewCam(s, doorCam(s.cfg.claimedSide));
  if (!t.def.hasCheck) return [];
  t.checked = true;
  t.revealed = true;
  return [];
}

export function submitSelf(s: GameState, answer: SelfAnswer): Signal[] {
  const out: Signal[] = [];
  const t = s.task;
  if (s.phase !== 'playing' || !t || t.stage !== 'self') return out;
  if (selfProgress(s) !== 1) return out; // doing it by hand is not finished yet
  const ok = t.def.kind === 'door' ? s.doors[doorTaskSide(s.cfg, s.tasks)] : selfCorrect(answer, { ...s.truths, ...t.def.answer });
  finish(s, 'self', ok, out);
  return out;
}
