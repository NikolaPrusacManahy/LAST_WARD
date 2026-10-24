import { SaveData, formatTime } from '../state/settings';

interface Props {
  result: 'dead' | 'escaped';
  time: number;
  save: SaveData;
  /** Update 0.9.9 — none after a co-op run (back to the menu, then a new room). */
  onRetry?(): void;
  onMenu(): void;
}

export function EndScreen({ result, time, save, onRetry, onMenu }: Props) {
  const dead = result === 'dead';
  return (
    <div className={`lw-overlay ${dead ? 'lw-end-dead' : 'lw-end-won'}`}>
      <div className="lw-panel">
        <h2 className="lw-end-title">{dead ? 'IT FOUND YOU' : 'YOU GOT OUT'}</h2>
        <p className="lw-panel-sub">
          {dead ? `You lasted ${formatTime(time)}.` : `Escaped in ${formatTime(time)}${save.bestTime === time ? ' — new best' : ''}.`}
        </p>
        <nav className="lw-menu-nav">
          {onRetry && <button className="lw-menu-btn" onClick={onRetry}>{dead ? 'Try again' : 'Go back in'}</button>}
          <button className="lw-menu-btn" onClick={onMenu}>Main menu</button>
        </nav>
      </div>
    </div>
  );
}
