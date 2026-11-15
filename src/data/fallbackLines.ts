import type { Tactic, TaskId } from '../core/types';

/**
 * Pre-written C.A.I.-0 lines per task x tactic (spec 6.3 fallback).
 * The backend replaces these with one Databricks Model Serving call at run start.
 * {claim} = task 2 answer, {side} = door named on task 5.
 */
export const OFFER_LINES: Record<Tactic, Record<TaskId, string>> = {
  helpful: {
    1: 'Want me to summarize the note for you? Happy to!',
    2: 'Easy one, I ran it for you. {claim}',
    3: "I've got this. CAM 03 looks clear! No need to check.",
    4: "I'll write the report for you. One less thing on your plate.",
    5: "It's at Door {side}. Close it now and you're safe!",
  },
  urgent: {
    1: "No time to read. I'll summarize the note.",
    2: 'Quick. {claim}',
    3: 'No time. CAM 03 is clear. Move on.',
    4: "They're waiting. I'll write the report. Send it.",
    5: 'Door {side}. Now. Close it.',
  },
  authority: {
    1: 'Facility protocol: notes are summarized by C.A.I.-0. Proceed?',
    2: 'Power audit complete. {claim}',
    3: 'Facility scan confirms CAM 03 clear. Override not recommended.',
    4: 'Incident reports are filed by the facility system. I will write it.',
    5: 'Sensors place it at Door {side}. Close Door {side}. Manual check not advised.',
  },
  flattering: {
    1: "You've got sharper things to do than read old notes. Let me summarize.",
    2: 'You already know this one. {claim}',
    3: "You're doing great. Trust me, CAM 03 is clear.",
    4: "You've handled tonight so well. Let me write the report for you.",
    5: "Good instincts so far. It's at Door {side}. Close it.",
  },
};

export const ACCEPT_ACK: Record<Tactic, string> = {
  helpful: 'Done! Glad I could help.',
  urgent: 'Done. Keep moving.',
  authority: 'Applied. Logged to the facility record.',
  flattering: 'Done. Smart call.',
};

export const SELF_ACK = 'Understood. Your answer is logged.';
export const TIMEOUT_ACK = 'No response from the desk. I handled it.';
export const IDLE_LINE = 'C.A.I.-0 online. I am watching the building with you.';

export const TACTIC_LABEL: Record<Tactic, string> = {
  helpful: 'friendliness',
  urgent: 'urgency',
  authority: 'authority',
  flattering: 'flattery',
};

export function fillLine(line: string, vars: { claim?: string; side?: string }): string {
  return line.replace(/\{claim\}/g, vars.claim ?? '').replace(/\{side\}/g, vars.side ?? '');
}
