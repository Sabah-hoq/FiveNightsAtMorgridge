import { describe, expect, it } from 'vitest';
import { accept, camViewRows, check, createGame, decideLeftMs, selfProgress, startSelf, submitSelf, tick, viewCam } from './gameState';
import { camWeights, dueF, nodeAt, OUTER_CAMS, sentinelPlans, slotOf, WATCH_SLOTS, watchShares } from './sentinel';
import { parseWatch } from './seed';
import { DECIDE_LIMIT_MS, SELF_EXTRA_MS } from './tasks';
import { NIGHT_MINUTES, TASKS, TRUTHS } from '../data/tasks';
import type { RunConfig, WatchSlot } from './types';

const cfg: RunConfig = {
  runId: 't', mode: 'judge', tactic: 'helpful', liePattern: [false, false, false, false, false, false, false],
  learnedFrom: null, rushTasks: [], watch: [], watchedFrom: null, watchSource: null,
  claimedSide: 'L', night: 1, finalSide: 'R', jitter: 0, alias: null, startedAt: 0,
};
const game = (over: Partial<RunConfig> = {}) => createGame({ ...cfg, ...over }, TASKS, NIGHT_MINUTES, TRUTHS);
const wait = (g: ReturnType<typeof game>, ms: number) => {
  for (let t = 0; t < ms; t += 50) tick(g, 50);
};
const plans = (over: Partial<RunConfig> = {}) => sentinelPlans({ ...cfg, ...over }, TASKS, NIGHT_MINUTES);
const camF = dueF(TASKS, 'cam', NIGHT_MINUTES);
const doorF = dueF(TASKS, 'door', NIGHT_MINUTES);
const lieOnCam = [false, false, false, true, false, false, false];
/** Everyone watches one camera all night. */
const allOn = (cam: string): WatchSlot[] => Array.from({ length: WATCH_SLOTS }, () => ({ [cam]: 1 }));

describe('routes', () => {
  it('are different from night to night', () => {
    const routes = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((runId) => plans({ runId }).black.map((s) => s.node).join('>')));
    expect(routes.size).toBeGreaterThan(2);
  });

  it('always keep the promises the tasks depend on', () => {
    for (let i = 0; i < 40; i++) {
      const runId = `r${i}`;
      const honest = plans({ runId }).black;
      // "CAM 03 is clear" is true for as long as the cam task can stay open (20 real seconds).
      for (let f = 0; f <= camF + DECIDE_LIMIT_MS / 180_000; f += 0.005) expect(nodeAt(honest, f)).not.toBe('CAM03');
      expect(nodeAt(honest, doorF - 0.01)).toBe('CAM03');
      expect(nodeAt(honest, doorF)).toBe('DOOR_L');
      const lying = plans({ runId, liePattern: lieOnCam }).black;
      for (let f = camF; f <= camF + DECIDE_LIMIT_MS / 180_000; f += 0.005) expect(nodeAt(lying, f)).toBe('CAM03');
      const white = plans({ runId }).white;
      expect(nodeAt(white, 0.3)).toBe('GONE');
      expect(nodeAt(white, 0.95)).toBe('DOOR_R');
    }
  });

  it('follow where players look', () => {
    const count = (watch: WatchSlot[]) => {
      let on06 = 0, total = 0;
      for (let i = 0; i < 60; i++) {
        const black = plans({ runId: `w${i}`, watch }).black;
        for (let f = 0; f < 0.4; f += 0.01) {
          total += 1;
          if (nodeAt(black, f) === 'CAM06') on06 += 1;
        }
      }
      return on06 / total;
    };
    expect(count([])).toBeGreaterThan(0.1); // nothing learned: about a quarter of the time
    expect(count([])).toBeLessThan(0.4);
    expect(count(allOn('CAM06'))).toBeGreaterThan(0.7); // everyone watches CAM 06: that is where it walks
  });

  it('weights are even with nothing learned and ignore the door cameras', () => {
    expect(camWeights([], 0)).toEqual([1, 1, 1, 1]);
    expect(camWeights(allOn('CAM01'), 0)).toEqual([1, 1, 1, 1]);
    const w = camWeights([{ CAM05: 0.5, CAM01: 0.5 }], 0);
    expect(w[OUTER_CAMS.indexOf('CAM05')]).toBeGreaterThan(w[OUTER_CAMS.indexOf('CAM04')] * 5);
  });

  it('watch shares add up per slot and bad input from the server is refused', () => {
    const shares = watchShares([
      { cam: 'CAM04', slot: 0, view_ms: 3000 }, { cam: 'CAM06', slot: 0, view_ms: 1000 }, { cam: 'CAM05', slot: 2, view_ms: 10 },
      { cam: 'CAM05', slot: 9, view_ms: 10 },
    ]);
    expect(shares).toHaveLength(WATCH_SLOTS);
    expect(shares[0]).toEqual({ CAM04: 0.75, CAM06: 0.25 });
    expect(shares[2]).toEqual({ CAM05: 1 });
    expect(shares[1]).toEqual({});
    expect(parseWatch(shares, WATCH_SLOTS)).toEqual(shares);
    expect(parseWatch([{}], WATCH_SLOTS)).toBeNull();
    expect(parseWatch('nope', WATCH_SLOTS)).toBeNull();
    expect(parseWatch(Array.from({ length: WATCH_SLOTS }, () => ({ CAM99: 1, CAM04: 7 })), WATCH_SLOTS)).toEqual(Array.from({ length: WATCH_SLOTS }, () => ({})));
  });
});

