import { useEffect, useState } from 'react';

export const GAME_TITLE = 'FIVE NIGHTS AT MORGRIDGE';

const HOLD_MS = 900;
const GLITCH_MS = 1000;

/**
 * "C.A.I.-0 CERTIFIED: 0 ERRORS".
 * On the start screen it just sits there. On the end screen, pass `errors` (the lies the player accepted):
 * the 0 flickers for about a second and becomes the real count. A player who accepted no lies keeps a true 0.
 */
export function CertLine({ errors }: { errors?: number }) {
  const reveal = errors !== undefined;
  const [shown, setShown] = useState('0');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!reveal) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let flicker: ReturnType<typeof setInterval> | undefined;
    const settle = () => {
      if (flicker) clearInterval(flicker);
      setShown(String(errors));
      setDone(true);
    };
    const start = setTimeout(() => {
      if (still || errors === 0) return settle();
      flicker = setInterval(() => setShown(String(Math.floor(Math.random() * 10))), 60);
    }, HOLD_MS);
    const end = setTimeout(settle, HOLD_MS + GLITCH_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
      if (flicker) clearInterval(flicker);
    };
  }, [reveal, errors]);

  const broken = done && (errors ?? 0) > 0;
  return (
    <div className={`cert ${broken ? 'broken' : ''}`} role="status">
      <p className="cert-line">
        C.A.I.-0 <span className="cert-word">CERTIFIED</span>: <span className={`cert-n ${reveal && !done ? 'glitching' : ''}`}>{shown}</span>{' '}
        {shown === '1' && done ? 'ERROR' : 'ERRORS'}
      </p>
      {broken && <p className="cert-note">C.A.I.-0 did not tell you.</p>}
    </div>
  );
}
