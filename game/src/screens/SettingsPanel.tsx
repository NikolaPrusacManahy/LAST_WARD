import type { Settings } from '../state/settings';

interface Props {
  settings: Settings;
  onChange(s: Settings): void;
  onClose(): void;
}

export function SettingsPanel({ settings: s, onChange, onClose }: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...s, [k]: v });
  return (
    <div className="lw-overlay">
      <div className="lw-panel lw-settings">
        <h2 className="lw-panel-title">Settings</h2>
        <label className="lw-set-row">
          <span>Mouse sensitivity</span>
          <input type="range" min={0.2} max={3} step={0.05} value={s.sensitivity} onChange={(e) => set('sensitivity', +e.target.value)} />
          <output>{s.sensitivity.toFixed(2)}</output>
        </label>
        <label className="lw-set-row">
          <span>Volume</span>
          <input type="range" min={0} max={1} step={0.01} value={s.volume} onChange={(e) => set('volume', +e.target.value)} />
          <output>{Math.round(s.volume * 100)}%</output>
        </label>
        <label className="lw-set-row lw-set-check">
          <span>Invert mouse Y</span>
          <input type="checkbox" checked={s.invertY} onChange={(e) => set('invertY', e.target.checked)} />
        </label>
        <label className="lw-set-row lw-set-check">
          <span>Film grain</span>
          <input type="checkbox" checked={s.grain} onChange={(e) => set('grain', e.target.checked)} />
        </label>
        <nav className="lw-menu-nav">
          <button className="lw-menu-btn" onClick={onClose}>Back</button>
        </nav>
      </div>
    </div>
  );
}
