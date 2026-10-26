// The version shown on the main menu matches package.json.
import { readFileSync } from 'fs';
import { check, section } from './harness';
import { GAME_STAGE, GAME_VERSION } from '../src/state/version';

section('Version');
{
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  check('main menu version matches package.json', pkg.version === GAME_VERSION, `${GAME_VERSION} vs ${pkg.version}`);
  check('1.0.2: Harrow Mill\'s pace and the crawl up the stairwells; still student work', GAME_VERSION === '1.0.2' && GAME_STAGE === 'Student Work');
}
