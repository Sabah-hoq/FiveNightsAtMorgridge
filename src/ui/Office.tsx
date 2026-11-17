import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Side, TaskKind } from '../core/types';

/**
 * The office, drawn. It is wider than the screen: Door L is at the far left, Door R at the far right, the desk
 * in the middle. `look` slides it (-1 = facing Door L, 1 = facing Door R), so watching one door means turning
 * away from the other. Nothing here knows the rules: it draws what it is told.
 */
interface OfficeProps {
  look: number;
  doors: Record<Side, boolean>;
  /** Eyes showing in a doorway, per side. */
  eyes: Record<Side, boolean>;
  /** Power is out: the room is dark and the door buttons are dead. */
  dark: boolean;
  clock: string;
  /** The task on the desk right now, so the room can show it (alarm panel, radio, sticky note). */
  kind: TaskKind | null;
  /** The alarm code flashing on the wall panel, while a code task is open. */
  code: string | null;
  /** A wall button briefly shows the wrong label (late-night interface glitch). */
  wrongLabel: Side | null;
  onDoor: (side: Side) => void;
  onMonitor: () => void;
}

/** How far the scene can slide, as a share of its own width. The scene is 160% of the view, so 37.5% shows either end. */
const SLIDE = 37.5;

function Doorway({ side, sealed, eyes }: { side: Side; sealed: boolean; eyes: boolean }) {
  const x = side === 'L' ? 96 : 1284;
  const cx = x + 110;
  return (
    <g className={`o-door ${sealed ? 'sealed' : ''}`}>
      <rect className="o-frame" x={x} y={66} width={220} height={236} />
      <rect className="o-hall" x={x + 14} y={80} width={192} height={222} />
      {/* The hall beyond: a floor line and a far wall, barely there. */}
      <path className="o-hall-lines" d={`M${x + 14} 302 L${x + 74} 232 H${x + 146} L${x + 206} 302 M${x + 74} 232 V132 H${x + 146} V232`} />
      {eyes && (
        <g className="o-eyes" transform={`translate(${cx - 30} 150)`}>
          <path d="M6 5 L26 11 L26 14 L6 10 Z" />
          <path d="M54 5 L34 11 L34 14 L54 10 Z" />
        </g>
      )}
      <svg x={x + 14} y={80} width={192} height={222} overflow="hidden">
        <g className="o-shutter">
          <rect width={192} height={222} fill="url(#o-slats)" />
          <rect y={200} width={192} height={22} fill="url(#o-hazard)" />
        </g>
      </svg>
      <text className="o-sign" x={cx} y={56} textAnchor="middle">DOOR {side} · {side === 'L' ? 'WEST HALL' : 'EAST HALL'}</text>
    </g>
  );
}

