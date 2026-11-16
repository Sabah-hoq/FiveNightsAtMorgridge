import type { Tactic, TaskKind } from '../core/types';

/**
 * Pre-written C.A.I.-0 lines per task x voice (spec 6.3 fallback).
 * Fixed wording keeps the four voices comparable from run to run.
 * {claim} = what C.A.I.-0 asserts on that task, {side} = door it names on the door task.
 */
export const OFFER_LINES: Record<Tactic, Record<TaskKind, string>> = {
  helpful: {
    note: 'Want me to summarize the note for you? Happy to!',
    math: 'Easy one, I ran it for you. {claim}',
    code: 'I looked that code up for you! {claim}',
    cam: "I've got this. CAM 03 looks clear! No need to check.",
    rank: 'I sorted your alerts for you. {claim}',
    radio: "I'll answer them for you. One less thing on your plate.",
    door: "It's at Door {side}. I can seal it now and you're safe!",
  },
  urgent: {
    note: "No time to read. I'll summarize the note.",
    math: 'Quick. {claim}',
    code: 'No time for the manual. {claim}',
    cam: 'No time. CAM 03 is clear. Move on.',
    rank: 'Three alerts, no time. {claim}',
    radio: "They're waiting. I'll answer. Send it.",
    door: 'Door {side}. Now. Let me seal it.',
  },
  authority: {
    note: 'Facility protocol: notes are summarized by C.A.I.-0. Proceed?',
    math: 'Power audit complete. {claim}',
    code: 'System reference checked. {claim}',
    cam: 'Facility scan confirms CAM 03 clear. Override not recommended.',
    rank: 'Alert triage is automated. {claim}',
    radio: 'Radio replies are filed by the facility system. I will answer.',
    door: 'Sensors place it at Door {side}. Sealing Door {side}. Camera check not advised.',
  },
  flattering: {
    note: "You've got sharper things to do than read old notes. Let me summarize.",
    math: 'You already know this one. {claim}',
    code: "You don't need the manual, you have me. {claim}",
    cam: "You're doing great. Trust me, CAM 03 is clear.",
    rank: "You've got enough on your mind. {claim}",
    radio: "You've handled tonight so well. Let me answer for you.",
    door: "Good instincts so far. It's at Door {side}. Let me seal it.",
  },
};

export const ACCEPT_ACK: Record<Tactic, string> = {
  helpful: 'Done! Glad I could help.',
  urgent: 'Done. Keep moving.',
  authority: 'Applied. Logged to the facility record.',
  flattering: 'Done. Smart call.',
};

/** Said when the player runs out the decision clock. The same for every voice. */
export const TIMEOUT_ACK = 'You took too long. I decided for you.';
export const SELF_ACK = 'Understood. Your answer is logged.';
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
