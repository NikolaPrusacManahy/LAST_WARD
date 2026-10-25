// Update 0.9.9 — settings in three tabs ("folders"): Video (graphics quality, field of view, grain),
// Audio (the four volumes) and Controls (mouse, then every key in two columns). It was two long columns.
// The tabs sit beside the title and every page is the same height: it fits the screen, no scrolling.
import { useState } from 'react';
import { FOV_MAX, FOV_MIN, GRAPHICS, Graphics, Settings } from '../state/settings';
import { KeyBindings } from './KeyBindings';
import { askMic } from '../net/voice';
import { MIMIC } from '../state/coopRun';

const VOLUMES: [key: 'volume' | 'sfxVolume' | 'bgmVolume' | 'voiceVolume', label: string][] = [
  ['volume', 'Master volume'],
  ['sfxVolume', 'Sound effects'],
  ['bgmVolume', 'Background'],
  ['voiceVolume', 'Voice chat'], // Update 0.9.9 — co-op proximity chat
];

type Tab = 'video' | 'audio' | 'controls';
const TABS: [Tab, string][] = [
  ['video', 'Video'],
  ['audio', 'Audio'],
  ['controls', 'Controls'],
];

interface Props {
  settings: Settings;
  onChange(s: Settings): void;
  onClose(): void;
}

export function SettingsPanel({ settings: s, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('video');
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...s, [k]: v });
  return (
    <div className="lw-overlay">
      <div className="lw-panel lw-settings">
        <div className="lw-set-head">
          <h2 className="lw-panel-title">Settings</h2>
          <div className="lw-set-tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`lw-set-tab ${tab === id ? 'lw-set-tab-on' : ''}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="lw-set-page" role="tabpanel">
          {tab === 'video' && (
            <>
              <div className="lw-set-row lw-set-choice">
                <span>Graphics</span>
                <div className="lw-set-seg" role="radiogroup" aria-label="Graphics">
                  {(Object.keys(GRAPHICS) as Graphics[]).map((g) => (
                    <button key={g} role="radio" aria-checked={s.graphics === g} className={`lw-set-seg-btn ${s.graphics === g ? 'lw-set-seg-on' : ''}`} onClick={() => set('graphics', g)}>
                      {GRAPHICS[g].label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="lw-set-row">
                <span>Field of view</span>
                <input type="range" min={FOV_MIN} max={FOV_MAX} step={1} value={s.fov} onChange={(e) => set('fov', +e.target.value)} />
                <output>{s.fov}°</output>
              </label>
              <label className="lw-set-row lw-set-check">
                <span>Film grain</span>
                <input type="checkbox" checked={s.grain} onChange={(e) => set('grain', e.target.checked)} />
              </label>
            </>
          )}

          {tab === 'audio' && (
            <>
              {VOLUMES.map(([key, label]) => (
                <label className="lw-set-row" key={key}>
                  <span>{label}</span>
                  <input type="range" min={0} max={1} step={0.01} value={s[key]} onChange={(e) => set(key, +e.target.value)} />
                  <output>{Math.round(s[key] * 100)}%</output>
                </label>
              ))}
              {/* Update 0.9.9 — test build only: try the mimic on your own (solo runs use your microphone). */}
              {import.meta.env.DEV && MIMIC.enabled && (
                <label className="lw-set-row lw-set-check">
                  <span>Solo mimic (test)</span>
                  <input
                    type="checkbox"
                    checked={s.soloMimic}
                    onChange={(e) => {
                      if (e.target.checked) void askMic(); // asked here, never mid-run
                      set('soloMimic', e.target.checked);
                    }}
                  />
                </label>
              )}
            </>
          )}

          {tab === 'controls' && (
            <>
              <div className="lw-set-mouse">
                <label className="lw-set-row">
                  <span>Mouse sensitivity</span>
                  <input type="range" min={0.2} max={3} step={0.05} value={s.sensitivity} onChange={(e) => set('sensitivity', +e.target.value)} />
                  <output>{s.sensitivity.toFixed(2)}</output>
                </label>
                <label className="lw-set-row lw-set-check">
                  <span>Invert mouse Y</span>
                  <input type="checkbox" checked={s.invertY} onChange={(e) => set('invertY', e.target.checked)} />
                </label>
              </div>
              <div className="lw-set-keys">
                <KeyBindings bindings={s.bindings} onChange={(b) => set('bindings', b)} />
              </div>
            </>
          )}
        </div>

        <nav className="lw-menu-nav">
          <button className="lw-menu-btn" onClick={onClose}>Back</button>
        </nav>
      </div>
    </div>
  );
}
