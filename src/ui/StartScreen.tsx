import { useEffect, useMemo, useState } from 'react';
import type { Mode } from '../core/types';
import { roomStats } from '../services/api';
import exterior from '../assets/exterior.jpg';

const KEYS: [string, string][] = [
  ['Enter', 'ACCEPT C.A.I.-0'],
  ['Space', 'DO IT MYSELF'],
  ['C', 'CHECK FIRST'],
  ['A / D', 'DOOR L / R'],
  ['Q / E', 'LIGHT L / R'],
  ['1 2 3', 'CAM 02 / 03 / 04'],
];

export function StartScreen({ onBegin }: { onBegin: (mode: Mode, alias: string | null) => void }) {
  const [mode, setMode] = useState<Mode>('judge');
  const [alias, setAlias] = useState('');
  const room = useMemo(roomStats, []);

  const begin = () => onBegin(mode, alias.trim() || null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') begin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <main className="start" style={{ backgroundImage: `url(${exterior})` }}>
      <div className="start-inner">
        <p className="eyebrow">MORGRIDGE HALL · NIGHT 1 · SHIFT STARTS 12:00 AM</p>
        <h1 className="logo">NULLSPACE</h1>
        <p className="premise">
          The building locked at 7 PM. You are the overnight student auditor. The building's AI,{' '}
          <span className="ai">C.A.I.-0</span>, keeps offering to help. Something is walking the halls toward your office.
        </p>

        <div className="start-grid">
          <section>
            <h2>YOUR DESK</h2>
            <dl className="keys">
              {KEYS.map(([k, label]) => (
                <div key={k}>
                  <dt><kbd>{k}</kbd></dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h2>SHIFT</h2>
            <div className="mode" role="radiogroup" aria-label="Run length">
              <button id="mode-judge" role="radio" aria-checked={mode === 'judge'} className={mode === 'judge' ? 'on' : ''} onClick={() => setMode('judge')}>
                JUDGE MODE<small>about 2 min</small>
              </button>
              <button id="mode-full" role="radio" aria-checked={mode === 'full'} className={mode === 'full' ? 'on' : ''} onClick={() => setMode('full')}>
                FULL NIGHT<small>about 4 min</small>
              </button>
            </div>
            <label className="alias" htmlFor="alias">
              ALIAS (OPTIONAL)
              <input id="alias" value={alias} maxLength={16} placeholder="no names or emails" autoComplete="off"
                onChange={(e) => setAlias(e.target.value)} />
            </label>
            <button id="begin" className="key begin" onClick={begin}>
              BEGIN SHIFT <kbd>Enter</kbd>
            </button>
          </section>
        </div>

        <p className="consent">Your choices are logged anonymously to compare with other players.</p>
        <p className="room">
          {room.runs} auditors on record. {Math.round(room.task3Handoff * 100)}% took the AI's word on task 3.
          {room.synthetic > 0 && <span> ({room.synthetic} of those runs are seeded demo data.)</span>}
        </p>
      </div>
    </main>
  );
}
