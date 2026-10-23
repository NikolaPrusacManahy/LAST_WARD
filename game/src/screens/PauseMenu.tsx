interface Props {
  onResume(): void;
  onSettings(): void;
  onQuit(): void;
}

export function PauseMenu({ onResume, onSettings, onQuit }: Props) {
  return (
    <div className="lw-overlay">
      <div className="lw-panel">
        <h2 className="lw-panel-title">Paused</h2>
        <p className="lw-panel-sub">It is still out there.</p>
        <nav className="lw-menu-nav">
          <button className="lw-menu-btn" onClick={onResume}>Resume</button>
          <button className="lw-menu-btn" onClick={onSettings}>Settings</button>
          <button className="lw-menu-btn" onClick={onQuit}>Quit to menu</button>
        </nav>
      </div>
    </div>
  );
}
