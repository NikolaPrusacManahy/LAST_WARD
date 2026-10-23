// Update 0.5.1 — boot credit screen over the main menu.
// Update 0.6.2 — two cards: the studio title (its typing GIF, plays once), then the full-screen +
// headphones tips. Timing in state/creditIntro.ts; a click fades the current card within 0.5 s.
import { useEffect, useRef, useState } from 'react';
import {
  CREDIT_CARDS,
  createCreditSequence,
  creditCard,
  creditOpacity,
  creditSequenceDone,
  skipCreditSequence,
  stepCreditSequence,
} from '../state/creditIntro';
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
  const seq = useRef(createCreditSequence());
  const [view, setView] = useState({ card: creditCard(seq.current), opacity: 1 });
  const done = useRef(onDone);
  done.current = onDone;
  // The studio card's clock starts when its GIF has loaded (and so starts typing), not at mount.
  const started = useRef(false);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const mounted = last;
    const frame = (now: number) => {
      if (!started.current && now - mounted > 1500) started.current = true; // never stuck if the GIF can't load
      // Real time, but one stall (the menu loading its 3D model behind this) counts at most 0.25 s.
      const dt = started.current ? Math.min(0.25, Math.max(0, (now - last) / 1000)) : 0;
      seq.current = stepCreditSequence(seq.current, dt);
      last = now;
      if (creditSequenceDone(seq.current)) {
        done.current();
        return;
      }
      setView({ card: creditCard(seq.current), opacity: creditOpacity(seq.current.intro) });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Black stays solid between cards; only the last card fades the whole screen into the menu.
  const lastCard = view.card === CREDIT_CARDS[CREDIT_CARDS.length - 1].id;
  return (
    <div
      className="lw-credit"
      style={{ opacity: lastCard ? view.opacity : 1 }}
      onPointerDown={() => (seq.current = skipCreditSequence(seq.current))}
    >
      {view.card === 'studio' && (
        <img
          className="lw-credit-studio-gif"
          src="/ui/studio.gif"
          alt="Developed by NIKO GAME COLLECTION"
          draggable={false}
          onLoad={() => (started.current = true)}
          onError={() => (started.current = true)}
          style={{ opacity: view.opacity }}
        />
      )}
      {view.card === 'tips' && (
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
      )}
    </div>
  );
}
