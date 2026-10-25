// Update 0.8 — Credits (main menu → Credits): the studio, then every asset with its author and licence.
import { CREDITS } from '../state/credits';

interface Props {
  onClose(): void;
}

export function CreditsPanel({ onClose }: Props) {
  return (
    <div className="lw-overlay">
      <div className="lw-panel lw-credits">
        <div className="lw-credits-head">
          <h2 className="lw-panel-title">Credits</h2>
          <p className="lw-credits-studio">A game by NIKO GAME COLLECTION</p>
        </div>
        {/* Update 0.9.9 — a grid, so it fits the screen with no scrolling: each asset's title links to it. */}
        <ul className="lw-credits-list">
          {CREDITS.map((c) => (
            <li key={c.id} className="lw-credits-item">
              <span className="lw-credits-what">{c.what}</span>
              {c.source ? (
                <a className="lw-credits-line" href={c.source} target="_blank" rel="noreferrer" title={c.source}>
                  “{c.title}”
                </a>
              ) : (
                <span className="lw-credits-line">“{c.title}”</span>
              )}
              <span className="lw-credits-by">
                {c.author} · {c.licence}
              </span>
            </li>
          ))}
        </ul>
        <nav className="lw-menu-nav">
          <button className="lw-menu-btn" onClick={onClose}>Back</button>
        </nav>
      </div>
    </div>
  );
}
