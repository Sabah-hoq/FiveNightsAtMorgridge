import { describe, expect, it } from 'vitest';
import { CAM_DRAIN, DARK_EYES_FROM, DARK_WAIT_MS, RUSH_SCALE, createGame, eyesInDoorway, isRushed, tick, toggleDoor, unitMotion, viewCam } from './gameState';
import { NIGHT_MINUTES, TASKS, TRUTHS } from '../data/tasks';
import type { RunConfig } from './types';

const cfg: RunConfig = {
  runId: 't', mode: 'judge', tactic: 'helpful', liePattern: [false, false, false, false, false, false, false],
  learnedFrom: null, rushTasks: [], claimedSide: 'L', night: 1, finalSide: 'R', jitter: 0, alias: null, startedAt: 0,
};
const game = (over: Partial<RunConfig> = {}) => createGame({ ...cfg, ...over }, TASKS, NIGHT_MINUTES, TRUTHS);
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

describe('learned hesitation', () => {
  it('runs the clock faster while a rushed task is open, and only then', () => {
    const g = game({ rushTasks: [1] });
    tick(g, 50); // task 1 opens at 12:00
    expect(isRushed(g)).toBe(true);
    const before = g.elapsedMs;
    tick(g, 1000);
    expect(g.elapsedMs - before).toBeCloseTo(1000 * RUSH_SCALE);
    g.task = null;
    const after = g.elapsedMs;
    tick(g, 1000);
    expect(g.elapsedMs - after).toBeCloseTo(1000);
  });

  it('records decision time in real time, so a fast clock does not make players look slower', () => {
    const g = game({ rushTasks: [1] });
    tick(g, 50);
    for (let i = 0; i < 40; i++) tick(g, 50);
    expect(g.task?.realMs).toBeCloseTo(2000);
  });

  it('never rushes the door task', () => {
    const g = game({ rushTasks: [7] });
    toggleDoor(g, 'L');
    run(g, 95.5);
    while (g.task && g.task.def.kind !== 'door') { g.task = null; tick(g, 50); }
    expect(g.task?.def.kind).toBe('door');
    expect(isRushed(g)).toBe(false);
  });
});

describe('getting caught', () => {
  it('remembers which door it came through', () => {
    const g = game(); // honest night: the black unit is at Door L, and it is left open
    run(g, 110);
    expect(g.outcome).toBe('caught');
    expect(g.caughtSide).toBe('L');
  });

  it('waits a seeded, unpredictable time in the dark, shows its eyes, then comes in', () => {
    const waits = new Set<number>();
    for (const runId of ['a', 'b', 'c', 'd', 'e']) {
      const g = game({ runId });
      waits.add(g.darkWaitMs);
      expect(g.darkWaitMs).toBeGreaterThanOrEqual(DARK_WAIT_MS.min);
      expect(g.darkWaitMs).toBeLessThanOrEqual(DARK_WAIT_MS.max);
      expect(game({ runId }).darkWaitMs).toBe(g.darkWaitMs);

      toggleDoor(g, 'L');
      g.power = 0.0001;
      tick(g, 50);
      expect(g.power).toBe(0);
      expect(g.doors.L).toBe(false);
      expect(eyesInDoorway(g, g.darkSide)).toBe(false);
      g.task = null;
      let waited = 0;
      while (g.phase === 'playing' && waited < 10_000) {
        tick(g, 50);
        waited += 50;
        if (g.phase === 'playing' && waited > g.darkWaitMs * DARK_EYES_FROM + 100) {
          expect(eyesInDoorway(g, g.darkSide)).toBe(true);
          expect(eyesInDoorway(g, g.darkSide === 'L' ? 'R' : 'L')).toBe(false);
        }
      }
      expect(g.outcome).toBe('caught');
      expect(g.caughtSide).toBe(g.darkSide);
      expect(Math.abs(waited - g.darkWaitMs)).toBeLessThanOrEqual(100);
    }
    expect(waits.size).toBeGreaterThan(1);
  });
});
