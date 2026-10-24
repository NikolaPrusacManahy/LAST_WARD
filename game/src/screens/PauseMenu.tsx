interface Props {
  onResume(): void;
  onSettings(): void;
  onQuit(): void;
  /** Update 0.9.9 — a co-op run doesn't stop for this menu. */
  coop?: boolean;
}

export function PauseMenu({ onResume, onSettings, onQuit, coop }: Props) {
  return (
    <div className="lw-overlay">
      <div className="lw-panel">
        <h2 className="lw-panel-title">Paused</h2>
        <p className="lw-panel-sub">{coop ? "It doesn't stop for you. Your friends are still in there." : 'It is still out there.'}</p>
        <nav className="lw-menu-nav">
          <button className="lw-menu-btn" onClick={onResume}>Resume</button>
          <button className="lw-menu-btn" onClick={onSettings}>Settings</button>
          <button className="lw-menu-btn" onClick={onQuit}>{coop ? 'Leave the run' : 'Quit to menu'}</button>
        </nav>
      </div>
    </div>
  );
}
