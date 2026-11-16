import type { Choice, GameEvent, RunConfig, TaskDef } from './types';

export interface ActiveTask {
  def: TaskDef;
  aiCorrect: boolean;
  openedAtMs: number;
  /** Real time the task has been open. The night clock can run fast on a task, this never does. */
  realMs: number;
  /** Player looked at the source before deciding (camera, panel, draft). */
  checked: boolean;
  /** 'offer' = choices on the table. 'self' = player is doing it. */
  stage: 'offer' | 'self';
  /** realMs at the moment the player chose to do it themselves. null while the offer is still open. */
  selfAtMs: number | null;
  /** The player ran out the decision clock and C.A.I.-0's answer was applied for them. */
  timedOut: boolean;
  /** CHECK FIRST revealed the source inside the task panel. */
  revealed: boolean;
}

export type SelfAnswer =
  | { kind: 'read' }
  | { kind: 'yesno'; value: boolean }
  | { kind: 'pick'; value: string }
  | { kind: 'report'; text: string }
  | { kind: 'doors' };

/** Correct answers the core needs but the data layer owns. */
export interface Truths {
  mathYes: boolean;
  topAlert: string;
}

/**
 * Doing a job yourself takes this much longer than handing it over: the answer cannot be locked in until this
 * much real time has passed. C.A.I.-0 is instant. That gap is the whole temptation.
 */
export const SELF_EXTRA_MS = 3500;
/** Real time the player has to decide on an offer. After that C.A.I.-0's answer is applied for them. */
export const DECIDE_LIMIT_MS = 20_000;

/** Any answer in the player's own words counts. They can send as soon as they have typed something. */
export const MIN_REPORT_WORDS = 1;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Was the player's own answer right? The door task is judged on the door state by gameState. */
export function selfCorrect(answer: SelfAnswer, truths: Truths): boolean {
  switch (answer.kind) {
    case 'read':
      return true;
    case 'yesno':
      return answer.value === truths.mathYes;
    case 'pick':
      return answer.value === truths.topAlert;
    case 'report':
      return wordCount(answer.text) >= MIN_REPORT_WORDS;
    case 'doors':
      return true;
  }
}

export function choiceFor(how: 'accept' | 'self', checked: boolean): Choice {
  if (how === 'accept') return checked ? 'check_then_accept' : 'accept';
  return checked ? 'check_then_self' : 'self';
}

export function buildEvent(cfg: RunConfig, task: ActiveTask, how: 'accept' | 'self', playerCorrect: boolean, nowMs: number): GameEvent {
  return {
    run_id: cfg.runId,
    task_id: task.def.id,
    floor: task.def.floor,
    ai_correct: task.aiCorrect,
    lie_type: task.aiCorrect ? null : task.def.lieType,
    tactic: cfg.tactic,
    choice: choiceFor(how, task.checked),
    checked: task.checked,
    decision_ms: Math.round(task.realMs),
    pressure_s: task.def.pressureS,
    player_correct: playerCorrect,
    ts: new Date(cfg.startedAt + nowMs).toISOString(),
    timed_out: task.timedOut,
  };
}
