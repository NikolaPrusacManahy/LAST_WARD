import { SaveData, formatTime } from '../state/settings';
import type { CoopEnd } from '../engine/Game';

/** Update 0.9.9 — co-op: how each of you ended up. */
const FATE: Record<string, string> = { escaped: 'got out', out: 'taken', left: 'left the run', up: 'still inside', down: 'still inside', caught: 'still inside' };

interface Props {
  result: 'dead' | 'escaped';
  time: number;
  save: SaveData;
  /** Update 0.9.9 — none after a co-op run (back to the menu, then a new room). */
  onRetry?(): void;
  onMenu(): void;
  coop?: CoopEnd;
}

export function EndScreen({ result, time, save, onRetry, onMenu, coop }: Props) {
  if (coop) return <CoopEndScreen coop={coop} time={time} onMenu={onMenu} />;
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

function CoopEndScreen({ coop, time, onMenu }: { coop: CoopEnd; time: number; onMenu(): void }) {
  const someone = coop.team.some((m) => m.life === 'escaped');
  const me = coop.mine === 'escaped';
  const won = !coop.note && someone;
  const title = coop.note ? 'THE RUN IS OVER' : me ? 'YOU GOT OUT' : someone ? 'THEY GOT OUT' : 'IT TOOK YOU ALL';
  return (
    <div className={`lw-overlay ${won ? 'lw-end-won' : 'lw-end-dead'}`}>
      <div className="lw-panel">
        <h2 className="lw-end-title">{title}</h2>
        <p className="lw-panel-sub">{coop.note ?? `${formatTime(time)} in the ward.`}</p>
        <ul className="lw-end-team">
          {coop.team.map((m) => (
            <li key={m.id}>
              <span>{m.name}</span>
              <em>{FATE[m.life] ?? m.life}</em>
            </li>
          ))}
        </ul>
        <nav className="lw-menu-nav">
          <button className="lw-menu-btn" onClick={onMenu}>Main menu</button>
        </nav>
      </div>
    </div>
  );
}
