import { SaveData, formatTime } from '../state/settings';
import { MenuScene } from './MenuScene';
import { TesterLevelPicker } from './TesterLevelPicker';
import { LEVELS } from '../world/content/levels';

interface Props {
  save: SaveData;
  onStart(): void;
  onSettings(): void;
  /** Update 0.7.1 — tester level picker (dev build only). */
  startLevel: number;
  onPickLevel(level: number): void;
}

export function MainMenu({ save, onStart, onSettings, startLevel, onPickLevel }: Props) {
  return (
    <div className="lw-menu">
      <MenuScene />
      {import.meta.env.DEV && LEVELS.length > 1 && <TesterLevelPicker level={startLevel} onPick={onPickLevel} />}
      <div className="lw-menu-inner">
        <p className="lw-menu-kicker">St. Brigid's Hospital · Ward 13</p>
        <h1 className="lw-title">LAST WARD</h1>
        <nav className="lw-menu-nav">
          <button className="lw-menu-btn" onClick={onStart}>Begin</button>
          <button className="lw-menu-btn" onClick={onSettings}>Settings</button>
        </nav>
        <dl className="lw-menu-stats">
          <div><dt>Escaped</dt><dd>{save.escapes}</dd></div>
          <div><dt>Taken</dt><dd>{save.deaths}</dd></div>
          <div><dt>Best</dt><dd>{save.bestTime === null ? '—' : formatTime(save.bestTime)}</dd></div>
        </dl>
        <p className="lw-menu-hint">Headphones recommended. It hunts by sound.</p>
      </div>
    </div>
  );
}