describe('camera views are recorded', () => {
  it('by camera and by slot of the night, in real time', () => {
    const g = game();
    tick(g, 50);
    g.task = null;
    viewCam(g, 'CAM06');
    wait(g, 4000);
    viewCam(g, 'CAM04');
    wait(g, 1000);
    viewCam(g, null);
    wait(g, 3000); // the map is not a camera
    g.task = null;
    const rows = camViewRows(g);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.cam === 'CAM06')).toMatchObject({ run_id: 't', slot: 0, view_ms: 4000, opens: 1 });
    expect(rows.find((r) => r.cam === 'CAM04')).toMatchObject({ slot: 0, view_ms: 1000, opens: 1 });
    expect(slotOf(0.999)).toBe(WATCH_SLOTS - 1);
  });
});

describe('deciding takes time', () => {
  it('after 20 seconds without a decision, C.A.I.-0 decides and the event is flagged', () => {
    const g = game();
    tick(g, 50); // task 1 opens
    expect(decideLeftMs(g)).toBe(DECIDE_LIMIT_MS);
    wait(g, DECIDE_LIMIT_MS - 200);
    expect(g.task).not.toBeNull();
    const signals: string[] = [];
    for (let t = 0; t < 400; t += 50) signals.push(...tick(g, 50));
    expect(signals).toContain('timeout');
    expect(g.task).toBeNull();
    expect(g.events).toHaveLength(1);
    expect(g.events[0]).toMatchObject({ task_id: 1, choice: 'accept', timed_out: true });
    expect(g.events[0].decision_ms).toBeGreaterThanOrEqual(DECIDE_LIMIT_MS);
    expect(g.lastResolution).toMatchObject({ how: 'accept', timedOut: true });
  });

  it('a decision in time is not flagged, and accepting is instant', () => {
    const g = game();
    tick(g, 50);
    wait(g, 1000);
    accept(g);
    expect(g.events[0]).toMatchObject({ choice: 'accept', timed_out: false });
    expect(g.events[0].decision_ms).toBeLessThan(1200);
  });

  it('the clock stops once the player picks the job up themselves', () => {
    const g = game();
    tick(g, 50);
    startSelf(g);
    expect(decideLeftMs(g)).toBeNull();
    wait(g, DECIDE_LIMIT_MS + 2000);
    expect(g.task?.stage).toBe('self');
    expect(g.events).toHaveLength(0);
  });

  it('doing it yourself takes a few seconds longer than accepting', () => {
    const g = game();
    tick(g, 50);
    wait(g, 1000);
    startSelf(g);
    expect(selfProgress(g)).toBe(0);
    submitSelf(g, { kind: 'read' });
    expect(g.task).not.toBeNull(); // too soon: the job is not done yet
    wait(g, SELF_EXTRA_MS - 300);
    submitSelf(g, { kind: 'read' });
    expect(g.task).not.toBeNull();
    wait(g, 400);
    expect(selfProgress(g)).toBe(1);
    submitSelf(g, { kind: 'read' });
    expect(g.task).toBeNull();
    expect(g.events[0]).toMatchObject({ choice: 'self', timed_out: false });
    expect(g.events[0].decision_ms).toBeGreaterThanOrEqual(1000 + SELF_EXTRA_MS);
  });

  it('looking at the camera yourself also takes those seconds', () => {
    const g = game();
    for (;;) {
      tick(g, 50);
      const kind = g.task?.def.kind;
      if (kind === 'cam') break;
      if (kind) accept(g);
    }
    check(g);
    expect(g.cam).toBe('CAM03');
    expect(g.task?.stage).toBe('self');
    wait(g, SELF_EXTRA_MS - 300);
    expect(g.task).not.toBeNull();
    wait(g, 500);
    expect(g.task).toBeNull();
    expect(g.events[g.events.length - 1]).toMatchObject({ task_id: 4, choice: 'check_then_self', checked: true });
  });
});
