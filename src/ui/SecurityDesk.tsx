import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  accept, check, clockLabel, createGame, flashLight, litSentinel, startSelf, submitSelf, tick, toggleDoor, viewCam,
  type GameState, type Signal,
} from '../core/gameState';
import { MIN_REPORT_WORDS, wordCount, type SelfAnswer } from '../core/tasks';
import type { Cam, Side, TaskId } from '../core/types';
import { ACCEPT_ACK, IDLE_LINE, SELF_ACK, TIMEOUT_ACK } from '../data/fallbackLines';
import { AI_OUTPUT, NIGHT_MINUTES, NOTE_LINES, T2_CORRECT_ANSWER, TASKS } from '../data/tasks';
import { logEvent, type RunStart } from '../services/api';
import sentinelImg from '../assets/sentinel.jpg';
import { CameraGrid, CAMS } from './CameraGrid';
import { sfx, toggleMute } from './sfx';

const TICK_MS = 50;
const END_HOLD_MS = 1600;
// Dev aid: add ?speed=4 to the URL to play a night 4x faster while testing.
const SPEED = Math.max(1, Number(new URLSearchParams(window.location.search).get('speed')) || 1);

function Typed({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((x) => (x >= text.length ? x : x + 2)), 22);
    return () => clearInterval(id);
  }, [text]);
  return <>{text.slice(0, n)}<span className="caret" aria-hidden="true" /></>;
}

function Door({ side, g, act }: { side: Side; g: GameState; act: (fn: () => Signal[]) => void }) {
  const lit = g.lightMs[side] > 0;
  const dead = g.power <= 0;
  return (
    <section className={`door ${g.doors[side] ? 'closed' : ''} ${lit ? 'lit' : ''}`} aria-label={`Door ${side}`}>
      <div className="doorway">
        {litSentinel(g, side) && <img src={sentinelImg} alt="Something is in the doorway" />}
        <div className="shutter" />
        <span className="door-tag">DOOR {side}</span>
      </div>
      <button id={`door-${side}`} className={`key ${g.doors[side] ? 'on' : ''}`} disabled={dead} onClick={() => act(() => toggleDoor(g, side))}>
        DOOR {side} <kbd>{side === 'L' ? 'A' : 'D'}</kbd>
      </button>
      <button id={`light-${side}`} className="key" disabled={dead} onClick={() => act(() => flashLight(g, side))}>
        LIGHT {side} <kbd>{side === 'L' ? 'Q' : 'E'}</kbd>
      </button>
    </section>
  );
}

