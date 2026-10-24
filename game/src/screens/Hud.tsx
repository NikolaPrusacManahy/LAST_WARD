import type { HudStore } from '../engine/hudStore';
import { useHud } from '../hooks/useHud';
import { breathLineVisible, breathLineWidth } from '../state/hudLayout';
import { ControlsCard } from './ControlsCard';
import { InputIcon } from './InputIcon';
import { SkillCheck } from './SkillCheck';
import { SlotBar } from './SlotBar';

interface Props {
  store: HudStore;
  hidden: boolean;
  onBegin(): void;
}

export function Hud({ store, hidden, onBegin }: Props) {
  const h = useHud(store);

  const introText = (
    <>
      <span className="lw-intro-time">{h.introText.time}</span>
      {h.introText.lines.map((line) => (
        <span className="lw-intro-line" key={line}>
          {line}
        </span>
      ))}
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
      <div className={`lw-hud-objective ${h.banner && !h.note ? 'lw-hud-objective-hidden' : ''}`}>
        {h.objective}
        {h.objectiveDetail && <span className="lw-hud-objective-detail">{h.objectiveDetail}</span>}
      </div>
      {h.debug && (
        <div className="lw-dbg-panel">
          <strong>DEBUG VIEW</strong>
          {h.debug.map((line) => (
            <span key={line.slice(0, 8)}>{line}</span>
          ))}
        </div>
      )}
      <div className="lw-hud-crosshair" />
      {h.controls > 0 && !h.note && <ControlsCard bindings={h.bindings} secondsLeft={h.controls} nightVision={h.nightVision} />}
      {h.prompt && !h.repair?.check && (
        <div className="lw-hud-prompt">
          <span className="lw-prompt-title">{h.prompt.title}</span>
          {h.prompt.verb ? (
            <span className="lw-prompt-line">
              {h.prompt.hold ? 'Hold' : 'Press'} <InputIcon code={h.bindings.interact} size="lg" /> to {h.prompt.verb}
            </span>
          ) : (
            <span className="lw-prompt-line lw-prompt-info">{h.prompt.info}</span>
          )}
        </div>
      )}
      {h.repair && (
        <div className={`lw-repair ${h.repair.dead ? 'lw-repair-shorted' : ''}`}>
          <div className="lw-repair-track">
            <div className="lw-repair-fill" style={{ width: `${Math.round(h.repair.progress * 100)}%` }} />
          </div>
          {h.repair.dead && <span className="lw-repair-dead">Shorted out</span>}
        </div>
      )}
      {h.repair?.check && <SkillCheck key={h.repair.check.spinAtMs} spinAtMs={h.repair.check.spinAtMs} zone={h.repair.check.zone} keyCode={h.bindings.skillCheck} />}
      {h.banner && !h.note && (
        <div className="lw-banner" key={h.banner.key}>
          <span className="lw-banner-label">{h.banner.label}</span>
          <span className="lw-banner-text">{h.banner.text}</span>
        </div>
      )}
      {h.hiding && (
        <div className="lw-hide-hint">
          <span>
            Hold <InputIcon code={h.bindings.skillCheck} size="sm" /> + <InputIcon code={h.bindings.forward} size="sm" /> to peek
          </span>
          <span>
            Press <InputIcon code={h.bindings.interact} size="sm" /> to get out
          </span>
        </div>
      )}
      {/* Update 0.9.8 — the med kit: hold to use, a bar where the repair bar goes. */}
      {h.use !== null && (
        <div className="lw-repair">
          <div className="lw-repair-track">
            <div className="lw-repair-fill lw-use-fill" style={{ width: `${Math.round(h.use * 100)}%` }} />
          </div>
          <span className="lw-use-label">Patching yourself up</span>
        </div>
      )}
      {!h.hiding && !h.note && <SlotBar slots={h.slots} slot={h.slot} stowed={h.stowed} dropKey={h.bindings.skillCheck} />}
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
          <label>{h.nightVision ? 'NV' : 'LIGHT'}</label>
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
