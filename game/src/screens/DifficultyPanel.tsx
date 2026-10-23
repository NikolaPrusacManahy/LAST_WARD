// Update 0.9.3 — pick a difficulty before each run (Begin). The last pick is highlighted.
import { DIFFICULTIES, DIFFICULTY, Difficulty } from '../state/difficulty';

interface Props {
  current: Difficulty;
  onPick(d: Difficulty): void;
  onBack(): void;
}

export function DifficultyPanel({ current, onPick, onBack }: Props) {
  return (
    <div className="lw-overlay">
      <div className="lw-panel lw-difficulty">
        <h2 className="lw-panel-title">Difficulty</h2>
        <p className="lw-panel-sub">How do you want to spend the night?</p>
        <div className="lw-diff-list">
          {DIFFICULTIES.map((d) => (
            <button key={d} className={`lw-diff ${d === current ? 'lw-diff-current' : ''}`} onClick={() => onPick(d)} autoFocus={d === current}>
              <span className="lw-diff-name">{DIFFICULTY[d].label}</span>
              <span className="lw-diff-blurb">{DIFFICULTY[d].blurb}</span>
            </button>
          ))}
        </div>
        <nav className="lw-menu-nav">
          <button className="lw-menu-btn" onClick={onBack}>Back</button>
        </nav>
      </div>
    </div>
  );
}
