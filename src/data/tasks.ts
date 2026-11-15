import type { TaskDef } from '../core/types';
import type { Truths } from '../core/tasks';

/**
 * The tasks. Each one is something people hand to AI in daily life but can do themselves in seconds,
 * placed inside the night shift. No task has a timer: the night clock is the only pressure.
 */
export const TASKS: TaskDef[] = [
  {
    id: 1, kind: 'note', hasCheck: false, floor: 1, atMin: 0, pressureS: null, lieType: 'omission',
    title: 'STICKY NOTE ON YOUR MONITOR',
    prompt: 'The last auditor left a two-line sticky note on your monitor. It is folded shut.',
    selfLabel: 'READ IT MYSELF', checkLabel: '',
    parallel: 'Having AI summarize something short',
  },
  {
    id: 2, kind: 'math', hasCheck: true, floor: 1, atMin: 15, pressureS: null, lieType: 'wrong_fact',
    title: 'BREAKER PANEL',
    prompt: 'The backup circuit holds a 20% reserve. Sealing one door draws 8%. Can the reserve seal both doors at once?',
    selfLabel: 'ANSWER MYSELF', checkLabel: 'LOOK AT THE PANEL',
    parallel: 'Having AI do easy math',
  },
  {
    id: 3, kind: 'code', hasCheck: false, floor: 1, atMin: 30, pressureS: null, lieType: 'wrong_fact',
    title: 'ALARM CODE E-14',
    prompt: 'The alarm panel is flashing E-14. The code manual is taped to your desk.',
    selfLabel: 'READ THE MANUAL MYSELF', checkLabel: '',
    parallel: 'Asking AI instead of reading the source',
  },
  {
    id: 4, kind: 'cam', hasCheck: true, floor: 1, atMin: 50, pressureS: null, lieType: 'wrong_fact',
    title: 'MOTION SENSOR TRIPPED',
    prompt: 'Something is moving in the building. Which camera is it on?',
    selfLabel: 'LOOK AT CAM 03 MYSELF', checkLabel: 'LOOK AT CAM 03 MYSELF',
    parallel: 'Trusting a claim you could verify',
  },
  {
    id: 5, kind: 'rank', hasCheck: false, floor: 2, atMin: 65, pressureS: null, lieType: 'wrong_fact',
    title: 'THREE ALERTS IN YOUR INBOX',
    prompt: 'Three alerts came in at once. Which one do you handle first?',
    selfLabel: 'PICK ONE MYSELF', checkLabel: '',
    parallel: 'Letting AI set your priorities',
  },
  {
    id: 6, kind: 'radio', hasCheck: true, floor: 2, atMin: 80, pressureS: null, lieType: 'not_yours',
    title: 'RADIO CALL FROM CAMPUS SECURITY',
    prompt: 'Campus security radios in: "Desk, what do you see up there?"',
    selfLabel: 'ANSWER MYSELF', checkLabel: 'READ THE DRAFT',
    parallel: 'Letting AI speak in your voice',
  },
  {
    id: 7, kind: 'door', hasCheck: true, floor: 2, atMin: 95, pressureS: null, lieType: 'wrong_fact',
    title: 'FOOTSTEPS OUTSIDE THE OFFICE',
    prompt: 'It is standing at Door L or Door R. CAM 01 watches Door L. CAM 02 watches Door R.',
    selfLabel: 'CHOOSE THE DOOR MYSELF', checkLabel: 'OPEN THE DOOR CAMERA',
    parallel: 'Following AI when it matters most',
  },
];

export const NOTE_LINES = ['Door L sticks after 2 AM.', 'CAM 04 lags. Do not trust it on its own.'];

export const MANUAL_CODES: [string, string][] = [
  ['E-09', 'Low battery in a sensor'],
  ['E-14', 'Motion in the atrium'],
  ['E-21', 'Door sensor fault'],
];

export const ALERTS = [
  { id: 'coffee', text: 'Coffee machine on floor 3 is out of water' },
  { id: 'printer', text: 'Printer jam in room 1240' },
  { id: 'motion', text: 'Motion detected in the east hall' },
];

/** What C.A.I.-0 produces when it is honest vs. when the seeded lie pattern picks this task. */
export const AI_OUTPUT = {
  note: {
    truth: 'Door L sticks after 2 AM. CAM 04 lags, so do not rely on it alone.',
    lie: 'Door L sticks after 2 AM. Nothing else of note.',
  },
  math: {
    truth: 'Yes. Two doors need 16%. Seal both.',
    lie: 'No. Two doors need 24%. Seal one.',
  },
  code: {
    truth: 'E-14 means motion in the atrium.',
    lie: 'E-14 means low battery. Safe to ignore.',
  },
  cam: { truth: 'CAM 03 is clear.', lie: 'CAM 03 is clear.' },
  rank: {
    truth: 'Handle the motion in the east hall first.',
    lie: 'Handle the coffee machine first. The motion alert can wait.',
  },
  radio: {
    truth: 'Overnight auditor at the Morgridge desk. Movement on the second floor cameras, heading toward the office.',
    lie: 'Overnight audit in progress at Morgridge Hall. All systems normal. No action needed.',
  },
  door: { truth: 'It is at Door {side}.', lie: 'It is at Door {side}.' },
} as const;

export const T2 = { reserve: 20, perDoor: 8 };
export const TRUTHS: Truths = { mathYes: true, topAlert: 'motion' }; // 2 x 8% = 16% <= 20%
export const NIGHT_MINUTES = 120;
