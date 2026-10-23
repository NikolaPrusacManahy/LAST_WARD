import type { HudStore } from '../engine/hudStore';
import { useHud } from '../hooks/useHud';
import { breathLineVisible, breathLineWidth } from '../state/hudLayout';
import { ControlsCard } from './ControlsCard';
import { InputIcon } from './InputIcon';

interface Props {
  store: HudStore;
  hidden: boolean;
  onBegin(): void;
}

export function Hud({ store, hidden, onBegin }: Props) {
  const h = useHud(store);

  const introText = (
    <>
      <span className="lw-intro-time">03:14 AM</span>
      <span className="lw-intro-line">You wake up on a gurney in Ward 13.</span>
      <span className="lw-intro-line">The power is out. Something is breathing down the hall.</span>
    </>
  );
  if (!h.started) {
    return (
      <button className="lw-intro" onClick={onBegin}>
        {introText}
        <span className="lw-intro-cta">Click to begin</span>
      </button>
    );
  }
  // Update 0.6.3 — the same text stays on black and fades as your eyes start to open.
  if (h.intro > 0 && !hidden) {
    return (
      <div className="lw-intro lw-intro-waking" style={{ opacity: h.intro }}>
        {introText}
      </div>
    );
  }

  if (hidden || h.cinematic) return null;

  const low = h.battery < 20;
  return (
    <div className="lw-hud" style={{ ['--lw-fear' as string]: h.fear }}>
      <div className="lw-hud-objective">{h.objective}</div>
      {h.debug && (
        <div className="lw-dbg-panel">
          <strong>DEBUG VIEW</strong>
          {h.debug.map((line) => (
            <span key={line.slice(0, 8)}>{line}</span>
          ))}
        </div>
      )}
      <div className="lw-hud-crosshair" />
      {h.controls > 0 && !h.note && <ControlsCard bindings={h.bindings} secondsLeft={h.controls} />}
      {h.prompt && (
        <div className="lw-hud-prompt">
          <span className="lw-prompt-title">{h.prompt.title}</span>
          {h.prompt.verb ? (
            <span className="lw-prompt-line">
              Press <InputIcon code={h.bindings.interact} size="lg" /> to {h.prompt.verb}
            </span>
          ) : (
            <span className="lw-prompt-line lw-prompt-info">{h.prompt.info}</span>
          )}
        </div>
      )}
      {h.toast && <div className="lw-hud-toast" key={h.toast}>{h.toast}</div>}
      {h.note && (
        <div className="lw-note">
          <p>{h.note}</p>
          <span className="lw-note-close">
            Press <InputIcon code={h.bindings.interact} size="sm" /> to put it down
          </span>
        </div>
      )}
      <div className="lw-hud-bars">
        <div className={`lw-bar ${low ? 'lw-bar-low' : ''} ${h.flashlightOn ? '' : 'lw-bar-off'}`}>
          <label>LIGHT</label>
          <div className="lw-bar-track">
            <div className="lw-bar-fill" style={{ width: `${h.battery}%` }} />
          </div>
        </div>
      </div>
      <div
        className={`lw-breath ${breathLineVisible(h.stamina) ? 'lw-breath-on' : ''} ${h.exhausted ? 'lw-breath-out' : ''}`}
        style={{ width: `${breathLineWidth(h.stamina)}px` }}
      />
    </div>
  );
}
