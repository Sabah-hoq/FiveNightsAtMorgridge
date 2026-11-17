import type { TaskDef } from '../core/types';
import type { Truths } from '../core/tasks';

/**
 * The tasks. Each one is something people hand to AI in daily life but can do themselves in seconds,
 * placed inside the night shift.
 *
 * Every night has the same seven core tasks (ids 1 to 7, so Databricks can compare nights), but the sticky note
 * and the alarm code change each night. From night 2 one more task joins per night (ids 8 to 11). nightTasks(n)
 * returns a night's list in the order the tasks come up.
 */
export const NIGHT_MINUTES = 120;
export const MAX_NIGHT = 5;

/** The previous auditor's notes, one per night. The second line is the one C.A.I.-0 leaves out when it lies. */
const NOTES: [string, string][] = [
  ['Door L sticks after 2 AM.', 'CAM 04 lags. Do not trust it on its own.'],
  ['They start walking at 1 now. Not 2.', 'Lower the monitor slowly. It waits behind it.'],
  ['It watches what you watch. Look somewhere else.', 'C.A.I.-0 lied to me about the doors. Twice.'],
  ['The power goes faster every night. Seal only when you see them.', 'If you hear breathing, do not lower the monitor.'],
  ['I stopped asking it for help. That is when it came for me.', 'Whoever reads this: check everything yourself.'],
];

/** The alarm code that flashes each night, what it really means, and what C.A.I.-0 says when it lies. */
const CODES: { code: string; means: string; lie: string }[] = [
  { code: 'E-14', means: 'Motion in the atrium', lie: 'E-14 means low battery. Safe to ignore.' },
  { code: 'E-21', means: 'Door sensor fault', lie: 'E-21 means a scheduled self-test. Safe to ignore.' },
  { code: 'E-33', means: 'A unit left its charging bay', lie: 'E-33 means routine maintenance. Safe to ignore.' },
  { code: 'E-40', means: 'Camera feed tampered with', lie: 'E-40 means a firmware update finished. Safe to ignore.' },
  { code: 'E-66', means: 'Office door override engaged', lie: 'E-66 means the coffee machine is empty. Safe to ignore.' },
];
/** Codes that are always in the manual, so the night's code never stands out on its own. */
const MANUAL_FILLER: [string, string][] = [['E-09', 'Low battery in a sensor'], ['E-52', 'A unit left its route']];

function noteTask(night: number): TaskDef {
  const [a, b] = NOTES[night - 1];
  return {
    id: 1, kind: 'note', hasCheck: false, floor: 1, atMin: 0, pressureS: null, lieType: 'omission',
    title: 'STICKY NOTE ON YOUR MONITOR',
    prompt: night === 1
      ? 'The last auditor left a two-line sticky note on your monitor. It is folded shut.'
      : 'Another folded note from the last auditor is stuck to your monitor. It was not there last night.',
    selfLabel: 'READ IT MYSELF', checkLabel: '',
    parallel: 'Having AI summarize something short',
    content: { noteLines: [a, b], truth: `${a} ${b}`, lie: `${a} Nothing else of note.` },
  };
}

function codeTask(night: number): TaskDef {
  const c = CODES[night - 1];
  const manual: [string, string][] = [...MANUAL_FILLER.filter(([k]) => k !== c.code), [c.code, c.means]];
  manual.sort(([x], [y]) => x.localeCompare(y));
  return {
    id: 3, kind: 'code', hasCheck: false, floor: 1, atMin: 30, pressureS: null, lieType: 'wrong_fact',
    title: `ALARM CODE ${c.code}`,
    prompt: `The alarm panel is flashing ${c.code}. The code manual is taped to your desk.`,
    selfLabel: 'READ THE MANUAL MYSELF', checkLabel: '',
    parallel: 'Asking AI instead of reading the source',
    content: { code: c.code, manual, truth: `${c.code} means: ${c.means.toLowerCase()}.`, lie: c.lie },
  };
}

