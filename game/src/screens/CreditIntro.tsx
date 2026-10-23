// Update 0.5.1 — boot credit screen over the main menu: full-screen tip, headphones, developer credit.
// Holds 3 s then fades (state/creditIntro.ts); clicking anywhere cuts the fade to 0.5 s.
import { useEffect, useRef, useState } from 'react';
import { createCreditIntro, creditDone, creditOpacity, skipCreditIntro, stepCreditIntro } from '../state/creditIntro';
import { InputIcon } from './InputIcon';

interface Props {
  onDone(): void;
}

/** Simple original headphones mark, drawn in the bone colour like the input icons. */
function HeadphonesIcon() {
  return (
    <svg className="lw-input-icon lw-input-md" viewBox="0 0 64 64" aria-label="Headphones" role="img">
      <path d="M12 38 V32 a20 20 0 0 1 40 0 V38" fill="none" stroke="#D8D2BC" strokeWidth="4" strokeLinecap="round" />
      <rect x="8" y="36" width="12" height="18" rx="4" fill="#D8D2BC" />
      <rect x="44" y="36" width="12" height="18" rx="4" fill="#D8D2BC" />
      <rect x="18" y="40" width="4" height="10" rx="2" fill="#C8241E" />
      <rect x="42" y="40" width="4" height="10" rx="2" fill="#C8241E" />
    </svg>
  );
}

export function CreditIntro({ onDone }: Props) {
  const state = useRef(createCreditIntro());
  const [opacity, setOpacity] = useState(1);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      // Real time, not capped per frame: the menu loading its 3D model behind this can stall frames.
      state.current = stepCreditIntro(state.current, (now - last) / 1000);
      last = now;
      setOpacity(creditOpacity(state.current));
      if (creditDone(state.current)) done.current();
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="lw-credit" style={{ opacity }} onPointerDown={() => (state.current = skipCreditIntro(state.current))}>
      <div className="lw-credit-tips">
        <p className="lw-credit-tip">
          <InputIcon code="F11" />
          <span>Play in full screen for a better experience</span>
        </p>
        <p className="lw-credit-tip">
          <HeadphonesIcon />
          <span>Headphones recommended</span>
        </p>
      </div>
      <p className="lw-credit-by">Developed by</p>
      <p className="lw-credit-studio">NIKO GAME COLLECTION</p>
    </div>
  );
}
