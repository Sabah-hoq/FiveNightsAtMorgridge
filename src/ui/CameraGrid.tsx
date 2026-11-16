import type { UnitMotion } from '../core/gameState';
import type { Cam, Side, Unit } from '../core/types';
import cam01 from '../assets/cam01.jpg';
import cam02 from '../assets/cam02.jpg';
import cam03 from '../assets/cam03.jpg';
import cam04 from '../assets/cam04.jpg';
import { MorgridgeMap } from './MorgridgeMap';

type Spot = { left: number; bottom: number; height: number };

/**
 * Each camera has a route: `far` is where a unit first shows up, `near` is as close to the lens as it gets.
 * `pace` is how far it wanders side to side (in % of the screen) while it is not heading anywhere.
 */
type Route = { far: Spot; near: Spot; pace: number };

export const CAMS: { id: Cam; key: string; label: string; place: string; src: string; route: Route }[] = [
  { id: 'CAM01', key: '1', label: 'CAM 01', place: 'DOOR L, WEST HALL', src: cam01,
    route: { far: { left: 30, bottom: 33, height: 30 }, near: { left: 46, bottom: 3, height: 70 }, pace: 9 } },
  { id: 'CAM02', key: '2', label: 'CAM 02', place: 'DOOR R, EAST HALL', src: cam02,
    route: { far: { left: 80, bottom: 6, height: 50 }, near: { left: 22, bottom: 2, height: 72 }, pace: 8 } },
  { id: 'CAM03', key: '3', label: 'CAM 03', place: 'HELLO WORLD HALL', src: cam03,
    route: { far: { left: 53, bottom: 30, height: 31 }, near: { left: 38, bottom: 5, height: 62 }, pace: 7 } },
  { id: 'CAM04', key: '4', label: 'CAM 04', place: 'ATRIUM STAIR', src: cam04,
    route: { far: { left: 74, bottom: 13, height: 14 }, near: { left: 40, bottom: 11, height: 20 }, pace: 6 } },
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const TAU = 2 * Math.PI;
/** Every LURCH_MS it slows to a dead stop, then lurches forward at up to twice its usual speed. */
const LURCH_MS = 6400;

/** Its own sense of time: it stalls and surges instead of ticking evenly. */
const warped = (tMs: number, phase: number): number =>
  tMs + (LURCH_MS / TAU) * Math.sin((tMs / LURCH_MS + phase) * TAU);

/** Smooth wander between -1 and 1 that never quite repeats. `seed` gives each unit and each axis its own path. */
function drift(tMs: number, seed: number): number {
  const t = tMs / 1000;
  return (Math.sin(t * 0.57 + seed * 9.1) + 0.55 * Math.sin(t * 1.31 + seed * 4.3) + 0.15 * Math.sin(t * 3.3 + seed * 7.7)) / 1.7;
}

/** Where it is wandering right now: side to side (x), toward and away from the lens (z), and how fast (per second). */
function wander(tMs: number, index: number): { x: number; z: number; vx: number } {
  const phase = index * 0.37;
  const now = warped(tMs, phase);
  const x = drift(now, 1 + index);
  return { x, z: drift(now * 0.7, 5 + index), vx: (drift(warped(tMs + 120, phase), 1 + index) - x) / 0.12 };
}

/**
 * The units as seen on a feed: tall, thin and hunched, with arms that hang past the knees.
 * The eyes are the only colour on a feed. They are narrow slits, and one of them is failing.
 */
function Figure({ unit, route, motion, tMs, index }: { unit: Unit; route: Route; motion: UnitMotion; tMs: number; index: number }) {
  // Running at a door it comes straight on with a short weave. Otherwise it wanders in two directions:
  // side to side, and a little toward and away from the lens. The wander shrinks as it gets close.
  const w = motion.rushing ? { x: 0.18 * Math.sin(tMs / 55), z: 0, vx: 0 } : wander(tMs, index);
  const d = Math.min(1, Math.max(0, motion.depth + w.z * 0.08));
  const height = lerp(route.far.height, route.near.height, d);
  const reach = route.pace * (1 - d * 0.6);
  const left = lerp(route.far.left, route.near.left, d) + w.x * reach + index * Math.max(6, height / 4);
  const style = { left: `${left}%`, bottom: `${lerp(route.far.bottom, route.near.bottom, d)}%`, height: `${height}%` };
  // Its speed across the screen picks the gait, and it leans into the direction it is heading.
  const speed = Math.abs(w.vx) * reach;
  const gait = motion.rushing ? 'run' : speed < 0.5 ? 'stand' : speed < 2 ? 'creep' : speed < 4.5 ? 'walk' : 'lurch';
  const lean = motion.rushing ? 0 : Math.max(-11, Math.min(11, w.vx * reach * 2.2));
  return (
    <svg className={`figure ${unit} ${gait}`} style={style} viewBox="0 0 60 120" aria-label={`${unit} unit on camera`}>
      <g className="lean" style={{ transform: `rotate(${lean.toFixed(1)}deg)` }}>
      <rect className="body leg a" x="20" y="76" width="6" height="44" rx="2" />
      <rect className="body leg b" x="34" y="76" width="6" height="44" rx="2" />
      <g className="torso">
        <path className="limb arm a" d="M14 46 L9 70 L12 93 M12 93 L7 102 M12 93 L12 104 M12 93 L16 102" />
        <path className="limb arm b" d="M46 46 L52 66 L47 89 M47 89 L43 98 M47 89 L48 100 M47 89 L52 97" />
        <path className="body" d="M13 43h34l2 5-7 6-4 26H22l-4-26-7-6z" />
        <path className="rib" d="M22 58h16M23 64h14M24 70h12" />
        <rect className="body" x="27.5" y="32" width="5" height="13" />
        <g className="head">
          <rect className="body" x="16" y="9" width="28" height="25" rx="5" />
          <rect className="body" x="13" y="5" width="34" height="7" rx="2" />
          <rect className="face" x="19" y="15" width="22" height="16" rx="3" />
          <path className="eye" d="M20.5 19.5 L28 23 L28 25 L20.5 22.5 Z" />
          <path className="eye dying" d="M39.5 19.5 L32 23 L32 25 L39.5 22.5 Z" />
          <path className="teeth" d="M22 28.5l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2" />
        </g>
      </g>
      </g>
    </svg>
  );
}

/** The face that fills the screen when a unit gets in. */
export function ScareFace({ unit }: { unit: Unit }) {
  return (
    <svg className={`scare ${unit}`} viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g className="scare-head">
        <rect className="shell" x="14" y="2" width="172" height="34" rx="8" />
        <rect className="shell" x="26" y="22" width="148" height="150" rx="26" />
        <rect className="plate" x="40" y="48" width="120" height="108" rx="16" />
        <path className="crack" d="M118 22l-9 22 12 9-8 19M52 150l14-10-4-12" />
        <path className="eye" d="M50 76 L92 92 L92 98 L50 85 Z" />
        <path className="eye dying" d="M150 76 L108 92 L108 98 L150 85 Z" />
        <g className="maw">
          <path className="gullet" d="M54 116h92l-4 38H58z" />
          <path className="fang" d="M56 116L58.9 133L61.9 116L64.8 129L67.7 116L70.7 137L73.6 116L76.5 140L79.5 116L82.4 125L85.3 116L88.3 125L91.2 116L94.1 128L97.1 116L100.0 125L102.9 116L105.9 133L108.8 116L111.7 128L114.7 116L117.6 125L120.5 116L123.5 128L126.4 116L129.3 129L132.3 116L135.2 125L138.1 116L141.1 125L144.0 116z" />
          <path className="fang" d="M56 154L58.9 133L61.9 154L64.8 133L67.7 154L70.7 145L73.6 154L76.5 141L79.5 154L82.4 145L85.3 154L88.3 142L91.2 154L94.1 133L97.1 154L100.0 145L102.9 154L105.9 142L108.8 154L111.7 145L114.7 154L117.6 141L120.5 154L123.5 130L126.4 154L129.3 130L132.3 154L135.2 142L138.1 154L141.1 145L144.0 154z" />
        </g>
      </g>
    </svg>
  );
}

interface Props {
  cam: Cam | null;
  units: Unit[];
  /** Where each unit is inside its camera view. */
  motion: Record<Unit, UnitMotion>;
  /** Night clock in ms, used to time the pacing. */
  tMs: number;
  doors: Record<Side, boolean>;
  clock: string;
  glitch: boolean;
  onSelect: (cam: Cam | null) => void;
}

export function CameraGrid({ cam, units, motion, tMs, doors, clock, glitch, onSelect }: Props) {
  const active = CAMS.find((c) => c.id === cam);
  return (
    <section className="monitor" aria-label="Security monitor">
      <div className={`screen ${glitch ? 'glitch' : ''}`}>
        {active ? (
          <>
            <img className="feed" src={active.src} alt={`${active.label}: ${active.place}`} />
            {units.map((u, i) => <Figure key={u} unit={u} route={active.route} motion={motion[u]} tMs={tMs} index={i} />)}
            <span className="rec"><i />REC</span>
            <span className="feed-name">{active.label}<br />{active.place}</span>
            <span className="feed-stamp">NIGHT 1<br />{clock}</span>
          </>
        ) : (
          <MorgridgeMap cam={cam} doors={doors} onSelect={onSelect} />
        )}
        <div className="noise" aria-hidden="true" />
      </div>
      <div className="cam-tabs">
        <button id="cam-map" className={`key ${cam === null ? 'on' : ''}`} aria-pressed={cam === null} onClick={() => onSelect(null)}>
          MAP <kbd>M</kbd>
        </button>
        {CAMS.map((c) => (
          <button key={c.id} id={`cam-${c.id}`} className={`key ${cam === c.id ? 'on' : ''}`} aria-pressed={cam === c.id}
            onClick={() => onSelect(c.id)}>
            {c.label} <kbd>{c.key}</kbd>
          </button>
        ))}
      </div>
    </section>
  );
}
