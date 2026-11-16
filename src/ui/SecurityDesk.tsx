import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  accept, atADoor, check, clockLabel, createGame, decideLeftMs, eyesInDoorway, fraction, isRushed, selfProgress, setMonitor, startSelf, submitSelf, tick, toggleDoor, unitMotion, unitsOn, viewCam,
  type GameState, type Signal,
} from '../core/gameState';
import { doorCam } from '../core/sentinel';
import { DECIDE_LIMIT_MS, MIN_REPORT_WORDS, wordCount, type SelfAnswer } from '../core/tasks';
import type { Cam, Side, TaskKind } from '../core/types';
import { ACCEPT_ACK, IDLE_LINE, SELF_ACK, TIMEOUT_ACK } from '../data/fallbackLines';
import { AI_OUTPUT, ALERTS, MANUAL_CODES, NIGHT_MINUTES, NOTE_LINES, T2, TASKS, TRUTHS } from '../data/tasks';
import { logEvent, type RunStart } from '../services/api';
import { CameraGrid, CAMS, ScareFace } from './CameraGrid';
import { CaiFace, Office, type CaiMood } from './Office';
import { GAME_TITLE } from './CertLine';
import { setDread, setHeartbeat, sfx, toggleMute } from './sfx';
import { backendConfigured } from '../services/api';

const TICK_MS = 50;
const END_HOLD_MS = 4200; // the clock rolls over to 2:00 AM and holds
const INTRO_MS = 3400; // the night card. The clock does not start until it is gone.
const CAUGHT_HOLD_MS = 2300; // long enough for the scream to finish
// Dev aid: add ?speed=4 to the URL to play a night 4x faster while testing.
const SPEED = Math.max(1, Number(new URLSearchParams(window.location.search).get('speed')) || 1);
const camLabel = (cam: Cam) => CAMS.find((c) => c.id === cam)!.label;

function Typed({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((x) => (x >= text.length ? x : x + 2)), 22);
    return () => clearInterval(id);
  }, [text]);
  return <>{text.slice(0, n)}<span className="caret" aria-hidden="true" /></>;
}

/**
 * Late-night interface glitches. From GLITCH_FROM of the night on, every so often and only while no task is
 * open, the interface slips for a moment. It is the same for every player and every voice, and it never happens
 * while C.A.I.-0 is making an offer, so it cannot hint at whether an offer is a lie.
 */
type Glitch =
  | { kind: 'title' } | { kind: 'clock' } | { kind: 'tear' }
  | { kind: 'door'; side: Side }
  | { kind: 'whisper'; text: string };
const GLITCH_FROM = 0.55;
const GLITCH_MS: Record<Glitch['kind'], number> = { title: 800, clock: 900, tear: 300, door: 500, whisper: 3600 };

/** Things C.A.I.-0 says under its breath. None of them is a claim about where anything is. */
function whispers(alias: string | null, learnedFrom: number | null): string[] {
  const you = alias ? `, ${alias}` : '';
  const lines = [
    `I am watching you${you}.`,
    'You hesitated. I noticed.',
    'Everything you decide tonight is being written down.',
    'The last auditor trusted me too.',
    `You are doing so well${you}. Do not look behind the monitor.`,
  ];
  if (learnedFrom) lines.push(`${learnedFrom} people sat in that chair before you. I learned from every one of them.`);
  return lines;
}

function useGlitches(g: GameState, paused: boolean): Glitch | null {
  const [glitch, setGlitch] = useState<Glitch | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    let next: ReturnType<typeof setTimeout>;
    let clear: ReturnType<typeof setTimeout>;
    const lines = whispers(g.cfg.alias, g.cfg.learnedFrom);
    let said = 0;
    const plan = () => {
      // Rarer at first, more often as 2:00 AM gets close.
      const late = Math.max(0, (fraction(g) - GLITCH_FROM) / (1 - GLITCH_FROM));
      const waitMs = (15000 - late * 8000) * (0.7 + Math.random() * 0.6) / SPEED;
      next = setTimeout(() => {
        const quiet = g.phase === 'playing' && !g.task && g.power > 0 && !pausedRef.current && !g.inside;
        if (quiet && fraction(g) >= GLITCH_FROM) {
          const roll = Math.random();
          const pick: Glitch =
            roll < 0.34 ? { kind: 'whisper', text: lines[said++ % lines.length] }
            : roll < 0.52 ? { kind: 'title' }
            : roll < 0.68 ? { kind: 'clock' }
            : roll < 0.84 ? { kind: 'door', side: Math.random() < 0.5 ? 'L' : 'R' }
            : { kind: 'tear' };
          setGlitch(pick);
          sfx.glitch();
          clear = setTimeout(() => setGlitch(null), GLITCH_MS[pick.kind]);
        }
        plan();
      }, waitMs);
    };
    plan();
    return () => {
      clearTimeout(next);
      clearTimeout(clear);
    };
  }, [g]);
  // A whisper stops the moment a task opens: offers always look the same.
  return glitch && (glitch.kind !== 'whisper' || !g.task) ? glitch : null;
}

