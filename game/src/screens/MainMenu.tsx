import { useEffect, useState } from 'react';
import { SaveData, formatTime } from '../state/settings';
import { MicAnswer, askMicOnce, micAnswer } from '../net/voice';
import { MenuScene } from './MenuScene';
import { TesterLevelPicker } from './TesterLevelPicker';
import { LEVELS } from '../world/content/levels';
import { GAME_STAGE, GAME_VERSION } from '../state/version';

interface Props {
  save: SaveData;
  onStart(): void;
  /** Update 0.9.9 — co-op: make or join a room. */
  onCoop(): void;
  /** Update 0.9.9 — the co-op run this tab dropped out of (a reload, a lost connection): back into it. */
  rejoin: { code: string; busy: boolean } | null;
  rejoinError: string | null;
  onRejoin(): void;
  onSettings(): void;
  /** Update 0.8 — the Credits screen. */
  onCredits(): void;
  /** Update 0.7.1 — tester level picker (dev build only). */
  startLevel: number;
  onPickLevel(level: number): void;
}

export function MainMenu({ save, onStart, onCoop, rejoin, rejoinError, onRejoin, onSettings, onCredits, startLevel, onPickLevel }: Props) {
  // Update 0.9.9 — the microphone is asked for here, once, so no prompt comes up mid-run (it would take the
  // mouse away). The browser remembers the answer; the run opens the mic only if you said yes.
  const [mic, setMic] = useState<MicAnswer | 'asking' | null>(micAnswer);
  useEffect(() => {
    void askMicOnce(() => setMic('asking')).then(setMic);
  }, []);
  return (
    <div className="lw-menu">
      <MenuScene />
      {import.meta.env.DEV && LEVELS.length > 1 && <TesterLevelPicker level={startLevel} onPick={onPickLevel} />}
      <div className="lw-menu-inner">
        <p className="lw-menu-kicker">St. Brigid's Hospital · Ward 13</p>
        <h1 className="lw-title">LAST WARD</h1>
        <nav className="lw-menu-nav">
          {rejoin && (
            <button className="lw-menu-btn lw-menu-rejoin" disabled={rejoin.busy} onClick={onRejoin}>
              {rejoin.busy ? 'Rejoining…' : `Rejoin the run · ${rejoin.code}`}
            </button>
          )}
          {rejoinError && <span className="lw-menu-rejoin-error">{rejoinError}</span>}
          <button className="lw-menu-btn" onClick={onStart}>Begin</button>
          <button className="lw-menu-btn" onClick={onCoop}>Co-op</button>
          <button className="lw-menu-btn" onClick={onSettings}>Settings</button>
          <button className="lw-menu-btn" onClick={onCredits}>Credits</button>
        </nav>
        <dl className="lw-menu-stats">
          <div><dt>Escaped</dt><dd>{save.escapes}</dd></div>
          <div><dt>Taken</dt><dd>{save.deaths}</dd></div>
          <div><dt>Best</dt><dd>{save.bestTime === null ? '—' : formatTime(save.bestTime)}</dd></div>
        </dl>
        {mic === 'asking' && <p className="lw-menu-mic">Microphone: for co-op voice chat.</p>}
      </div>
      <div className="lw-menu-version">
        <span>v{GAME_VERSION}</span>
        <span>{GAME_STAGE}</span>
      </div>
    </div>
  );
}
