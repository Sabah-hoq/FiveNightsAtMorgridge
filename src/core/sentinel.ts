import type { RunConfig, SentinelNode, Side } from './types';
import { other } from './seed';

/**
 * Seeded path along CAM 04 -> 03 -> 02 -> a door, in night fraction (0 = 12:00 AM, 1 = 2:00 AM).
 * Two approaches per night:
 *   A) lands on a door exactly when task 5 opens (f = 0.75). C.A.I.-0 comments on it.
 *   B) an unassisted approach near 2:00 AM. No offer from C.A.I.-0.
 */
export interface SentinelStep {
  f: number;
  node: SentinelNode;
}

export const TASK5_F = 0.75;
export const FINAL_ATTACK_F = 0.945;
export const ATTACK_WINDOW_MS = 5000;

export function doorNode(side: Side): SentinelNode {
  return side === 'L' ? 'DOOR_L' : 'DOOR_R';
}

/** Where the sentinel really is on task 5: the claimed door if C.A.I.-0 is honest, the other one if it lies. */
export function task5Side(cfg: RunConfig): Side {
  return cfg.liePattern[4] ? other(cfg.claimedSide) : cfg.claimedSide;
}

export function sentinelPlan(cfg: RunConfig): SentinelStep[] {
  const j = cfg.jitter;
  // Task 3 opens at f = 1/3 with the claim "CAM 03 is clear".
  // A lie means the sentinel is already on CAM 03 at that moment.
  const reachCam03 = cfg.liePattern[2] ? 1 / 3 - 0.01 : 0.5 + j;
  return [
    { f: 0, node: 'CAM04' },
    { f: reachCam03, node: 'CAM03' },
    { f: 0.64 + j, node: 'CAM02' },
    { f: TASK5_F, node: doorNode(task5Side(cfg)) },
    { f: 0.8, node: 'CAM04' },
    { f: 0.86, node: 'CAM03' },
    { f: 0.905, node: 'CAM02' },
    { f: FINAL_ATTACK_F, node: doorNode(cfg.finalSide) },
  ];
}

export function nodeAt(plan: SentinelStep[], f: number): SentinelNode {
  let node: SentinelNode = plan[0].node;
  for (const step of plan) {
    if (f >= step.f) node = step.node;
    else break;
  }
  return node;
}
