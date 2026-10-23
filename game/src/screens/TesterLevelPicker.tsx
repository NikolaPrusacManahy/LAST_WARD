// Update 0.7.1 — tester-only panel on the main menu: pick which level "Begin" starts on.
// Rendered only in the dev build (MainMenu checks import.meta.env.DEV); the choice is kept per browser.
import { LEVELS } from '../world/content/levels';

interface Props {
  level: number;
  onPick(level: number): void;
}

export function TesterLevelPicker({ level, onPick }: Props) {
  return (
    <aside className="lw-tester">
      <strong className="lw-tester-title">TESTER · START LEVEL</strong>
      {LEVELS.map((l, i) => (
        <button key={l.name} className={`lw-tester-level ${i === level ? 'lw-tester-on' : ''}`} onClick={() => onPick(i)}>
          <span className="lw-tester-num">{i + 1}</span>
          {l.name}
        </button>
      ))}
      <span className="lw-tester-note">Dev build only. Begin wakes you up on this level.</span>
    </aside>
  );
}
