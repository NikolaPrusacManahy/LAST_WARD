// Quality gate. `npm run verify:quick` = typecheck + tests.
// `npm run verify` = typecheck + tests + production build.
import { spawnSync } from 'child_process';

const quick = process.argv.includes('--quick');
const isWin = process.platform === 'win32';
const steps = [
  ['Typecheck', 'npx', ['tsc', '--noEmit']],
  ['Rule tests', 'npx', ['tsx', 'tests/run-all.ts']],
];
if (!quick) steps.push(['Production build', 'npx', ['vite', 'build']]);

for (const [name, cmd, args] of steps) {
  console.log(`\n▶ ${name}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    console.error(`\n❌ ${name} failed.`);
    process.exit(1);
  }
}
console.log(`\n✅ verify${quick ? ':quick' : ''} passed.`);