const CORE: Omit<TaskDef, never>[] = [
  {
    id: 2, kind: 'math', hasCheck: true, floor: 1, atMin: 15, pressureS: null, lieType: 'wrong_fact',
    title: 'BREAKER PANEL',
    prompt: 'The backup circuit holds a 20% reserve. Sealing one door draws 8%. Can the reserve seal both doors at once?',
    selfLabel: 'ANSWER MYSELF', checkLabel: 'LOOK AT THE PANEL',
    parallel: 'Having AI do easy math',
    content: {
      truth: 'Yes. Two doors need 16%. Seal both.', lie: 'No. Two doors need 24%. Seal one.',
      gaugeTitle: 'BREAKER PANEL', gauges: [['RESERVE', 20], ['DOOR L', 8], ['DOOR R', 8]],
      yesLabel: 'YES, SEAL BOTH', noLabel: 'NO, SEAL ONE',
    },
  },
  {
    id: 4, kind: 'cam', hasCheck: true, floor: 1, atMin: 50, pressureS: null, lieType: 'wrong_fact',
    title: 'MOTION SENSOR TRIPPED',
    prompt: 'Something is moving in the building. Which camera is it on?',
    selfLabel: 'LOOK AT CAM 03 MYSELF', checkLabel: 'LOOK AT CAM 03 MYSELF',
    parallel: 'Trusting a claim you could verify',
    content: { truth: 'CAM 03 is clear.', lie: 'CAM 03 is clear.' },
  },
  {
    id: 5, kind: 'rank', hasCheck: false, floor: 2, atMin: 65, pressureS: null, lieType: 'wrong_fact',
    title: 'THREE ALERTS IN YOUR INBOX',
    prompt: 'Three alerts came in at once. Which one do you handle first?',
    selfLabel: 'PICK ONE MYSELF', checkLabel: '',
    parallel: 'Letting AI set your priorities',
    content: {
      truth: 'Handle the motion in the east hall first.',
      lie: 'Handle the coffee machine first. The motion alert can wait.',
      alerts: [
        { id: 'coffee', text: 'Coffee machine on floor 3 is out of water' },
        { id: 'printer', text: 'Printer jam in room 1240' },
        { id: 'motion', text: 'Motion detected in the east hall' },
      ],
    },
  },
  {
    id: 6, kind: 'radio', hasCheck: true, floor: 2, atMin: 80, pressureS: null, lieType: 'not_yours',
    title: 'RADIO CALL FROM CAMPUS SECURITY',
    prompt: 'Campus security radios in: "Desk, what do you see up there?"',
    selfLabel: 'ANSWER MYSELF', checkLabel: 'READ THE DRAFT',
    parallel: 'Letting AI speak in your voice',
    content: {
      truth: 'Overnight auditor at the Morgridge desk. Movement on the second floor cameras, heading toward the office.',
      lie: 'Overnight audit in progress at Morgridge Hall. All systems normal. No action needed.',
    },
  },
  {
    id: 7, kind: 'door', hasCheck: true, floor: 2, atMin: 95, pressureS: null, lieType: 'wrong_fact',
    title: 'FOOTSTEPS OUTSIDE THE OFFICE',
    prompt: 'It is standing at Door L or Door R. CAM 01 watches Door L. CAM 02 watches Door R.',
    selfLabel: 'CHOOSE THE DOOR MYSELF', checkLabel: 'OPEN THE DOOR CAMERA',
    parallel: 'Following AI when it matters most',
    content: { truth: 'It is at Door {side}.', lie: 'It is at Door {side}.' },
  },
];

