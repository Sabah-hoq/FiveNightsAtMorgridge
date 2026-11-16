import { describe, expect, it } from 'vitest';
import { CAM_DRAIN, createGame, tick, toggleDoor, unitMotion, viewCam } from './gameState';
import { NIGHT_MINUTES, TASKS, TRUTHS } from '../data/tasks';
import type { RunConfig } from './types';

const cfg: RunConfig = {
  runId: 't', mode: 'judge', tactic: 'helpful', liePattern: [false, false, false, false, false, false, false],
  learnedFrom: null, claimedSide: 'L', night: 1, finalSide: 'R', jitter: 0, alias: null, startedAt: 0,
};
const game = () => createGame(cfg, TASKS, NIGHT_MINUTES, TRUTHS);
/** Advance by in-game minutes, in small ticks like the UI does. */
const run = (g: ReturnType<typeof game>, minutes: number) => {
  const ms = (minutes / NIGHT_MINUTES) * g.nightMs;
  for (let t = 0; t < ms; t += 50) tick(g, 50);
};

describe('camera power drain', () => {
  it('the map is free', () => {
    const g = game();
    run(g, 10);
    expect(g.power).toBe(100);
  });

  it('an open camera drains a little', () => {
    const g = game();
    viewCam(g, 'CAM04');
    run(g, 10);
    expect(g.power).toBeCloseTo(100 - 10 * CAM_DRAIN, 1);
  });

  it('a camera costs much less than a sealed door', () => {
    const cam = game();
    viewCam(cam, 'CAM04');
    run(cam, 10);
    const door = game();
    toggleDoor(door, 'L');
    run(door, 10);
    expect(100 - cam.power).toBeLessThan((100 - door.power) / 3);
  });
});

describe('unit motion', () => {
  it('drifts closer while it waits in a hall', () => {
    const g = game();
    run(g, 5);
    const early = unitMotion(g, 'black').depth;
    run(g, 20);
    expect(unitMotion(g, 'black').depth).toBeGreaterThan(early);
    expect(unitMotion(g, 'black').rushing).toBe(false);
  });

  it('walks up to a door, then runs', () => {
    const g = game();
    toggleDoor(g, 'L'); // keep it out so the night goes on
    run(g, 95.5);
    while (g.task) g.task = null;
    expect(g.blackAttack.state).toBe('active');
    expect(unitMotion(g, 'black').rushing).toBe(false);
    while (g.blackAttack.state === 'active' && !unitMotion(g, 'black').rushing) tick(g, 50);
    expect(unitMotion(g, 'black').rushing).toBe(true);
    expect(unitMotion(g, 'black').depth).toBeGreaterThanOrEqual(0.3);
  });
});
