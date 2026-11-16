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
/** One lap of pacing: walk one way, stand, walk back, stand. */
const PACE_MS = 9000;

/** Side-to-side wander, -1 to 1, with a pause at each end. `moving` is false while it stands still. */
function pacing(tMs: number, phase: number): { x: number; moving: boolean } {
  const raw = 1.7 * Math.sin((tMs / PACE_MS + phase) * 2 * Math.PI);
  return { x: Math.max(-1, Math.min(1, raw)), moving: Math.abs(raw) < 1 };
}

/** Original placeholder figures. The eyes are the only colour on a feed. */
function Figure({ unit, route, motion, tMs, index }: { unit: Unit; route: Route; motion: UnitMotion; tMs: number; index: number }) {
  const d = motion.depth;
  const height = lerp(route.far.height, route.near.height, d);
  // Running at a door it comes straight on. Otherwise it wanders, and the wander shrinks as it gets close.
  const pace = motion.rushing ? { x: 0, moving: true } : pacing(tMs, index * 0.37);
  const left = lerp(route.far.left, route.near.left, d) + pace.x * route.pace * (1 - d * 0.6) + index * Math.max(6, height / 4);
  const style = { left: `${left}%`, bottom: `${lerp(route.far.bottom, route.near.bottom, d)}%`, height: `${height}%` };
  const gait = motion.rushing ? 'run' : pace.moving ? 'walk' : 'stand';
  return (
    <svg className={`figure ${unit} ${gait}`} style={style} viewBox="0 0 60 120" aria-label={`${unit} unit on camera`}>
      <rect className="body leg a" x="11" y="94" width="15" height="26" rx="3" />
      <rect className="body leg b" x="34" y="94" width="15" height="26" rx="3" />
      <g className="torso">
        <path className="body" d="M30 4c11 0 18 8 18 19 0 8-4 14-9 17l10 8c4 3 5 8 5 14v36H6V62c0-6 1-11 5-14l10-8c-5-3-9-9-9-17C12 12 19 4 30 4z" />
        {unit === 'white' && <rect className="visor" x="16" y="16" width="28" height="14" rx="6" />}
        <circle className="eye" cx="23" cy="23" r="2.8" />
        <circle className="eye" cx="37" cy="23" r="2.8" />
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
