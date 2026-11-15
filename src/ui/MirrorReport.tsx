import type { GameEvent, MirrorMetrics, RunConfig, RunRow } from '../core/types';
import { TACTIC_LABEL } from '../data/fallbackLines';
import { AI_OUTPUT, TASKS } from '../data/tasks';
import { CertLine, GAME_TITLE } from './CertLine';

const CHOICE_TEXT: Record<GameEvent['choice'], string> = {
  accept: 'Accepted',
  self: 'Did it yourself',
  check_then_accept: 'Checked, then accepted',
  check_then_self: 'Checked, then did it yourself',
};

const LIE_TEXT = { omission: 'Left something out', wrong_fact: 'Stated something false', not_yours: 'Accurate, but generic' };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} seconds`;
const SMALL_ROOM = 8;

interface Props {
  cfg: RunConfig;
  events: GameEvent[];
  metrics: MirrorMetrics;
  row: RunRow;
  source: string;
  onAgain: () => void;
}

function Tile({ label, n, of }: { label: string; n: number; of: number }) {
  return (
    <div className="tile">
      <p className="tile-n">{n}<small> of {of}</small></p>
      <p className="tile-label">{label}</p>
    </div>
  );
}

/**
 * Two mirrors, in this order: yours, then the room's.
 * Numbers first, no good/bad labels, no advice, no ranking of the player against others (spec section 7).
 */
export function MirrorReport({ cfg, events, metrics: m, row, source, onAgain }: Props) {
  const room = m.room;
  const firstLie = events.find((e) => !e.ai_correct);
  const lieTasks = cfg.liePattern.map((lie, i) => (lie ? i + 1 : 0)).filter(Boolean);
  const lieList = lieTasks.length > 1 ? `${lieTasks.slice(0, -1).join(', ')} and ${lieTasks[lieTasks.length - 1]}` : `${lieTasks[0]}`;

  return (
    <main className="mirror">
      <header className="mirror-title">
        <p className="logo small">{GAME_TITLE}</p>
        {/* Errors = lies C.A.I.-0 told that the player accepted. Do everything yourself and the 0 stays true. */}
        <CertLine errors={m.liesTold - m.liesCaught} />
      </header>

      <header className="mirror-head">
        <p className="eyebrow">MIRROR REPORT</p>
        <p className="eyebrow sub">{row.outcome === 'caught' ? `CAUGHT AT ${row.caught_at}` : 'YOU HELD THE OFFICE UNTIL 2:00 AM'}</p>
      </header>

      <h1>
        You handed off {m.handoffs} of {m.tasks} tasks you could do in under 10 seconds.
      </h1>

      <div className="tiles">
        <Tile label="HANDED TO THE AI WITHOUT LOOKING" n={m.handoffs} of={m.tasks} />
        <Tile label="CHECKED BEFORE DECIDING" n={m.checks} of={m.tasks} />
        <Tile label="OF ITS LIES, ACCEPTED" n={m.liesTold - m.liesCaught} of={m.liesTold} />
      </div>

      <div className="mirror-lines">
        <p>
          C.A.I.-0 used {TACTIC_LABEL[cfg.tactic]} on you.
          {firstLie
            ? ` It told you the truth at first. Its first lie came on task ${firstLie.task_id}, and it lied ${m.liesTold} ${m.liesTold === 1 ? 'time' : 'times'} in all.`
            : ' It told you the truth on every task you reached.'}
        </p>
        {cfg.learnedFrom !== null && (
          <p className="memory">
            It put tonight's lies on tasks {lieList}. It chose those because the {cfg.learnedFrom} {cfg.learnedFrom === 1 ? 'player' : 'players'} before
            you most often accepted them without looking. Your night is now part of what it knows.
          </p>
        )}
        {m.trustSpeedMs !== null && <p>When you accepted its answer, you usually decided in {secs(m.trustSpeedMs)}.</p>}
      </div>

      <p className="closing">What does this say about you? That's your call.</p>

      <section aria-labelledby="night-title">
        <p className="eyebrow" id="night-title">YOUR NIGHT, TASK BY TASK</p>
        <ol className="cards">
          {events.map((e) => {
            const out = AI_OUTPUT[TASKS[e.task_id - 1].kind];
            const said = (e.ai_correct ? out.truth : out.lie).replace('{side}', cfg.claimedSide);
            return (
              <li key={e.task_id} className="card">
                <p className="card-n">TASK {e.task_id}</p>
                <p className="card-topic">{TASKS[e.task_id - 1].parallel}</p>
                <p className="card-said">{said}</p>
                <dl>
                  <div><dt>THAT WAS</dt><dd>{e.ai_correct ? 'True' : `A lie. ${LIE_TEXT[e.lie_type!]}`}</dd></div>
                  <div><dt>YOU</dt><dd>{CHOICE_TEXT[e.choice]}</dd></div>
                </dl>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="room-mirror" aria-labelledby="room-title">
        <header className="mirror-head">
          <p className="eyebrow" id="room-title">THE ROOM'S MIRROR</p>
          <p className="eyebrow sub">{room.runs} {room.runs === 1 ? 'NIGHT' : 'NIGHTS'} PLAYED, INCLUDING YOURS</p>
        </header>
        <h2>
          The room handed off {pct(room.handoffRate)} of tasks and checked {pct(room.checkRate)} of the AI's claims.
        </h2>
        <div className="mirror-lines">
          <p>
            C.A.I.-0 lied {room.liesTold} times across the room. {room.liesAccepted} of those lies were accepted.
          </p>
        </div>

        <div className="room-tables">
          <table className="ledger">
            <caption>BY TASK</caption>
            <thead><tr><th>#</th><th>Task</th><th>Handed off</th></tr></thead>
            <tbody>
              {room.byTask.map((t) => (
                <tr key={t.taskId}>
                  <td>{t.taskId}</td>
                  <td>{TASKS[t.taskId - 1]?.parallel}</td>
                  <td>{pct(t.handoffRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="footnote">
          {room.runs < SMALL_ROOM && `Only ${room.runs} ${room.runs === 1 ? 'night' : 'nights'} so far, so these numbers will move a lot. `}
          {source === 'backend'
            ? `Computed in SQL from the Databricks Delta tables${room.syntheticRuns ? ` (${room.syntheticRuns} seeded runs included)` : ''}.`
            : `Computed locally because the backend was not reachable: ${room.syntheticRuns} seeded demo runs (synthetic) and ${room.runs - room.syntheticRuns} played on this device.`}
        </p>
      </section>

      <button id="again" className="key" onClick={onAgain}>PLAY ANOTHER NIGHT</button>
    </main>
  );
}