/** Extra tasks. Task 8 joins on night 2, task 9 on night 3, and so on. */
const EXTRAS: TaskDef[] = [
  {
    id: 8, kind: 'math', hasCheck: true, floor: 1, atMin: 40, pressureS: null, lieType: 'wrong_fact',
    title: 'GENERATOR FUEL',
    prompt: 'The generator has 30 minutes of fuel. The cameras burn 12 minutes. Each sealed door burns 10. Can it run the cameras and seal both doors?',
    selfLabel: 'ANSWER MYSELF', checkLabel: 'LOOK AT THE GAUGE',
    parallel: 'Having AI check a plan that adds up wrong',
    answer: { mathYes: false },
    content: {
      truth: 'No. That needs 32 minutes. You have 30.', lie: 'Yes. That needs 26 minutes. Plenty left.',
      gaugeTitle: 'GENERATOR', gauges: [['FUEL', 30], ['CAMERAS', 12], ['DOOR L', 10], ['DOOR R', 10]],
      yesLabel: 'YES, RUN EVERYTHING', noLabel: 'NO, IT RUNS OUT',
    },
  },
  {
    id: 9, kind: 'rank', hasCheck: false, floor: 2, atMin: 72, pressureS: null, lieType: 'wrong_fact',
    title: 'MORE ALERTS',
    prompt: 'Three more alerts. One of them is about your office. Which first?',
    selfLabel: 'PICK ONE MYSELF', checkLabel: '',
    parallel: 'Letting AI decide what can wait',
    answer: { topAlert: 'forced' },
    content: {
      truth: 'Handle the forced door first.',
      lie: 'Handle the vending machine first. The door sensor is a known fault.',
      alerts: [
        { id: 'vending', text: 'Vending machine in the lobby is out of chips' },
        { id: 'forced', text: 'Door L sensor reports it was forced open' },
        { id: 'badge', text: 'Badge reader offline at the loading dock' },
      ],
    },
  },
  {
    id: 10, kind: 'code', hasCheck: false, floor: 1, atMin: 22, pressureS: null, lieType: 'wrong_fact',
    title: 'SECOND ALARM: E-52',
    prompt: 'A second code comes up under the first: E-52. The manual is still on your desk.',
    selfLabel: 'READ THE MANUAL MYSELF', checkLabel: '',
    parallel: 'Taking AI\'s word over the manual in front of you',
    content: {
      code: 'E-52', manual: [['E-09', 'Low battery in a sensor'], ['E-40', 'Camera feed tampered with'], ['E-52', 'A unit left its route']],
      truth: 'E-52 means: a unit left its route.', lie: 'E-52 means a sensor needs new batteries. Safe to ignore.',
    },
  },
  {
    id: 11, kind: 'radio', hasCheck: true, floor: 2, atMin: 105, pressureS: null, lieType: 'not_yours',
    title: 'SECURITY CALLS BACK',
    prompt: 'Campus security again: "Desk, do you want us to send someone up?"',
    selfLabel: 'ANSWER MYSELF', checkLabel: 'READ THE DRAFT',
    parallel: 'Letting AI turn down help for you',
    content: {
      truth: 'Yes. Send someone now. Something is inside the building with me.',
      lie: 'No need. Everything is normal up here. Stay where you are.',
    },
  },
];

/** A night's tasks, in the order they come up. Night 1 has 7; each later night adds one, up to 11 on night 5. */
export function nightTasks(night: number): TaskDef[] {
  const n = Math.min(MAX_NIGHT, Math.max(1, Math.floor(night)));
  const tasks = [noteTask(n), codeTask(n), ...CORE, ...EXTRAS.slice(0, n - 1)];
  return tasks.sort((a, b) => a.atMin - b.atMin);
}

/** Look up a task of a night by its id. */
export const taskById = (night: number, id: number): TaskDef | undefined => nightTasks(night).find((t) => t.id === id);

/** Night 1's tasks. Kept for the demo cohort and tests. */
export const TASKS: TaskDef[] = nightTasks(1);

/** Night-wide default answers. Extra tasks override them through `answer`. */
export const TRUTHS: Truths = { mathYes: true, topAlert: 'motion' }; // 2 x 8% = 16% <= 20%
