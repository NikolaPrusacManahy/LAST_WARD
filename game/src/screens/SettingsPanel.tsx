import { FOV_MAX, FOV_MIN, Settings } from '../state/settings';
import { KeyBindings } from './KeyBindings';

const VOLUMES: [key: 'volume' | 'sfxVolume' | 'bgmVolume', label: string][] = [
  ['volume', 'Master volume'],
  ['sfxVolume', 'Sound effects'],
  ['bgmVolume', 'Background'],
];

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
        {/* Update 0.5 — two columns: general on the left, controls on the right. */}
        <div className="lw-settings-cols">
          <div className="lw-settings-general">
            <label className="lw-set-row">
              <span>Mouse sensitivity</span>
              <input type="range" min={0.2} max={3} step={0.05} value={s.sensitivity} onChange={(e) => set('sensitivity', +e.target.value)} />
              <output>{s.sensitivity.toFixed(2)}</output>
            </label>
            <label className="lw-set-row">
              <span>Field of view</span>
              <input type="range" min={FOV_MIN} max={FOV_MAX} step={1} value={s.fov} onChange={(e) => set('fov', +e.target.value)} />
              <output>{s.fov}°</output>
            </label>
            {/* Update 0.9.2 — master, then sound effects and background (ambience) under it. */}
            {VOLUMES.map(([key, label]) => (
              <label className="lw-set-row" key={key}>
                <span>{label}</span>
                <input type="range" min={0} max={1} step={0.01} value={s[key]} onChange={(e) => set(key, +e.target.value)} />
                <output>{Math.round(s[key] * 100)}%</output>
              </label>
            ))}
            <label className="lw-set-row lw-set-check">
              <span>Invert mouse Y</span>
              <input type="checkbox" checked={s.invertY} onChange={(e) => set('invertY', e.target.checked)} />
            </label>
            <label className="lw-set-row lw-set-check">
              <span>Film grain</span>
              <input type="checkbox" checked={s.grain} onChange={(e) => set('grain', e.target.checked)} />
            </label>
          </div>
          <KeyBindings bindings={s.bindings} onChange={(b) => set('bindings', b)} />
        </div>
        <nav className="lw-menu-nav">
          <button className="lw-menu-btn" onClick={onClose}>Back</button>
        </nav>
      </div>
    </div>
  );
}
