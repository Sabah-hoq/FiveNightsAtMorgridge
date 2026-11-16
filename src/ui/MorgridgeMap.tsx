import type { Cam, Side } from '../core/types';

/**
 * Simplified security map, drawn for the game (not an architectural plan).
 * It shows where each camera points and which wall of the office each door seals.
 */
const CAM_MARKS: { id: Cam; n: string; x: number; y: number; cone: string; lx: number; ly: number; anchor: 'start' | 'end' }[] = [
  { id: 'CAM01', n: '01', x: 92, y: 232, cone: '92,232 82,190 104,190', lx: 84, ly: 236, anchor: 'end' },
  { id: 'CAM02', n: '02', x: 172, y: 232, cone: '172,232 160,190 182,190', lx: 180, ly: 236, anchor: 'start' },
  { id: 'CAM03', n: '03', x: 224, y: 168, cone: '224,168 150,146 150,176', lx: 232, ly: 171, anchor: 'start' },
  { id: 'CAM04', n: '04', x: 268, y: 44, cone: '268,44 214,52 222,78', lx: 276, ly: 47, anchor: 'start' },
  { id: 'CAM05', n: '05', x: 292, y: 100, cone: '292,100 254,86 252,112', lx: 300, ly: 104, anchor: 'start' },
  { id: 'CAM06', n: '06', x: 248, y: 134, cone: '248,134 206,110 200,134', lx: 256, ly: 140, anchor: 'start' },
  { id: 'CAM07', n: '07', x: 68, y: 150, cone: '68,150 61,104 77,104', lx: 62, ly: 164, anchor: 'end' },
];

interface Props {
  cam: Cam | null;
  doors: Record<Side, boolean>;
  onSelect: (cam: Cam) => void;
}

export function MorgridgeMap({ cam, doors, onSelect }: Props) {
  return (
    <svg className="map" viewBox="34 20 372 232" role="img" aria-label="Security map of Morgridge Hall showing seven cameras and the two office doors">
      {/* building shell */}
      <path className="map-wall" d="M60,70 L95,28 L255,28 L300,92 L228,148 L228,176 L190,196 L190,240 L74,240 L74,160 L60,140 Z" />
      {/* lecture hall */}
      <path className="map-room" d="M78,76 L104,42 L176,42 Q198,92 150,128 L84,128 Z" />
      <path className="map-detail" d="M98,70 Q140,52 172,62 M96,86 Q138,68 176,80 M94,102 Q134,86 170,98" />
      <text className="map-label" x="128" y="118" textAnchor="middle">LECTURE HALL</text>
      {/* atrium stair */}
      <ellipse className="map-room" cx="226" cy="64" rx="27" ry="14" />
      <path className="map-detail" d="M210,58 h32 M208,64 h36 M210,70 h32" />
      <text className="map-label" x="226" y="92" textAnchor="middle">ATRIUM STAIR</text>
      {/* commons */}
      <path className="map-dash" d="M182,104 Q214,92 236,112 Q226,138 196,136 Q176,124 182,104 Z" />
      <text className="map-label" x="208" y="120" textAnchor="middle">COMMONS</text>
      {/* main entrance, cafe (in the commons) and study lounge */}
      <path className="map-detail" d="M296,86 l8,10 M291,90 l8,10" />
      <text className="map-label" x="300" y="114" textAnchor="start">ENTRANCE</text>
      <text className="map-label" x="208" y="129" textAnchor="middle">CAFE</text>
      <text className="map-label" x="68" y="96" textAnchor="middle" transform="rotate(-90 68 96)">LOUNGE</text>
      {/* hello world hall */}
      <path className="map-room" d="M92,144 H214 V178 H92 Z" />
      <text className="map-label" x="153" y="165" textAnchor="middle">HELLO WORLD HALL</text>
      {/* route toward the office */}
      <path className="map-route" d="M226,78 L208,112 L170,150 M118,178 L94,198 M152,178 L170,198" />
      {/* office and its two doors */}
      <rect className="map-office" x="108" y="190" width="48" height="42" />
      <text className="map-label map-you" x="132" y="207" textAnchor="middle">YOUR</text>
      <text className="map-label map-you" x="132" y="218" textAnchor="middle">OFFICE</text>
      <line className={`map-door ${doors.L ? 'sealed' : ''}`} x1="108" y1="198" x2="108" y2="224" />
      <line className={`map-door ${doors.R ? 'sealed' : ''}`} x1="156" y1="198" x2="156" y2="224" />
      <text className={`map-doorname ${doors.L ? 'sealed' : ''}`} x="113" y="229" textAnchor="start">L</text>
      <text className={`map-doorname ${doors.R ? 'sealed' : ''}`} x="151" y="229" textAnchor="end">R</text>
      <text className="map-label" x="91" y="186" textAnchor="middle">WEST HALL</text>
      <text className="map-label" x="173" y="186" textAnchor="middle">EAST HALL</text>
      {/* cameras */}
      {CAM_MARKS.map((c) => (
        <g key={c.id} className={`map-cam ${cam === c.id ? 'on' : ''}`} role="button" tabIndex={0} aria-label={`Open CAM ${c.n}`}
          onClick={() => onSelect(c.id)} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onSelect(c.id); } }}>
          <polygon className="map-cone" points={c.cone} />
          <circle cx={c.x} cy={c.y} r="5" />
          <text className="map-camname" x={c.lx} y={c.ly} textAnchor={c.anchor}>CAM {c.n}</text>
        </g>
      ))}
    </svg>
  );
}
