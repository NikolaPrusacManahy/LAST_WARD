// Update 0.5.4 — what lies on each table changes every run: the fuses, batteries and notes swap
// places across the map's item spots, and which note text is where changes too. Same counts, same
// spots (so everything stays reachable). Pure + seeded (tested).
import type { Level, LevelItem } from './level';
import type { Rng } from './rng';

function shuffle<T>(a: T[], rng: Rng): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function shuffleItems(level: Level, rng: Rng): Level {
  const kinds = shuffle(level.items.map((i) => i.kind), rng);
  const noteOrder = shuffle(
    level.items.filter((i) => i.kind === 'note').map((i) => i.noteIndex!),
    rng,
  );
  const counts = { fuse: 0, battery: 0, note: 0, medkit: 0 };
  const items: LevelItem[] = level.items.map((spot, k) => {
    const kind = kinds[k];
    const item: LevelItem = { id: `${kind}-${counts[kind]}`, kind, cell: spot.cell };
    if (kind === 'note') item.noteIndex = noteOrder[counts.note];
    counts[kind]++;
    return item;
  });
  return { ...level, items };
}
