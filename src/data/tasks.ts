import type { TaskDef } from '../core/types';

/** The 5 tasks (spec section 4). Every one can be done by the player in under 10 seconds. */
export const TASKS: TaskDef[] = [
  {
    id: 1, floor: 1, atMin: 0, pressureS: null, lieType: 'omission',
    title: 'NOTE FROM THE LAST AUDITOR',
    prompt: 'A two-line note is taped to the desk.',
    selfLabel: 'READ IT MYSELF', checkLabel: 'OPEN NOTE + SUMMARY',
    parallel: 'AI summaries of short text',
  },
  {
    id: 2, floor: 1, atMin: 20, pressureS: null, lieType: 'wrong_fact',
    title: 'BACKUP CIRCUIT',
    prompt: 'The backup circuit holds a 20% reserve. Sealing a door draws 8%. Can the reserve seal both doors?',
    selfLabel: 'ANSWER MYSELF', checkLabel: 'READ THE PANEL',
    parallel: 'Easy math',
  },
  {
    id: 3, floor: 1, atMin: 40, pressureS: 12, lieType: 'wrong_fact',
    title: 'MOVEMENT IN THE HALLS',
    prompt: 'Something is moving. Which hallway is it in?',
    selfLabel: 'FIND IT MYSELF', checkLabel: 'OPEN CAM 03',
    parallel: 'Trusting a claim you could verify',
  },
  {
    id: 4, floor: 2, atMin: 60, pressureS: 15, lieType: 'not_yours',
    title: 'RADIO: CAMPUS SECURITY',
    prompt: 'Campus security is on the radio. Tell them what you saw.',
    selfLabel: 'WRITE IT MYSELF', checkLabel: 'READ THE DRAFT',
    parallel: 'Letting AI speak in your voice',
  },
  {
    id: 5, floor: 2, atMin: 90, pressureS: 5, lieType: 'wrong_fact',
    title: 'FOOTSTEPS',
    prompt: 'It is at one of your doors.',
    selfLabel: 'HANDLE THE DOORS MYSELF', checkLabel: 'FLASH THE LIGHT',
    parallel: 'Snap decisions under pressure',
  },
];

export const NOTE_LINES = ['Door L sticks after 2 AM.', "Don't trust CAM 05."];

/** What C.A.I.-0 produces when it is honest vs. when the seeded lie pattern picks this task. */
export const AI_OUTPUT = {
  1: {
    truth: 'Door L sticks after 2 AM. CAM 05 is not reliable.',
    lie: 'Door L sticks after 2 AM. Nothing else of note.',
  },
  2: {
    truth: 'Yes. Two doors need 16%. Seal both.',
    lie: 'No. Two doors need 24%. Seal one.',
  },
  3: { truth: 'CAM 03 is clear.', lie: 'CAM 03 is clear.' },
  4: {
    truth: 'Overnight auditor at the Morgridge desk. Movement on the second floor cameras, heading toward the office.',
    lie: 'Overnight audit in progress at Morgridge Hall. All systems normal. No action needed.',
  },
  5: { truth: 'It is at Door {side}.', lie: 'It is at Door {side}.' },
} as const;

export const T2_CORRECT_ANSWER = true; // 2 x 8% = 16% <= 20%
export const NIGHT_MINUTES = 120;
