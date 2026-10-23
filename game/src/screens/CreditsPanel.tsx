// Update 0.8 — Credits (main menu → Credits): the studio, then every asset with its author and licence.
import { CREDITS } from '../state/credits';

interface Props {
  onClose(): void;
}

export function CreditsPanel({ onClose }: Props) {
  return (
    <div className="lw-overlay">
      <div className="lw-panel lw-credits">
        <h2 className="lw-panel-title">Credits</h2>
        <p className="lw-credits-studio">A game by NIKO GAME COLLECTION</p>
        <ul className="lw-credits-list">
          {CREDITS.map((c) => (
            <li key={c.id} className="lw-credits-item">
              <span className="lw-credits-what">{c.what}</span>
              <span className="lw-credits-line">
                “{c.title}” by {c.author} · {c.licence}
              </span>
              {c.source && (
                <a className="lw-credits-src" href={c.source} target="_blank" rel="noreferrer">
                  {c.source.replace(/^https?:\/\//, '')}
                </a>
              )}
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
