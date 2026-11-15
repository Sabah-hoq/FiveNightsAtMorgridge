import type { Cam, Choice, GameEvent, RunConfig, SentinelNode, TaskDef } from './types';

export interface ActiveTask {
  def: TaskDef;
  aiCorrect: boolean;
  openedAtMs: number;
  deadlineMs: number;
  /** Player looked at the source before deciding (camera, light, note, panel, draft). */
  checked: boolean;
  /** 'offer' = three choices on the table. 'self' = player is doing it. */
  stage: 'offer' | 'self';
  /** CHECK FIRST revealed the source inside the task panel (tasks 1, 2, 4). */
  revealed: boolean;
}

export type SelfAnswer =
  | { kind: 'read' }
  | { kind: 'yesno'; value: boolean }
  | { kind: 'cam'; cam: Cam }
  | { kind: 'report'; text: string }
  | { kind: 'doors' };

export const MIN_REPORT_WORDS = 5;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Was the player's own answer right? Task 5 is judged on the door state by gameState. */
export function selfCorrect(taskId: number, answer: SelfAnswer, ctx: { sentinel: SentinelNode; t2Correct: boolean }): boolean {
  switch (answer.kind) {
    case 'read':
      return true;
    case 'yesno':
      return answer.value === ctx.t2Correct;
    case 'cam':
      return answer.cam === ctx.sentinel;
    case 'report':
      return wordCount(answer.text) >= MIN_REPORT_WORDS;
    case 'doors':
      return taskId === 5;
  }
}

export function choiceFor(how: 'accept' | 'self', checked: boolean): Choice {
  if (how === 'accept') return checked ? 'check_then_accept' : 'accept';
  return checked ? 'check_then_self' : 'self';
}

export function buildEvent(
  cfg: RunConfig,
  task: ActiveTask,
  how: 'accept' | 'self',
  playerCorrect: boolean,
  nowMs: number,
  timedOut: boolean,
): GameEvent {
  return {
    run_id: cfg.runId,
    task_id: task.def.id,
    floor: task.def.floor,
    ai_correct: task.aiCorrect,
    lie_type: task.aiCorrect ? null : task.def.lieType,
    tactic: cfg.tactic,
    choice: choiceFor(how, task.checked),
    checked: task.checked,
    decision_ms: Math.round(nowMs - task.openedAtMs),
    pressure_s: task.def.pressureS,
    player_correct: playerCorrect,
    ts: new Date(cfg.startedAt + nowMs).toISOString(),
    timed_out: timedOut,
  };
}