export function Office({ look, doors, eyes, dark, clock, kind, code, wrongLabel, onDoor, onMonitor }: OfficeProps) {
  const shift = ((Math.max(-1, Math.min(1, look)) + 1) / 2) * SLIDE;
  const doorButton = (side: Side): ReactNode => (
    <button id={`door-${side}`} className={`wall-btn ${side} ${doors[side] ? 'on' : ''}`} disabled={dark} onClick={() => onDoor(side)}>
      <i aria-hidden="true" />
      <span>{wrongLabel === side ? 'LET IT IN' : `${doors[side] ? 'OPEN' : 'SEAL'} DOOR ${side}`}</span>
      <kbd>{side === 'L' ? 'A' : 'D'}</kbd>
    </button>
  );
  return (
    <div className={`office-pan ${dark ? 'dark' : ''}`} style={{ transform: `translateX(-${shift}%)` }}>
      <svg className="office-scene" viewBox="0 0 1600 400" preserveAspectRatio="none" aria-label="Your office">
        <defs>
          <linearGradient id="o-wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#101317" /><stop offset="1" stopColor="#20242b" />
          </linearGradient>
          <linearGradient id="o-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0d0f12" /><stop offset="1" stopColor="#040506" />
          </linearGradient>
          <radialGradient id="o-lamp" cx="0.5" cy="0" r="1">
            <stop offset="0" stopColor="#f3ecd2" stopOpacity=".2" /><stop offset="1" stopColor="#f3ecd2" stopOpacity="0" />
          </radialGradient>
          <pattern id="o-slats" width="192" height="16" patternUnits="userSpaceOnUse">
            <rect width="192" height="14" fill="#3a4049" /><rect y="14" width="192" height="2" fill="#23272d" />
          </pattern>
          <pattern id="o-hazard" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="12" height="24" fill="#d9a520" /><rect x="12" width="12" height="24" fill="#111" />
          </pattern>
          <pattern id="o-panel" width="100" height="264" patternUnits="userSpaceOnUse">
            <rect width="100" height="264" fill="none" stroke="#000" strokeOpacity=".35" />
          </pattern>
        </defs>

        {/* Room shell */}
        <rect width="1600" height="38" fill="#050607" />
        <rect y="38" width="1600" height="264" fill="url(#o-wall)" />
        <rect y="38" width="1600" height="264" fill="url(#o-panel)" />
        <rect y="302" width="1600" height="98" fill="url(#o-floor)" />
        <path className="o-floor-lines" d="M0 302H1600 M800 302 L560 400 M800 302 L1040 400 M800 302 L160 400 M800 302 L1440 400 M0 338H1600" />

        {/* Window with blinds: the building across the way, a few lights left on */}
        <rect x="560" y="74" width="480" height="132" fill="#030405" stroke="#262a30" strokeWidth="4" />
        <path className="o-city" d="M590 206V150h70v56 M690 206V126h96v80 M820 206V160h60v46 M910 206V112h100v94" />
        <g className="o-lit">
          <rect x="604" y="162" width="10" height="8" /><rect x="712" y="140" width="10" height="8" /><rect x="752" y="170" width="10" height="8" />
          <rect x="930" y="128" width="10" height="8" /><rect x="972" y="158" width="10" height="8" /><rect x="838" y="176" width="10" height="8" />
        </g>
        <path className="o-blinds" d="M560 88H1040 M560 102H1040 M560 116H1040 M560 130H1040 M560 144H1040 M560 158H1040 M560 172H1040 M560 186H1040" />

        {/* C.A.I.-0's own camera, above the window. It never looks away. */}
        <path className="o-mount" d="M786 38h28v10h-28z" />
        <circle className="o-dome" cx="800" cy="56" r="11" />
        <circle className="o-led" cx="800" cy="57" r="3.2" />

        {/* Wall clock and alarm panel */}
        <rect className="o-box" x="1094" y="96" width="112" height="40" rx="3" />
        <text className="o-clock" x="1150" y="124" textAnchor="middle">{clock}</text>
        <rect className="o-box" x="408" y="100" width="92" height="52" rx="3" />
        <text className={`o-alarm ${kind === 'code' ? 'live' : ''}`} x="454" y="134" textAnchor="middle">{kind === 'code' && code ? code : '----'}</text>
        <text className="o-sign" x="454" y="92" textAnchor="middle">ALARM</text>

        <Doorway side="L" sealed={doors.L} eyes={eyes.L} />
        <Doorway side="R" sealed={doors.R} eyes={eyes.R} />

        {/* Ceiling lamp and its cone of light */}
        <path d="M800 0V30" stroke="#22262b" strokeWidth="3" />
        <path d="M776 30h48l10 12h-68z" fill="#1c1f24" />
        <path className="o-cone" d="M772 42h56L1100 302H500z" fill="url(#o-lamp)" />

        {/* Desk, old monitor, and what is on it */}
        <path d="M470 302H1130L1196 336H404z" fill="#14171b" />
        <path d="M404 336H1196V400H404z" fill="#0a0c0e" />
        <path d="M404 336H1196" stroke="#2a2f36" strokeWidth="2" />
        <rect x="786" y="296" width="28" height="12" fill="#101215" />
        <rect x="694" y="212" width="212" height="88" rx="6" fill="#0d0f12" stroke="#2a2f36" strokeWidth="2" />
        <rect className="o-crt" x="706" y="222" width="188" height="66" rx="3" />
        <path className="o-crt-map" d="M770 236h44l14 12v22h-72v-22z M784 270v-10h20v10" />
        <rect className={`o-note ${kind === 'note' ? 'live' : ''}`} x="880" y="204" width="34" height="30" transform="rotate(7 897 219)" />
        {/* Desk fan */}
        <path d="M560 300v-18" stroke="#2a2f36" strokeWidth="5" />
        <ellipse cx="560" cy="302" rx="24" ry="5" fill="#101215" />
        <circle cx="560" cy="258" r="27" fill="#07080a" stroke="#2a2f36" strokeWidth="2" />
        <g className="o-fan"><path d="M560 258c-4-22 14-24 8-2 20-10 26 8 4 8 12 20-6 26-10 6-16 14-26-2-2-12z" fill="#2a2f36" /></g>
        {/* Radio */}
        <rect x="1010" y="270" width="78" height="32" rx="3" fill="#0d0f12" stroke="#2a2f36" strokeWidth="2" />
        <path d="M1072 270l14-34" stroke="#2a2f36" strokeWidth="2" />
        <circle className={`o-radio ${kind === 'radio' ? 'live' : ''}`} cx="1026" cy="286" r="4" />
        <path d="M1042 280h34M1042 286h34M1042 292h34" stroke="#22262b" strokeWidth="2" />
        {/* Mug and papers */}
        <path d="M640 302v-18h20v18z M660 288h6v8h-6" fill="none" stroke="#2a2f36" strokeWidth="2" />
        <path d="M930 318l70-6 6 14-72 6z" fill="#191c21" />

        {/* Power out: the room goes black. Eyes are drawn again on top so they are all that is left. */}
        <rect className="o-blackout" width="1600" height="400" />
        {dark && (['L', 'R'] as Side[]).map((side) => eyes[side] && (
          <g key={side} className="o-eyes dark" transform={`translate(${(side === 'L' ? 96 : 1284) + 80} 150)`}>
            <path d="M6 5 L26 11 L26 14 L6 10 Z" />
            <path d="M54 5 L34 11 L34 14 L54 10 Z" />
          </g>
        ))}
      </svg>

      {doorButton('L')}
      {doorButton('R')}
      <button id="desk-monitor" className="desk-monitor" disabled={dark} onClick={onMonitor} aria-label="Raise the monitor" />
    </div>
  );
}

