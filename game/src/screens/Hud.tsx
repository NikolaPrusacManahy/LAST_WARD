import type { HudStore } from '../engine/hudStore';
import { useHud } from '../hooks/useHud';

interface Props {
  store: HudStore;
  hidden: boolean;
  onBegin(): void;
}

export function Hud({ store, hidden, onBegin }: Props) {
  const h = useHud(store);

  if (!h.started) {
    return (
      <button className="lw-intro" onClick={onBegin}>
        <span className="lw-intro-time">03:14 AM</span>
        <span className="lw-intro-line">You wake up on a gurney in Ward 13.</span>
        <span className="lw-intro-line">The power is out. Something is breathing down the hall.</span>
        <span className="lw-intro-cta">Click to begin</span>
        <span className="lw-intro-keys">WASD move · Mouse look · Shift run · C crouch · F flashlight · E interact · Esc pause</span>
      </button>
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
      {h.prompt && <div className="lw-hud-prompt">{h.prompt}</div>}
      {h.toast && <div className="lw-hud-toast" key={h.toast}>{h.toast}</div>}
      {h.note && (
        <div className="lw-note">
          <p>{h.note}</p>
          <span>[E] put it down</span>
        </div>
      )}
      <div className="lw-hud-bars">
        <div className={`lw-bar ${low ? 'lw-bar-low' : ''} ${h.flashlightOn ? '' : 'lw-bar-off'}`}>
          <label>LIGHT</label>
          <div className="lw-bar-track">
            <div className="lw-bar-fill" style={{ width: `${h.battery}%` }} />
          </div>
        </div>
        <div className={`lw-bar lw-bar-stamina ${h.exhausted ? 'lw-bar-low' : ''}`} style={{ opacity: h.stamina >= 1 ? 0.25 : 1 }}>
          <label>BREATH</label>
          <div className="lw-bar-track">
            <div className="lw-bar-fill" style={{ width: `${h.stamina * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
