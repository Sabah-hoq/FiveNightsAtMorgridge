import { useCallback, useEffect, useState } from 'react';
import { camViewRows, type GameState } from './core/gameState';
import { lieString } from './core/seed';
import type { GameEvent, MirrorMetrics, Mode, RunConfig, RunRow } from './core/types';
import { endRun, startRun, type RunStart } from './services/api';
import { nextNight, saveProgress } from './services/progress';
import { MirrorReport, type ProgressNote } from './ui/MirrorReport';
import { SecurityDesk } from './ui/SecurityDesk';
import { StartScreen } from './ui/StartScreen';
import { initAudio } from './ui/sfx';

type Screen =
  | { name: 'start' }
  | { name: 'play'; start: RunStart }
  | { name: 'analyzing' }
  | { name: 'mirror'; cfg: RunConfig; events: GameEvent[]; metrics: MirrorMetrics; row: RunRow; source: string; progress: ProgressNote };

const ANALYZING_MIN_MS = 2200;

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'start' });

  // Whether the player asked for their progress to be saved on this device (the option on the start screen).
  const [keep, setKeep] = useState(true);

  const begin = useCallback(async (mode: Mode, alias: string | null, night: number, save: boolean) => {
    initAudio();
    setKeep(save);
    const start = await startRun(mode, alias, night);
    setScreen({ name: 'play', start });
  }, []);

  const finish = useCallback(async (g: GameState) => {
    setScreen({ name: 'analyzing' });
    const row: RunRow = {
      run_id: g.cfg.runId,
      started_at: new Date(g.cfg.startedAt).toISOString(),
      ended_at: new Date().toISOString(),
      mode: g.cfg.mode, tactic: g.cfg.tactic, lie_pattern: lieString(g.cfg.liePattern),
      outcome: g.outcome ?? 'survived', caught_at: g.caughtAt, alias: g.cfg.alias,
    };
    // Save progress: surviving a night unlocks the next one. Getting caught keeps the night you were on.
    const survived = g.outcome === 'survived';
    const next = survived ? nextNight(g.cfg.night) : g.cfg.night;
    const progress: ProgressNote = {
      wanted: keep, night: next, survived,
      saved: keep && saveProgress({ night: next, mode: g.cfg.mode, alias: g.cfg.alias ?? '' }),
    };
    const [end] = await Promise.all([endRun(row, g.events, camViewRows(g)), new Promise((r) => setTimeout(r, ANALYZING_MIN_MS))]);
    setScreen({ name: 'mirror', cfg: g.cfg, events: g.events, metrics: end.metrics, row, source: end.source, progress });
  }, [keep]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.name]);

  return (
    <div className="crt">
      {screen.name === 'start' && <StartScreen onBegin={begin} />}
      {screen.name === 'play' && <SecurityDesk key={screen.start.cfg.runId} start={screen.start} onEnd={finish} />}
      {screen.name === 'analyzing' && (
        <div className="analyzing" role="status">
          <span className="ai-eye" aria-hidden="true" />
          <p>C.A.I.-0 is analyzing you<span className="dots" /></p>
        </div>
      )}
      {screen.name === 'mirror' && (
        <MirrorReport {...screen} onAgain={() => setScreen({ name: 'start' })} />
      )}
    </div>
  );
}