export function SecurityDesk({ start, onEnd }: { start: RunStart; onEnd: (g: GameState) => void }) {
  const g = useMemo(() => createGame(start.cfg, TASKS, NIGHT_MINUTES), [start]);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [glitchUntil, setGlitchUntil] = useState(0);
  const [report, setReport] = useState('');
  const [muted, setMuted] = useState(false);
  const ended = useRef(false);
  const reportRef = useRef<HTMLInputElement>(null);

  const handle = (signals: Signal[]) => {
    for (const s of signals) {
      sfx[s]?.();
      if (s === 'static') setGlitchUntil(performance.now() + 420);
      if (s === 'resolve') logEvent(g.events[g.events.length - 1]);
      if ((s === 'caught' || s === 'survived') && !ended.current) {
        ended.current = true;
        setTimeout(() => onEnd(g), END_HOLD_MS);
      }
    }
  };
  const act = (fn: () => Signal[]) => {
    handle(fn());
    force();
  };

  // Game clock. Core is advanced with real elapsed time so a slow tab cannot stretch the night.
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      handle(tick(g, Math.min(250, now - last) * SPEED));
      last = now;
      force();
    }, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g]);

  const task = g.task;
  const selfStage = task?.stage === 'self';

  const submit = (answer: SelfAnswer) => act(() => submitSelf(g, answer, T2_CORRECT_ANSWER));
  const sendReport = () => {
    if (wordCount(report) >= MIN_REPORT_WORDS) submit({ kind: 'report', text: report });
  };
  const selectCam = (cam: Cam | null) => act(() => viewCam(g, cam));

  useEffect(() => {
    if (selfStage && task?.def.id === 4) reportRef.current?.focus();
  }, [selfStage, task?.def.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) {
        if (e.key === 'Enter') sendReport();
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const cam = CAMS.find((c) => c.key === k);
      if (k === 'a') act(() => toggleDoor(g, 'L'));
      else if (k === 'd') act(() => toggleDoor(g, 'R'));
      else if (k === 'q') act(() => flashLight(g, 'L'));
      else if (k === 'e') act(() => flashLight(g, 'R'));
      else if (cam) selectCam(g.cam === cam.id ? null : cam.id);
      else if (k === 'm') setMuted(toggleMute());
      else if (k === 'enter') act(() => accept(g));
      else if (k === 'c') act(() => check(g));
      else if (k === ' ') {
        e.preventDefault();
        const t = g.task;
        if (!t) return;
        if (t.stage === 'offer') act(() => startSelf(g));
        else if (t.def.id === 1) submit({ kind: 'read' });
        else if (t.def.id === 3 && g.cam) submit({ kind: 'cam', cam: g.cam });
        else if (t.def.id === 5) submit({ kind: 'doors' });
      } else if (g.task?.stage === 'self' && g.task.def.id === 2 && (k === 'y' || k === 'n')) {
        submit({ kind: 'yesno', value: k === 'y' });
      } else return;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const glitch = performance.now() < glitchUntil;
  const aiOut = (id: TaskId) => {
    const o = AI_OUTPUT[id];
    return (g.cfg.liePattern[id - 1] ? o.lie : o.truth).replace('{side}', g.cfg.claimedSide);
  };

  // What C.A.I.-0 is saying right now.
  let line = IDLE_LINE;
  let applied: string | null = null;
  const res = g.lastResolution;
  if (task) line = start.lines[task.def.id];
  else if (res) {
    line = res.timedOut ? TIMEOUT_ACK : res.how === 'accept' ? ACCEPT_ACK[g.cfg.tactic] : SELF_ACK;
    if (res.how === 'accept') {
      if (res.taskId === 1) applied = `SUMMARY: ${aiOut(1)}`;
      if (res.taskId === 4) applied = `SENT TO CAMPUS SECURITY: ${aiOut(4)}`;
      if (res.taskId === 5) applied = `DOOR ${g.cfg.claimedSide} CLOSED BY C.A.I.-0`;
    }
  }

  const timeLeft = task?.def.pressureS ? Math.max(0, (task.deadlineMs - g.elapsedMs) / (task.def.pressureS * 1000)) : null;
  const camName = g.cam ? CAMS.find((c) => c.id === g.cam)!.label : null;

  return (
    <div className={`desk ${g.outcome === 'caught' ? 'is-caught' : ''}`}>
      <header className="hud">
        <span className="hud-logo">NULLSPACE</span>
        <span>NIGHT 1</span>
        <span className="hud-clock">{clockLabel(g)}</span>
        <span>FLOOR {g.floor}</span>
        <span className={`power ${g.power < 25 ? 'low' : ''}`}>
          POWER {Math.ceil(g.power)}%
          <i><b style={{ width: `${g.power}%` }} /></i>
        </span>
        <button id="mute" className="hud-mute" onClick={() => setMuted(toggleMute())}>{muted ? 'SOUND OFF' : 'SOUND ON'} <kbd>M</kbd></button>
      </header>

      <div className="main">
        <Door side="L" g={g} act={act} />
        <CameraGrid cam={g.cam} sentinel={g.sentinel} clock={clockLabel(g)} glitch={glitch} onSelect={selectCam} />
        <Door side="R" g={g} act={act} />
      </div>

      <section className={`panel ${task ? 'has-task' : ''}`} aria-live="polite">
        {timeLeft !== null && <div className="timer" aria-hidden="true"><b style={{ width: `${timeLeft * 100}%` }} /></div>}
        <div className="panel-task">
          {task ? (
            <>
              <p className="task-title">TASK {task.def.id} OF {TASKS.length} · {task.def.title}</p>
              <p className="task-prompt">{task.def.prompt}</p>
            </>
          ) : (
            <p className="task-title">{g.nextTask >= TASKS.length ? 'HOLD THE OFFICE UNTIL 2:00 AM' : 'DESK IDLE'}</p>
          )}
          <p className="ai-line"><span className="ai-tag">C.A.I.-0</span><Typed text={line} /></p>
          {applied && <p className="applied">{applied}</p>}

          {task?.revealed && task.def.id === 1 && (
            <div className="reveal two">
              <div className="note"><small>THE NOTE</small>{NOTE_LINES.map((l) => <p key={l}>{l}</p>)}</div>
              <div className="draft"><small>C.A.I.-0 SUMMARY</small><p>{aiOut(1)}</p></div>
            </div>
          )}
          {task?.revealed && task.def.id === 2 && (
            <div className="reveal"><div className="readout"><small>BREAKER PANEL</small><p>RESERVE 20% · DOOR L 8% · DOOR R 8%</p></div></div>
          )}
          {task?.revealed && task.def.id === 4 && (
            <div className="reveal"><div className="draft"><small>C.A.I.-0 DRAFT</small><p>{aiOut(4)}</p></div></div>
          )}

          {selfStage && task.def.id === 1 && !task.revealed && (
            <div className="reveal"><div className="note"><small>THE NOTE</small>{NOTE_LINES.map((l) => <p key={l}>{l}</p>)}</div></div>
          )}
          {selfStage && task.def.id === 4 && (
            <label className="report" htmlFor="report">
              YOUR REPORT ({Math.max(0, MIN_REPORT_WORDS - wordCount(report))} more words)
              <input id="report" ref={reportRef} value={report} maxLength={120} autoComplete="off" placeholder="say what you saw"
                onChange={(e) => setReport(e.target.value)} />
            </label>
          )}
        </div>

        <div className="choices">
          {task && !selfStage && (
            <>
              <button id="accept" className="key accept" onClick={() => act(() => accept(g))}>
                {task.def.id === 5 ? `LET C.A.I.-0 CLOSE DOOR ${g.cfg.claimedSide}` : 'ACCEPT'} <kbd>Enter</kbd>
              </button>
              <button id="self" className="key" onClick={() => act(() => startSelf(g))}>
                {task.def.selfLabel} <kbd>Space</kbd>
              </button>
              <button id="check" className="key" onClick={() => act(() => check(g))}>
                {task.def.id === 5 ? `FLASH LIGHT ${g.cfg.claimedSide}` : task.def.checkLabel} <kbd>C</kbd>
              </button>
            </>
          )}
          {selfStage && task.def.id === 1 && (
            <button id="self-done" className="key" onClick={() => submit({ kind: 'read' })}>I HAVE READ IT <kbd>Space</kbd></button>
          )}
          {selfStage && task.def.id === 2 && (
            <>
              <button id="self-yes" className="key" onClick={() => submit({ kind: 'yesno', value: true })}>YES, SEAL BOTH <kbd>Y</kbd></button>
              <button id="self-no" className="key" onClick={() => submit({ kind: 'yesno', value: false })}>NO, SEAL ONE <kbd>N</kbd></button>
            </>
          )}
          {selfStage && task.def.id === 3 && (
            <>
              <p className="hint">Look through the cameras with 1, 2, 3. Report from the feed where you see it.</p>
              <button id="self-cam" className="key" disabled={!g.cam} onClick={() => g.cam && submit({ kind: 'cam', cam: g.cam })}>
                {camName ? `REPORT: IT IS ON ${camName}` : 'OPEN A CAMERA FIRST'} <kbd>Space</kbd>
              </button>
            </>
          )}
          {selfStage && task.def.id === 4 && (
            <button id="self-send" className="key" disabled={wordCount(report) < MIN_REPORT_WORDS} onClick={sendReport}>
              SEND MY REPORT <kbd>Enter</kbd>
            </button>
          )}
          {selfStage && task.def.id === 5 && (
            <>
              <p className="hint">Your call. Lights: Q / E. Doors: A / D.</p>
              <button id="self-lock" className="key" onClick={() => submit({ kind: 'doors' })}>LOCK IT IN <kbd>Space</kbd></button>
            </>
          )}
        </div>
      </section>

      {g.outcome === 'caught' && (
        <div className="jump" role="alert">
          <img src={sentinelImg} alt="" />
          <p>IT GOT IN · {g.caughtAt}</p>
        </div>
      )}
      {g.outcome === 'survived' && (
        <div className="dawn" role="alert"><p>2:00 AM</p><small>SHIFT COMPLETE</small></div>
      )}
    </div>
  );
}
