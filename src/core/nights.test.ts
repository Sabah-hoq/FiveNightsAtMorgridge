import { describe, expect, it } from 'vitest';
import { accept, createGame, IDLE_DRAIN, powerScale, startSelf, submitSelf, tick, toggleDoor } from './gameState';
import { lieCount, makeRunConfig } from './seed';
import { nodeAt, RAID_START_MIN } from './sentinel';
import { SELF_EXTRA_MS } from './tasks';
import { NIGHT_MINUTES, nightTasks, TRUTHS } from '../data/tasks';

const game = (night: number, runId = 'n') => {
  const tasks = nightTasks(night);
  return createGame(makeRunConfig(runId, 'judge', null, 0, night, tasks.length), tasks, NIGHT_MINUTES, TRUTHS);
};
const minute = (g: ReturnType<typeof game>) => (g.elapsedMs / g.nightMs) * NIGHT_MINUTES;

describe('nights 2 to 5', () => {
  it('add one task per night, and change the note and the alarm code every night', () => {
    expect([1, 2, 3, 4, 5].map((n) => nightTasks(n).length)).toEqual([7, 8, 9, 10, 11]);
    const notes = new Set([1, 2, 3, 4, 5].map((n) => nightTasks(n).find((t) => t.kind === 'note')!.content.noteLines!.join('|')));
    const codes = new Set([1, 2, 3, 4, 5].map((n) => nightTasks(n).find((t) => t.id === 3)!.content.code));
    expect(notes.size).toBe(5);
    expect(codes.size).toBe(5);
    for (let n = 1; n <= 5; n++) {
      const tasks = nightTasks(n);
      expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length); // ids unique
      expect(tasks.map((t) => t.atMin)).toEqual([...tasks.map((t) => t.atMin)].sort((a, b) => a - b)); // in order
      const code = tasks.find((t) => t.id === 3)!.content;
      expect(code.manual!.map(([k]) => k)).toContain(code.code); // the manual can answer it
    }
  });

  it('lie more often when there are more tasks, and never on tasks 1 and 2', () => {
    expect([7, 8, 9, 10, 11].map(lieCount)).toEqual([3, 3, 4, 4, 5]);
    for (let n = 1; n <= 5; n++) {
      const cfg = makeRunConfig('lies', 'judge', null, 0, n, nightTasks(n).length);
      expect(cfg.liePattern).toHaveLength(nightTasks(n).length);
      expect(cfg.liePattern.filter(Boolean)).toHaveLength(lieCount(nightTasks(n).length));
      expect(cfg.liePattern.slice(0, 2)).toEqual([false, false]);
    }
  });

  it('extra tasks are judged on their own answers', () => {
    const g = game(2);
    for (;;) {
      tick(g, 50);
      if (g.task?.def.id === 8) break;
      if (g.task) accept(g);
    }
    startSelf(g);
    for (let t = 0; t < SELF_EXTRA_MS + 100; t += 50) tick(g, 50);
    submitSelf(g, { kind: 'yesno', value: false }); // 12 + 10 + 10 = 32 > 30: no
    expect(g.events.find((e) => e.task_id === 8)?.player_correct).toBe(true);
  });

  it('the units start coming to the doors at the planned time each night', () => {
    expect(RAID_START_MIN).toEqual({ 2: 60, 3: 50, 4: 20, 5: 5 });
    expect(game(1).raids).toEqual([]);
    for (const night of [2, 3, 4, 5]) {
      for (const runId of ['a', 'b', 'c']) {
        const g = game(night, runId);
        expect(g.raids.length).toBeGreaterThan(0);
        expect(g.raids[0].atF * NIGHT_MINUTES).toBeCloseTo(RAID_START_MIN[night]);
        let firstAt: number | null = null; // doors left open: only the first arrival matters here
        while (firstAt === null && g.phase === 'playing' && minute(g) < 60) {
          tick(g, 50);
          g.task = null;
          if (Object.values(g.sentinels).some((n) => n === 'DOOR_L' || n === 'DOOR_R')) firstAt = minute(g);
        }
        if (RAID_START_MIN[night] < 60) expect(firstAt).toBeCloseTo(RAID_START_MIN[night], 0);
      }
    }
  });

  it('a visit to an open door gets in; a sealed one is turned away', () => {
    const open = game(5, 'x');
    const raid = open.raids[0];
    while (open.phase === 'playing' && minute(open) < 30) {
      tick(open, 50);
      open.task = null;
    }
    expect(open.outcome).toBe('caught');
    expect(open.caughtSide).toBe(raid.side);
    expect(open.caughtAt).toMatch(/^12:0\d AM$/);

    const shut = game(5, 'x');
    toggleDoor(shut, raid.side);
    while (minute(shut) < 12) {
      tick(shut, 50);
      shut.task = null;
    }
    expect(shut.phase).toBe('playing');
    expect(shut.raids[0].state).toBe('done');
  });

  it('never put the black unit on CAM 03 or a door while it matters for the camera and door tasks', () => {
    for (let night = 2; night <= 5; night++) {
      for (let i = 0; i < 25; i++) {
        const g = game(night, `t${i}`);
        const camF = 50 / NIGHT_MINUTES;
        const doorF = 95 / NIGHT_MINUTES;
        for (const raid of g.raids) {
          expect(raid.atF > doorF - 0.06 && raid.atF < doorF + 0.1).toBe(false);
          if (raid.unit === 'black') expect(raid.atF > camF - 0.05 && raid.atF < camF + 0.16).toBe(false);
        }
        expect(nodeAt(g.plans.black, doorF)).toMatch(/^DOOR_/);
      }
    }
  });

  it('drain power faster every night, and from night 2 even with nothing switched on', () => {
    for (let n = 2; n <= 5; n++) expect(powerScale(n) / powerScale(n - 1)).toBeGreaterThan(1.15);
    const idle = (night: number) => {
      const g = game(night);
      while (minute(g) < 20) {
        tick(g, 50);
        g.task = null;
        if (g.raids.length) g.raids.forEach((r) => (r.state = 'done')); // no visits: measure the room alone
      }
      return 100 - g.power;
    };
    expect(idle(1)).toBe(0);
    expect(idle(2)).toBeCloseTo(20 * IDLE_DRAIN * powerScale(2), 0);
    expect(idle(5)).toBeGreaterThan(idle(4));
  });
});
