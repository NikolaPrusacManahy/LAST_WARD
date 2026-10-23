// Update 0.5 — copy the Kenney input-prompt icons the game uses into public/ui/inputs, recoloured
// to the game palette (white → bone, red highlight → blood). Only the icons in allIconNames() ship.
//
// Usage (from game/):
//   npx tsx tools/prepare-input-icons.ts "../ASSETS/UI - inputs/Keyboard & Mouse/Vector" public/ui/inputs
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { allIconNames, sourceFileFor } from '../src/state/inputIcons';

const BONE = '#D8D2BC';
const BLOOD = '#C8241E';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('Usage: npx tsx tools/prepare-input-icons.ts <Kenney Keyboard & Mouse/Vector folder> <out folder>');
  process.exit(1);
}

mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith('.svg')) rmSync(join(out, f));

let missing = 0;
for (const name of allIconNames()) {
  const file = join(src, sourceFileFor(name));
  if (!existsSync(file)) {
    console.error(`missing: ${file}`);
    missing++;
    continue;
  }
  const svg = readFileSync(file, 'utf8')
    .replace(/#FFFFFF/gi, BONE)
    .replace(/#E73246/gi, BLOOD)
    .replace(/\s*<defs\/>/, '')
    .replace(/\n\s*/g, ' ')
    .trim();
  writeFileSync(join(out, `${name}.svg`), svg + '\n');
}
console.log(`${allIconNames().length - missing} icons written to ${out}${missing ? `, ${missing} missing` : ''}`);
process.exit(missing ? 1 : 0);