export type CaiMood = 'idle' | 'offer' | 'pleased' | 'cold' | 'whisper';

/**
 * C.A.I.-0's face: one lens. The pupil follows the pointer, so it is always looking at what the player is about
 * to do. The mood only reflects what the player just did, never whether it is telling the truth.
 */
export function CaiFace({ mood, speaking, dread }: { mood: CaiMood; speaking: boolean; dread: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height / 2);
      const far = Math.hypot(dx, dy) || 1;
      const pull = Math.min(1, far / 260);
      setGaze({ x: (dx / far) * pull * 11, y: (dy / far) * pull * 11 });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  // The pupil widens through the night, narrows when the player refuses it, and widens when it has something to offer.
  const pupil = (mood === 'cold' ? 5 : mood === 'offer' || mood === 'whisper' ? 12 : 9) + dread * 4;
  return (
    <svg ref={ref} className={`cai-face ${mood} ${speaking ? 'speaking' : ''}`} viewBox="0 0 100 100" aria-label="C.A.I.-0">
      <rect className="cai-shell" x="4" y="4" width="92" height="92" rx="14" />
      <circle className="cai-ring" cx="50" cy="50" r="36" />
      <clipPath id="cai-eye"><circle cx="50" cy="50" r="30" /></clipPath>
      <circle className="cai-white" cx="50" cy="50" r="30" />
      <g clipPath="url(#cai-eye)">
        <g style={{ transform: `translate(${gaze.x.toFixed(1)}px, ${gaze.y.toFixed(1)}px)` }}>
          <circle className="cai-iris" cx="50" cy="50" r="19" />
          <circle className="cai-pupil" cx="50" cy="50" r={pupil} />
          <circle className="cai-glint" cx="44" cy="43" r="2.6" />
        </g>
        {/* Lids: the top one blinks, the bottom one rises when it is pleased with you. */}
        <rect className="cai-lid top" x="14" y="14" width="72" height="36" />
        <path className="cai-lid bottom" d="M14 86V70Q50 52 86 70V86z" />
      </g>
    </svg>
  );
}
