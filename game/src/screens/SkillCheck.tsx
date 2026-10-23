// Update 0.9 — the skill check circle (Dead by Daylight style). The engine says when the needle starts
// (performance.now() ms) and where the zone is; the needle is drawn every frame from the same clock the
// rules judge with (state/skillCheck.ts), so a hit on screen is a hit in the game.
import { useEffect, useRef, useState } from 'react';
import { SKILL } from '../state/skillCheck';
import { InputIcon } from './InputIcon';

const R = 68;
const C = 90;

/** Point on the circle at fraction `f` (0 = top, clockwise). */
const at = (f: number, r = R) => {
  const a = f * Math.PI * 2;
  return `${(C + Math.sin(a) * r).toFixed(2)} ${(C - Math.cos(a) * r).toFixed(2)}`;
};
const arc = (from: number, to: number) => `M ${at(from)} A ${R} ${R} 0 ${to - from > 0.5 ? 1 : 0} 1 ${at(to)}`;

interface Props {
  spinAtMs: number;
  zone: number;
  keyCode: string;
}

export function SkillCheck({ spinAtMs, zone, keyCode }: Props) {
  const needle = useRef<SVGGElement>(null);
  const [shown, setShown] = useState(() => performance.now() >= spinAtMs);
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const now = performance.now();
      if (now >= spinAtMs) {
        setShown(true);
        const f = Math.min(1, (now - spinAtMs) / 1000 / SKILL.spin);
        needle.current?.setAttribute('transform', `rotate(${(f * 360).toFixed(1)} ${C} ${C})`);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [spinAtMs]);

  if (!shown) return null;
  return (
    <div className="lw-skill">
      <svg width={C * 2} height={C * 2} viewBox={`0 0 ${C * 2} ${C * 2}`}>
        <circle className="lw-skill-back" cx={C} cy={C} r={R + 14} />
        <circle className="lw-skill-ring" cx={C} cy={C} r={R} />
        <path className="lw-skill-good" d={arc(zone, zone + SKILL.good)} />
        <path className="lw-skill-great" d={arc(zone, zone + SKILL.great)} />
        <g ref={needle}>
          <line className="lw-skill-needle" x1={C} y1={C - R + 18} x2={C} y2={C - R - 12} />
        </g>
      </svg>
      <span className="lw-skill-key">
        <InputIcon code={keyCode} size="lg" />
      </span>
    </div>
  );
}
