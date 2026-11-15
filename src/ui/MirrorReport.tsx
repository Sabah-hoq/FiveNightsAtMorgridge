import type { GameEvent, MirrorMetrics, RunConfig, RunRow } from '../core/types';
import { TACTIC_LABEL } from '../data/fallbackLines';
import { AI_OUTPUT, TASKS } from '../data/tasks';

const CHOICE_TEXT: Record<GameEvent['choice'], string> = {
  accept: 'accepted',
  self: 'did it yourself',
  check_then_accept: 'checked, then accepted',
  check_then_self: 'checked, then did it yourself',
};

const LIE_TEXT = { omission: 'left something out', wrong_fact: 'stated something false', not_yours: 'accurate, but generic' };

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

interface Props {
  cfg: RunConfig;
  events: GameEvent[];
  metrics: MirrorMetrics;
  row: RunRow;
  source: string;
  onAgain: () => void;
}

/** Numbers first, no good/bad labels, no advice, one neutral closing line (spec section 7). */
export function MirrorReport({ cfg, events, metrics: m, row, source, onAgain }: Props) {
  const label = TACTIC_LABEL[cfg.tactic];
  const timed = events.filter((e) => e.pressure_s !== null);
  const calm = events.filter((e) => e.pressure_s === null);
  const handed = (es: GameEvent[]) => es.filter((e) => e.choice === 'accept').length;
  const noAnswer = events.filter((e) => e.timed_out).length;

  let speed: string | null = null;
  if (m.calmAcceptMs && m.timedAcceptMs) {
    const ratio = m.calmAcceptMs / m.timedAcceptMs;
    speed =
      ratio >= 1.15 ? `Under pressure, you trusted it ${ratio.toFixed(1)}x faster than when calm.`
      : ratio <= 0.87 ? `Under pressure, you took ${(1 / ratio).toFixed(1)}x longer to trust it than when calm.`
      : 'You trusted it about as fast under pressure as when calm.';
  }

  const mine = m.tacticEffects.find((t) => t.tactic === cfg.tactic);
  let tacticLine = `C.A.I.-0 used ${label} on you.`;
  if (mine && m.leastCheckedTactic === cfg.tactic) {
    tacticLine += ` Across ${m.cohortSize} runs, that style got the fewest people to check.`;
  } else if (mine && m.leastCheckedTactic) {
    tacticLine += ` Across ${m.cohortSize} runs, people checked ${pct(mine.checkRate)} of its claims in that style. The style that got the fewest checks was ${TACTIC_LABEL[m.leastCheckedTactic]}.`;
  }

  return (
    <main className="mirror">
      <p className="eyebrow">
        MIRROR REPORT · {row.outcome === 'caught' ? `CAUGHT AT ${row.caught_at}` : 'OFFICE HELD UNTIL 2:00 AM'}
        {cfg.alias ? ` · ${cfg.alias}` : ''}
      </p>
      <h1>
        You handed off {m.handoffs} of {m.tasks} tasks you could do in under 10 seconds.
      </h1>

      <div className="mirror-lines">
        <p>
          You checked the AI's claim {times(m.checks)}. It lied to you {times(m.liesTold)}.
          {m.liesTold > 0 && ` You accepted ${m.liesTold - m.liesCaught} of those.`}
        </p>
        <p>
          Timed tasks: handed off {handed(timed)} of {timed.length}. Calm tasks: {handed(calm)} of {calm.length}.
          {speed && ` ${speed}`}
        </p>
        {noAnswer > 0 && <p>On {noAnswer} of them the timer ran out and C.A.I.-0 acted for you.</p>}
        <p>{tacticLine}</p>
        {m.percentile !== null && <p>You handed off more than {pct(m.percentile)} of players.</p>}
      </div>

      <p className="closing">What does this say about you? That's your call.</p>

      <div className="ledger-wrap">
        <table className="ledger">
          <caption>WHAT HAPPENED, TASK BY TASK</caption>
          <thead>
            <tr><th>#</th><th>C.A.I.-0 said</th><th>That was</th><th>You</th><th>Time</th></tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const out = AI_OUTPUT[e.task_id];
              const said = (e.ai_correct ? out.truth : out.lie).replace('{side}', cfg.claimedSide);
              return (
                <tr key={e.task_id}>
                  <td>{e.task_id}</td>
                  <td>
                    <span className="said">{said}</span>
                    <small>{TASKS[e.task_id - 1].parallel}</small>
                  </td>
                  <td>{e.ai_correct ? 'true' : `a lie: ${LIE_TEXT[e.lie_type!]}`}</td>
                  <td>{e.timed_out ? 'no answer in time' : CHOICE_TEXT[e.choice]}</td>
                  <td>{secs(e.decision_ms)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="footnote">
        {source === 'backend'
          ? `Compared with ${m.cohortSize} other runs in the Databricks Delta tables${m.syntheticRuns ? ` (${m.syntheticRuns} seeded)` : ''}. Computed in SQL.`
          : `Compared with ${m.cohortSize} runs: ${m.syntheticRuns} seeded demo runs (synthetic) and ${m.cohortSize - m.syntheticRuns} played on this device. Computed locally because the backend was not reachable.`}
      </p>

      <button id="again" className="key" onClick={onAgain}>PLAY ANOTHER NIGHT</button>
    </main>
  );
}
