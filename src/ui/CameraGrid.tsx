import type { Cam, SentinelNode } from '../core/types';
import cam02 from '../assets/cam02.jpg';
import cam03 from '../assets/cam03.jpg';
import cam04 from '../assets/cam04.jpg';

export const CAMS: { id: Cam; key: string; label: string; place: string; src: string; spot: React.CSSProperties }[] = [
  { id: 'CAM02', key: '1', label: 'CAM 02', place: 'OVERLOOK, OUTSIDE YOUR OFFICE', src: cam02, spot: { left: '16%', bottom: '6%', height: '66%' } },
  { id: 'CAM03', key: '2', label: 'CAM 03', place: 'HELLO WORLD HALL', src: cam03, spot: { left: '53%', bottom: '30%', height: '31%' } },
  { id: 'CAM04', key: '3', label: 'CAM 04', place: 'ATRIUM STAIR', src: cam04, spot: { left: '44%', bottom: '14%', height: '17%' } },
];

/** Original placeholder figure. The eyes are the only colour on the feed. */
function Figure({ style }: { style: React.CSSProperties }) {
  return (
    <svg className="figure" style={style} viewBox="0 0 60 120" aria-label="Figure on camera">
      <path d="M30 4c11 0 18 8 18 19 0 8-4 14-9 17l10 8c4 3 5 8 5 14v58H6V62c0-6 1-11 5-14l10-8c-5-3-9-9-9-17C12 12 19 4 30 4z" fill="#040406" />
      <circle className="eye" cx="23" cy="23" r="2.8" />
      <circle className="eye" cx="37" cy="23" r="2.8" />
    </svg>
  );
}

interface Props {
  cam: Cam | null;
  sentinel: SentinelNode;
  clock: string;
  glitch: boolean;
  onSelect: (cam: Cam | null) => void;
}

export function CameraGrid({ cam, sentinel, clock, glitch, onSelect }: Props) {
  const active = CAMS.find((c) => c.id === cam);
  return (
    <section className="monitor" aria-label="Camera monitor">
      <div className={`screen ${glitch ? 'glitch' : ''}`}>
        {active ? (
          <>
            <img className="feed" src={active.src} alt={`${active.label}: ${active.place}`} />
            {sentinel === active.id && <Figure style={active.spot} />}
            <span className="rec"><i />REC</span>
            <span className="feed-name">{active.label}: {active.place}</span>
            <span className="feed-stamp">NIGHT 1 · {clock}<br />UW-MADISON SECURITY SYSTEM</span>
          </>
        ) : (
          <div className="no-feed">
            <p>NO FEED SELECTED</p>
            <small>PRESS 1, 2 OR 3</small>
          </div>
        )}
        <div className="noise" aria-hidden="true" />
      </div>
      <div className="cam-tabs">
        {CAMS.map((c) => (
          <button key={c.id} id={`cam-${c.id}`} className={`key ${cam === c.id ? 'on' : ''}`} aria-pressed={cam === c.id}
            onClick={() => onSelect(cam === c.id ? null : c.id)}>
            {c.label} <kbd>{c.key}</kbd>
          </button>
        ))}
      </div>
    </section>
  );
}
