// Update 1.0.1 — pick a map before each run (Begin → map → difficulty). Each card shows the map's floor
// plan and your best escape there. The last pick is highlighted.
import { LEVELS, levelId } from '../world/content/levels';
import { formatTime } from '../state/settings';

interface Props {
  current: string;
  best: Record<string, number>;
  onPick(id: string): void;
  onBack(): void;
}

export function MapPanel({ current, best, onPick, onBack }: Props) {
  return (
    <div className="lw-overlay">
      <div className="lw-panel lw-maps">
        <h2 className="lw-panel-title">Map</h2>
        <div className="lw-map-list">
          {LEVELS.map((l) => {
            const id = levelId(l);
            return (
              <button key={id} className={`lw-map ${id === current ? 'lw-map-current' : ''}`} onClick={() => onPick(id)} autoFocus={id === current}>
                <MapPlan rows={l.map ?? l.floors?.[0] ?? []} />
                <span className="lw-map-name">{l.name}</span>
                {l.blurb && <span className="lw-map-blurb">{l.blurb}</span>}
                {best[id] !== undefined && <span className="lw-map-best">Best {formatTime(best[id])}</span>}
              </button>
            );
          })}
        </div>
        <nav className="lw-menu-nav">
          <button className="lw-menu-btn" onClick={onBack}>Back</button>
        </nav>
      </div>
    </div>
  );
}

/** The ground floor from above: open floor light, walls left dark, one strip per run of floor. */
function MapPlan({ rows }: { rows: string[] }) {
  const cols = rows[0]?.length ?? 0;
  const runs: { x: number; y: number; w: number }[] = [];
  rows.forEach((line, y) => {
    let start = -1;
    for (let x = 0; x <= cols; x++) {
      const open = x < cols && line[x] !== '#' && line[x] !== 'G';
      if (open && start < 0) start = x;
      if (!open && start >= 0) {
        runs.push({ x: start, y, w: x - start });
        start = -1;
      }
    }
  });
  return (
    <svg className="lw-map-plan" viewBox={`-0.5 -0.5 ${cols + 1} ${rows.length + 1}`} aria-hidden="true">
      {runs.map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={1} />
      ))}
    </svg>
  );
}