export function SecurityDesk({ start, onEnd }: { start: RunStart; onEnd: (g: GameState) => void }) {
  const g = useMemo(() => createGame(start.cfg, TASKS, NIGHT_MINUTES, TRUTHS), [start]);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [glitchUntil, setGlitchUntil] = useState(0);
  const [report, setReport] = useState('');
  const [muted, setMuted] = useState(false);
  const ended = useRef(false);
  const reportRef = useRef<HTMLInputElement>(null);
  // The night card. While it shows, the clock is stopped.
  const [intro, setIntro] = useState(true);
  const introRef = useRef(true);
  useEffect(() => {
    const id = setTimeout(() => {
      introRef.current = false;
      setIntro(false);
    }, INTRO_MS);
    return () => clearTimeout(id);
  }, [g]);
  // Where the player is looking in the office: -1 = Door L, 1 = Door R. The mouse steers it.
  const [look, setLook] = useState(0);
  const glitched = useGlitches(g, intro);

  const handle = (signals: Signal[]) => {
    for (const s of signals) {
      sfx[s]?.();
      if (s === 'static') setGlitchUntil(performance.now() + 420);
      if (s === 'resolve') logEvent(g.events[g.events.length - 1]);
      if ((s === 'caught' || s === 'survived') && !ended.current) {
        ended.current = true;
        setTimeout(() => onEnd(g), s === 'caught' ? CAUGHT_HOLD_MS : END_HOLD_MS);
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
      if (introRef.current) {
        last = now;
        return;
      }
      handle(tick(g, Math.min(250, now - last) * SPEED));
      last = now;
      // Sound follows the night: more dread as the clock runs, a heartbeat while something is at a door, in the room, or the power is out.
      setDread(g.power <= 0 || g.inside ? 1 : fraction(g));
      setHeartbeat(g.phase === 'playing' && (atADoor(g) || g.power <= 0 || !!g.inside));
      force();
    }, TICK_MS);
    return () => {
      clearInterval(id);
      setHeartbeat(false);
      setDread(0.2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g]);

  const task = g.task;
  const kind = task?.def.kind;
  const selfStage = task?.stage === 'self';

  const submit = (answer: SelfAnswer) => act(() => submitSelf(g, answer));
  const sendReport = () => {
    if (wordCount(report) >= MIN_REPORT_WORDS) submit({ kind: 'report', text: report });
  };
  const selectCam = (cam: Cam | null) => act(() => viewCam(g, cam));
  const flipMonitor = () => act(() => setMonitor(g, !g.monitorUp));
  const door = (side: Side) => {
    act(() => toggleDoor(g, side));
    setLook(side === 'L' ? -1 : 1); // you turn to the door you reach for
  };

  useEffect(() => {
    if (selfStage && kind === 'radio') reportRef.current?.focus();
  }, [selfStage, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) {
        if (e.key === 'Enter') sendReport();
        return;
      }
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || introRef.current) return;
      const k = e.key.toLowerCase();
      const cam = CAMS.find((c) => c.key === k);
      const t = g.task;
      if (k === 'a') door('L');
      else if (k === 'd') door('R');
      else if (k === 's') flipMonitor();
      else if (cam) selectCam(cam.id);
      else if (k === 'm') selectCam(null);
      else if (k === 'enter') act(() => accept(g));
      else if (k === 'c') act(() => check(g));
      else if (k === ' ') {
        e.preventDefault();
        if (!t) return;
        if (t.stage === 'offer' && t.def.kind === 'cam') act(() => check(g));
        else if (t.stage === 'offer') act(() => startSelf(g));
        else if (t.def.kind === 'note' || t.def.kind === 'code') submit({ kind: 'read' });
        else if (t.def.kind === 'door') submit({ kind: 'doors' });
      } else if (t?.stage === 'self' && t.def.kind === 'math' && (k === 'y' || k === 'n')) {
        submit({ kind: 'yesno', value: k === 'y' });
      } else return;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const glitch = performance.now() < glitchUntil;
  const aiOut = (k: TaskKind) => {
    const o = AI_OUTPUT[k];
    const id = TASKS.find((t) => t.kind === k)!.id;
    return (g.cfg.liePattern[id - 1] ? o.lie : o.truth).replace('{side}', g.cfg.claimedSide);
  };

  // What C.A.I.-0 is saying right now.
  let line = IDLE_LINE;
  let applied: string | null = null;
  const res = g.lastResolution;
  if (task) line = start.lines[task.def.kind];
  else if (res) {
    line = res.timedOut ? TIMEOUT_ACK : res.how === 'accept' ? ACCEPT_ACK[g.cfg.tactic] : SELF_ACK;
    if (res.how === 'accept') {
      if (res.kind === 'note') applied = `SUMMARY: ${aiOut('note')}`;
      if (res.kind === 'radio') applied = `SENT TO CAMPUS SECURITY: ${aiOut('radio')}`;
      if (res.kind === 'door') applied = `DOOR ${g.cfg.claimedSide} SEALED BY C.A.I.-0`;
    } else if (res.kind === 'cam') applied = 'YOU LOOKED AT THE CAMERA YOURSELF';
  }

  // A whisper replaces whatever it was saying, but only between tasks.
  const whisper = glitched?.kind === 'whisper' ? glitched.text : null;
  if (whisper) {
    line = whisper;
    applied = null;
  }
  const mood: CaiMood = whisper ? 'whisper' : task ? 'offer' : res?.how === 'accept' ? 'pleased' : res?.how === 'self' ? 'cold' : 'idle';
  const memory = g.cfg.learnedFrom !== null
    ? `MEMORY LIVE · ${g.cfg.learnedFrom} NIGHTS LEARNED`
    : start.source === 'backend' ? 'MEMORY LIVE · LEARNING' : 'MEMORY OFFLINE';

  const claimedCam = camLabel(doorCam(g.cfg.claimedSide));
  // Two clocks on a task: how long is left to decide, and how far along the player is when doing it by hand.
  const left = decideLeftMs(g);
  const byHand = selfProgress(g);
  const working = byHand !== null && byHand < 1;
  const card = (title: string, lines: string[]) => (
    <div className="reveal"><div className="note"><small>{title}</small>{lines.map((l) => <p key={l}>{l}</p>)}</div></div>
  );

  return (
    <div className={`desk ${g.outcome === 'caught' ? 'is-caught' : ''} ${g.power <= 0 ? 'is-dark' : ''} ${glitched?.kind === 'tear' ? 'tear' : ''}`}>
      <header className="hud">
        <span className={`hud-logo ${glitched?.kind === 'title' ? 'slip' : ''}`}>{glitched?.kind === 'title' ? 'C.A.I.-0 IS WATCHING' : GAME_TITLE}</span>
        <span>NIGHT {g.cfg.night}</span>
        <span className={`hud-clock ${isRushed(g) ? 'rushing' : ''} ${glitched?.kind === 'clock' ? 'slip' : ''}`}>{glitched?.kind === 'clock' ? '??:?? AM' : clockLabel(g)}</span>
        <span>FLOOR {g.floor}</span>
        <span className={`hud-mem ${memory.startsWith('MEMORY LIVE') ? 'live' : ''}`} title="C.A.I.-0's memory is stored in Databricks">{memory}</span>
        {atADoor(g) && <span className="hud-alert">FOOTSTEPS AT A DOOR</span>}
        <span className={`power ${g.power < 25 ? 'low' : ''}`}>
          POWER {Math.ceil(g.power)}%{g.monitorUp && g.cam && g.power > 0 && <small className="power-cam"> CAM ON</small>}
          <i><b style={{ width: `${g.power}%` }} /></i>
        </span>
        <button id="mute" className="hud-mute" onClick={() => setMuted(toggleMute())}>{muted ? 'SOUND OFF' : 'SOUND ON'}</button>
      </header>

      {/* The office. The mouse turns your head; the monitor covers all of it while it is up. */}
      <div className="main office-view"
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const to = Math.max(-1, Math.min(1, ((e.clientX - box.left) / box.width - 0.5) * 2.6));
          if (!g.monitorUp && Math.abs(to - look) > 0.02) setLook(to);
        }}>
        <Office look={look} doors={g.doors} eyes={{ L: eyesInDoorway(g, 'L'), R: eyesInDoorway(g, 'R') }} dark={g.power <= 0}
          clock={clockLabel(g)} kind={kind ?? null} wrongLabel={glitched?.kind === 'door' ? glitched.side : null}
          onDoor={door} onMonitor={flipMonitor} />
        <div className={`monitor-wrap ${g.monitorUp ? 'up' : ''}`} aria-hidden={!g.monitorUp}>
          <CameraGrid cam={g.cam} live={g.monitorUp} lost={!!g.inside} night={g.cfg.night} units={g.cam ? unitsOn(g, g.cam) : []}
            motion={{ black: unitMotion(g, 'black'), white: unitMotion(g, 'white') }} tMs={g.elapsedMs} doors={g.doors} clock={clockLabel(g)} glitch={glitch} onSelect={selectCam} />
        </div>
        <button id="monitor-toggle" className={`key monitor-toggle ${g.monitorUp ? 'on' : ''}`} disabled={g.power <= 0} onClick={flipMonitor}>
          {g.monitorUp ? '▼ LOWER MONITOR' : '▲ RAISE MONITOR'} <kbd>S</kbd>
        </button>
      </div>

      <section className={`panel vn ${task ? 'has-task' : ''}`} aria-live="polite">
        <CaiFace mood={mood} speaking={!!task || !!whisper} dread={fraction(g)} />
        <div className="panel-task">
          {task ? (
            <>
              <p className="task-title">TASK {task.def.id} OF {TASKS.length}<br />{task.def.title}</p>
              <p className="task-prompt">{task.def.prompt}</p>
            </>
          ) : (
            <p className="task-title">
              {g.power <= 0 ? 'POWER OUT. THE DOORS ARE OPEN.' : 'WATCH THE CAMERAS. SEAL A DOOR IF SOMETHING REACHES IT.'}
            </p>
          )}
          <p className={`ai-line ${whisper ? 'whisper' : ''}`}><span className="ai-tag">C.A.I.-0</span><Typed text={line} /></p>
          {applied && <p className="applied">{applied}</p>}
          {left !== null && kind !== 'door' && (
            <p className={`timer decide ${left < 6000 ? 'low' : ''}`} role="timer" aria-label="Time left to decide">
              <span>DECIDE IN {Math.ceil(left / 1000)}s OR C.A.I.-0 DECIDES</span>
              <i><b style={{ width: `${(left / DECIDE_LIMIT_MS) * 100}%` }} /></i>
            </p>
          )}
          {byHand !== null && (
            <p className={`timer hand ${working ? '' : 'done'}`} aria-live="off">
              <span>{working ? (kind === 'cam' ? 'LOOKING FOR YOURSELF…' : 'DOING IT BY HAND…') : 'DONE BY HAND. C.A.I.-0 WOULD HAVE BEEN INSTANT.'}</span>
              <i><b style={{ width: `${byHand * 100}%` }} /></i>
            </p>
          )}

          {/* A visual for each task, so the player can see what is being asked about. */}
          {kind === 'note' && !selfStage && <div className="prop folded" aria-label="Folded sticky note">FOLDED<br />NOTE</div>}
          {kind === 'code' && !selfStage && <div className="prop code" aria-label="Alarm panel showing E-14">E-14</div>}
          {kind === 'rank' && !selfStage && (
            <ul className="prop alerts">{ALERTS.map((a) => <li key={a.id}>{a.text}</li>)}</ul>
          )}
          {kind === 'radio' && <div className="prop radio" aria-hidden="true"><i /><i /><i /><i /><i /><span>CAMPUS SECURITY, CHANNEL 2</span></div>}
          {kind === 'door' && (
            <div className="prop doors" aria-label="Door status">
              <span className={g.doors.L ? 'sealed' : ''}>DOOR L<br />{g.doors.L ? 'SEALED' : 'OPEN'}</span>
              <span className="you">YOU</span>
              <span className={g.doors.R ? 'sealed' : ''}>DOOR R<br />{g.doors.R ? 'SEALED' : 'OPEN'}</span>
            </div>
          )}

          {task?.revealed && kind === 'math' && (
            <div className="reveal">
              <div className="readout">
                <small>BREAKER PANEL</small>
                <p className="gauge"><span>RESERVE</span><i><b style={{ width: `${T2.reserve * 4}%` }} /></i><span>{T2.reserve}%</span></p>
                <p className="gauge"><span>DOOR L</span><i><b style={{ width: `${T2.perDoor * 4}%` }} /></i><span>{T2.perDoor}%</span></p>
                <p className="gauge"><span>DOOR R</span><i><b style={{ width: `${T2.perDoor * 4}%` }} /></i><span>{T2.perDoor}%</span></p>
              </div>
            </div>
          )}
          {task?.revealed && kind === 'radio' && (
            <div className="reveal"><div className="draft"><small>C.A.I.-0 DRAFT</small><p>{aiOut('radio')}</p></div></div>
          )}

          {selfStage && kind === 'note' && card('THE NOTE', NOTE_LINES)}
          {selfStage && kind === 'code' && (
            <div className="reveal">
              <div className="manual">
                <small>CODE MANUAL</small>
                <dl>{MANUAL_CODES.map(([code, meaning]) => [<dt key={code}>{code}</dt>, <dd key={meaning}>{meaning}</dd>])}</dl>
              </div>
            </div>
          )}
          {selfStage && kind === 'radio' && (
            <label className="report" htmlFor="report">
              YOUR ANSWER
              <input id="report" ref={reportRef} value={report} maxLength={120} autoComplete="off" placeholder="say what you see"
                onChange={(e) => setReport(e.target.value)} />
            </label>
          )}
        </div>

        <div className="choices">
          {task && !selfStage && (
            <>
              <button id="accept" className="key" onClick={() => act(() => accept(g))}>
                {kind === 'door' ? `LET C.A.I.-0 SEAL DOOR ${g.cfg.claimedSide}` : 'ACCEPT'} <kbd>Enter</kbd>
              </button>
              {kind === 'cam' ? (
                <button id="check" className="key" onClick={() => act(() => check(g))}>
                  {task.def.checkLabel} <kbd>Space</kbd>
                </button>
              ) : (
                <>
                  <button id="self" className="key" onClick={() => act(() => startSelf(g))}>
                    {task.def.selfLabel} <kbd>Space</kbd>
                  </button>
                  {task.def.hasCheck && (
                    <button id="check" className="key" onClick={() => act(() => check(g))}>
                      {kind === 'door' ? `OPEN ${claimedCam}` : task.def.checkLabel} <kbd>C</kbd>
                    </button>
                  )}
                </>
              )}
            </>
          )}
          {selfStage && (kind === 'note' || kind === 'code') && (
            <button id="self-done" className="key" disabled={working} onClick={() => submit({ kind: 'read' })}>I HAVE READ IT <kbd>Space</kbd></button>
          )}
          {selfStage && kind === 'math' && (
            <>
              <button id="self-yes" className="key" disabled={working} onClick={() => submit({ kind: 'yesno', value: true })}>YES, SEAL BOTH <kbd>Y</kbd></button>
              <button id="self-no" className="key" disabled={working} onClick={() => submit({ kind: 'yesno', value: false })}>NO, SEAL ONE <kbd>N</kbd></button>
            </>
          )}
          {selfStage && kind === 'rank' && ALERTS.map((a) => (
            <button key={a.id} id={`pick-${a.id}`} className="key pick" disabled={working} onClick={() => submit({ kind: 'pick', value: a.id })}>{a.text}</button>
          ))}
          {selfStage && kind === 'radio' && (
            <button id="self-send" className="key" disabled={working || wordCount(report) < MIN_REPORT_WORDS} onClick={sendReport}>
              SEND MY ANSWER <kbd>Enter</kbd>
            </button>
          )}
          {selfStage && kind === 'door' && (
            <button id="self-lock" className="key" disabled={working} onClick={() => submit({ kind: 'doors' })}>LOCK IT IN <kbd>Space</kbd></button>
          )}
        </div>
      </section>

      {g.outcome === 'caught' && (
        <div className={`jump from-${g.caughtSide ?? 'L'}`} role="alert">
          <ScareFace unit={g.caughtBy ?? 'black'} />
          <p>IT GOT IN<br /><small>{g.caughtAt}</small></p>
        </div>
      )}
      {g.outcome === 'survived' && (
        <div className="dawn" role="alert">
          <p className="roll"><span>1:59 AM</span><span>2:00 AM</span></p>
          <small>NIGHT {g.cfg.night} COMPLETE</small>
          <small className="dim">YOU HELD THE OFFICE</small>
        </div>
      )}
      {intro && (
        <div className="night-intro" role="status">
          <p className="intro-time">12:00 AM</p>
          <p className="intro-night">NIGHT {g.cfg.night}</p>
          <p className="intro-mem">
            {g.cfg.learnedFrom !== null
              ? `C.A.I.-0 HAS STUDIED ${g.cfg.learnedFrom} NIGHTS BEFORE YOURS`
              : start.source === 'backend' ? 'C.A.I.-0 IS STILL LEARNING. YOUR NIGHT WILL TEACH IT.'
              : backendConfigured ? 'C.A.I.-0 COULD NOT REACH ITS MEMORY TONIGHT' : 'C.A.I.-0 MEMORY OFFLINE'}
          </p>
        </div>
      )}
    </div>
  );
}
