import type { Cam, RunConfig, SentinelNode, Side, TaskDef, TaskKind, Unit } from './types';
import { other } from './seed';

/**
 * Seeded paths in night fraction (0 = 12:00 AM, 1 = 2:00 AM). The clock never stops, so both units
 * keep moving while the player reads, types or decides.
 *   black unit: CAM 04 -> CAM 03 -> a door when the door task is due. C.A.I.-0 comments on it.
 *   white unit: joins on floor 2 (1:00 AM), then tries a door near 2:00 AM with no offer from C.A.I.-0.
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

export function sentinelPlans(cfg: RunConfig, tasks: TaskDef[], nightMinutes: number): Record<Unit, SentinelStep[]> {
  const j = cfg.jitter;
  const camF = dueF(tasks, 'cam', nightMinutes);
  const doorF = dueF(tasks, 'door', nightMinutes);
  // The cam task claims "CAM 03 is clear". A lie means the black unit is already there when it comes due.
  const reachCam03 = liesOn(cfg, tasks, 'cam') ? camF - 0.015 : camF + 0.14 + j;
  return {
    black: [
      { f: 0, node: 'CAM04' },
      { f: reachCam03, node: 'CAM03' },
      { f: doorF, node: doorNode(doorTaskSide(cfg, tasks)) },
    ],
    white: [
      { f: 0, node: 'GONE' },
      { f: FLOOR2_F, node: 'CAM04' },
      { f: 0.85 + j / 2, node: 'CAM03' },
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
