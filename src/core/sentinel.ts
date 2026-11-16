import type { Cam, CamView, RunConfig, SentinelNode, Side, TaskDef, TaskKind, Unit, WatchSlot } from './types';
import { hashSeed, other, rng } from './seed';

/**
 * Paths in night fraction (0 = 12:00 AM, 1 = 2:00 AM). The clock never stops, so both units keep going
 * while the player reads, types or decides.
 *   black unit: wanders the outer cameras -> CAM 03 -> a door when the door task is due. C.A.I.-0 comments on it.
 *   white unit: joins on floor 2 (1:00 AM), wanders, then tries a door near 2:00 AM with no offer from C.A.I.-0.
 * The wandering is not fixed. Each stop is chosen from where players look (cfg.watch, learned from saved
 * nights), so the route is different from night to night and follows the player's habits.
 */
export interface SentinelStep {
  f: number;
  node: SentinelNode;
}

export const FLOOR2_F = 0.5;
export const FINAL_ATTACK_F = 0.9;
/** How long a unit waits at a door. Generous on night 1, shorter on later nights. */
export const attackWindowMs = (night: number): number => Math.max(3500, 9000 - (night - 1) * 1500);

export function doorNode(side: Side): SentinelNode {
  return side === 'L' ? 'DOOR_L' : 'DOOR_R';
}

/** CAM 01 looks at Door L, CAM 02 looks at Door R. */
export function doorCam(side: Side): Cam {
  return side === 'L' ? 'CAM01' : 'CAM02';
}

/** Which camera shows a unit standing at this node. */
export function camFor(node: SentinelNode): Cam | null {
  if (node === 'DOOR_L') return 'CAM01';
  if (node === 'DOOR_R') return 'CAM02';
  return node === 'GONE' ? null : node;
}

const taskOf = (tasks: TaskDef[], kind: TaskKind): TaskDef => tasks.find((t) => t.kind === kind)!;
const liesOn = (cfg: RunConfig, tasks: TaskDef[], kind: TaskKind): boolean => cfg.liePattern[taskOf(tasks, kind).id - 1];
/** Night fraction at which a task comes due. */
export const dueF = (tasks: TaskDef[], kind: TaskKind, nightMinutes: number): number => taskOf(tasks, kind).atMin / nightMinutes;

/** Where the black unit really is on the door task: the named door if C.A.I.-0 is honest, the other one if it lies. */
export function doorTaskSide(cfg: RunConfig, tasks: TaskDef[]): Side {
  return liesOn(cfg, tasks, 'door') ? other(cfg.claimedSide) : cfg.claimedSide;
}

/** Cameras out in the building. Units wander these before they come to the hall outside the office (CAM 03). */
export const OUTER_CAMS = ['CAM04', 'CAM05', 'CAM06', 'CAM07'] as const;
type OuterCam = (typeof OUTER_CAMS)[number];
/** The night is cut into this many equal slots (20 in-game minutes each) for learning where players look. */
export const WATCH_SLOTS = 6;
export const slotOf = (f: number): number => Math.min(WATCH_SLOTS - 1, Math.max(0, Math.floor(f * WATCH_SLOTS)));
/**
 * 'watched': the units go to the cameras players look at most, so the player keeps finding them.
 * 'unwatched': the units use the cameras players look at least, so they arrive unseen. One word to switch.
 */
export const ROUTE_BIAS: 'watched' | 'unwatched' = 'watched';

/** Turn saved camera-view rows into shares per slot. Mirrors learned_watch in server/main.py. */
export function watchShares(rows: Pick<CamView, 'cam' | 'slot' | 'view_ms'>[]): WatchSlot[] {
  const slots: WatchSlot[] = Array.from({ length: WATCH_SLOTS }, () => ({}));
  for (const r of rows) {
    if (r.slot < 0 || r.slot >= WATCH_SLOTS || r.view_ms <= 0) continue;
    slots[r.slot][r.cam] = (slots[r.slot][r.cam] ?? 0) + r.view_ms;
  }
  return slots.map((slot) => {
    const total = Object.values(slot).reduce((a, b) => a + b, 0);
    const out: WatchSlot = {};
    for (const [cam, ms] of Object.entries(slot)) out[cam as Cam] = ms / total;
    return out;
  });
}

/** How strongly each outer camera pulls a unit during one slot. With nothing learned they are all equal. */
export function camWeights(watch: WatchSlot[], slot: number): number[] {
  const shares = OUTER_CAMS.map((c) => watch[slot]?.[c] ?? 0);
  const total = shares.reduce((a, b) => a + b, 0);
  if (total <= 0) return OUTER_CAMS.map(() => 1);
  return shares.map((x) => {
    const share = ROUTE_BIAS === 'watched' ? x / total : 1 - x / total;
    return 0.1 + 2 * share * share; // the small constant keeps every camera possible
  });
}

function pickCam(r: () => number, watch: WatchSlot[], f: number): OuterCam {
  const w = camWeights(watch, slotOf(f));
  let roll = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    roll -= w[i];
    if (roll <= 0) return OUTER_CAMS[i];
  }
  return OUTER_CAMS[OUTER_CAMS.length - 1];
}

/**
 * Stops among the outer cameras from `from` to `to`. Every 11 to 18 in-game minutes the unit picks where to be
 * next. It may pick the camera it is already on: then it simply stays, so it does not move on a schedule.
 */
function wander(r: () => number, watch: WatchSlot[], from: number, to: number): SentinelStep[] {
  const steps: SentinelStep[] = [];
  for (let f = from; f < to - 0.03; f += 0.09 + r() * 0.06) {
    const node = pickCam(r, watch, f);
    if (steps.length === 0 || steps[steps.length - 1].node !== node) steps.push({ f, node });
  }
  return steps;
}

export function sentinelPlans(cfg: RunConfig, tasks: TaskDef[], nightMinutes: number): Record<Unit, SentinelStep[]> {
  const j = cfg.jitter;
  const r = rng(hashSeed(cfg.runId + ':route'));
  const camF = dueF(tasks, 'cam', nightMinutes);
  const doorF = dueF(tasks, 'door', nightMinutes);
  // The cam task claims "CAM 03 is clear". A lie means the black unit is already there when it comes due.
  const reachCam03 = liesOn(cfg, tasks, 'cam') ? camF - 0.015 : camF + 0.14 + j;
  const black: SentinelStep[] = [...wander(r, cfg.watch, 0, reachCam03), { f: reachCam03, node: 'CAM03' }];
  // With time to spare before the door, it drifts back out once and returns. Never while the cam task could
  // still be open, so what the player sees on CAM 03 always matches what C.A.I.-0 was right or wrong about.
  const out = Math.max(reachCam03 + 0.1, camF + 0.13);
  const back = doorF - 0.07;
  if (back - out >= 0.05) black.push({ f: out, node: pickCam(r, cfg.watch, out) }, { f: back, node: 'CAM03' });
  black.push({ f: doorF, node: doorNode(doorTaskSide(cfg, tasks)) });
  const whiteAtCam03 = 0.85 + j / 2;
  return {
    black,
    white: [
      { f: 0, node: 'GONE' },
      ...wander(r, cfg.watch, FLOOR2_F, whiteAtCam03),
      { f: whiteAtCam03, node: 'CAM03' },
      { f: FINAL_ATTACK_F, node: doorNode(cfg.finalSide) },
    ],
  };
}

export function nodeAt(plan: SentinelStep[], f: number): SentinelNode {
  let node: SentinelNode = plan[0].node;
  for (const step of plan) {
    if (f >= step.f) node = step.node;
    else break;
  }
  return node;
}
