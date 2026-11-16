import { useEffect, useRef, useState } from 'react';
import type { UnitMotion } from '../core/gameState';
import type { Cam, Side, Unit } from '../core/types';
import cam01 from '../assets/cam01.jpg';
import cam02 from '../assets/cam02.jpg';
import cam03 from '../assets/cam03.jpg';
import cam04 from '../assets/cam04.jpg';
import { MorgridgeMap } from './MorgridgeMap';
import { sfx } from './sfx';

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
/**
 * The units stand dead still most of the time, then relocate in one short burst. Time is cut into beats of
 * BEAT_MS. In most beats the unit holds its spot until the last second or so, then moves to a new one.
 * In the rest it does not move at all, so the player can never time it.
 */
const BEAT_MS = 7600;
const MOVE_CHANCE = 0.6;

/** Repeatable random number in 0..1 from a beat number and a seed. */
const hash = (n: number, seed: number): number => {
  const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** The spot it settles on by the end of beat k: side to side (x) and toward or away from the lens (z), each -1..1. */
function spotAt(k: number, seed: number): { x: number; z: number } {
  for (let i = k; i > k - 6; i--) {
    if (hash(i, seed) < MOVE_CHANCE) return { x: hash(i, seed + 1) * 2 - 1, z: hash(i, seed + 2) * 2 - 1 };
  }
  return { x: 0, z: 0 };
}

/** Where it is right now, whether it is in a burst, and how fast it is crossing (per second). */
function wander(tMs: number, index: number): { x: number; z: number; vx: number; moving: boolean } {
  const seed = 3 + index * 17;
  const beats = (tMs + index * 2900) / BEAT_MS;
  const k = Math.floor(beats);
  const from = spotAt(k - 1, seed);
  const to = spotAt(k, seed);
  const burst = 0.09 + hash(k, seed + 3) * 0.1; // the last 0.7 to 1.4 seconds of the beat
  const p = Math.max(0, (beats - k - (1 - burst)) / burst);
  const e = p * p * (3 - 2 * p);
  const moving = p > 0 && (from.x !== to.x || from.z !== to.z);
  return {
    x: lerp(from.x, to.x, e), z: lerp(from.z, to.z, e), moving,
    vx: moving ? (to.x - from.x) / ((burst * BEAT_MS) / 1000) : 0,
  };
}

/**
 * The units as seen on a feed: tall, thin and hunched, with arms that hang past the knees.
 * The eyes are the only colour on a feed. They are narrow slits, and one of them is failing.
 */
function Figure({ unit, route, motion, tMs, index }: { unit: Unit; route: Route; motion: UnitMotion; tMs: number; index: number }) {
  // Running at a door it comes straight on with a short weave. Otherwise it holds still and moves in bursts.
  const w = motion.rushing ? { x: 0.18 * Math.sin(tMs / 55), z: 0, vx: 0, moving: true } : wander(tMs, index);
  // It only gets closer while it is moving. Between bursts it is exactly where the player last saw it.
  const shown = useRef({ route, depth: motion.depth });
  if (shown.current.route !== route || motion.rushing) shown.current = { route, depth: motion.depth };
  else if (w.moving) shown.current.depth += (motion.depth - shown.current.depth) * 0.2;
  const d = Math.min(1, Math.max(0, shown.current.depth + w.z * 0.08));
  const height = lerp(route.far.height, route.near.height, d);
  const reach = route.pace * (1 - d * 0.6);
  const left = lerp(route.far.left, route.near.left, d) + w.x * reach + index * Math.max(6, height / 4);
  const style = { left: `${left}%`, bottom: `${lerp(route.far.bottom, route.near.bottom, d)}%`, height: `${height}%` };
  // How far it has to go in this burst picks the gait, and it leans into the direction it is heading.
  const speed = Math.abs(w.vx) * reach;
  const gait = motion.rushing ? 'run' : !w.moving ? 'stand' : speed < 2 ? 'creep' : speed < 5 ? 'walk' : 'lurch';
  const lean = motion.rushing ? 0 : Math.max(-11, Math.min(11, w.vx * reach * 1.6));
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
  /** False while the monitor is lowered: nothing new happens on a screen nobody is looking at. */
  live: boolean;
  /** Something is in the office: every feed drops to static. */
  lost: boolean;
  night: number;
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

/**
 * Fake-outs: once in a while, shortly after a feed is opened, the face fills it for an instant. Nothing attacks.
 * Rare on purpose, and capped per night, so the player is never sure they saw it.
 * Dev aid: add ?fakeout=1 to the URL to make it happen on every feed.
 */
const FAKEOUT = { chance: 0.04, perNight: 2, minDelayMs: 600, maxDelayMs: 3200, showMs: 260 };
const FORCE_FAKEOUT = new URLSearchParams(window.location.search).has('fakeout');

function useFakeout(cam: Cam | null): boolean {
  const [showing, setShowing] = useState(false);
  const used = useRef(0);
  useEffect(() => {
    if (!cam) return;
    if (!FORCE_FAKEOUT && (used.current >= FAKEOUT.perNight || Math.random() >= FAKEOUT.chance)) return;
    let off: ReturnType<typeof setTimeout> | undefined;
    const on = setTimeout(() => {
      used.current += 1;
      setShowing(true);
      sfx.fakeout();
      off = setTimeout(() => setShowing(false), FAKEOUT.showMs);
    }, FAKEOUT.minDelayMs + Math.random() * (FAKEOUT.maxDelayMs - FAKEOUT.minDelayMs));
    return () => {
      clearTimeout(on);
      clearTimeout(off);
      setShowing(false);
    };
  }, [cam]);
  return showing;
}

export function CameraGrid({ cam, live, lost, night, units, motion, tMs, doors, clock, glitch, onSelect }: Props) {
  const active = CAMS.find((c) => c.id === cam);
  const fakeout = useFakeout(live && !lost ? cam : null);
  return (
    <section className="monitor" aria-label="Security monitor">
      <div className={`screen ${glitch || lost ? 'glitch' : ''} ${lost ? 'lost' : ''}`}>
        {active ? (
          <>
            <img className="feed" src={active.src} alt={`${active.label}: ${active.place}`} />
            {units.map((u, i) => <Figure key={u} unit={u} route={active.route} motion={motion[u]} tMs={tMs} index={i} />)}
            {fakeout && <div className="fakeout"><ScareFace unit="black" /></div>}
            <span className="rec"><i />REC</span>
            <span className="feed-name">{active.label}<br />{active.place}</span>
            <span className="feed-stamp">NIGHT {night}<br />{clock}</span>
          </>
        ) : (
          <MorgridgeMap cam={cam} doors={doors} onSelect={onSelect} />
        )}
        {lost && <p className="signal-lost">SIGNAL LOST</p>}
        <div className="noise" aria-hidden="true" />
      </div>
      <div className="cam-tabs">
        <button id="cam-map" className={`key ${cam === null ? 'on' : ''}`} aria-pressed={cam === null} onClick={() => onSelect(null)}>
          MAP <kbd>M</kbd>
        </button>
        {CAMS.map((c) => (
          <button key={c.id} id={`cam-${c.id}`} className={`key ${cam === c.id ? 'on' : ''}`} aria-pressed={cam === c.id} tabIndex={live ? 0 : -1}
            onClick={() => onSelect(c.id)}>
            {c.label} <kbd>{c.key}</kbd>
          </button>
        ))}
      </div>
    </section>
  );
}
