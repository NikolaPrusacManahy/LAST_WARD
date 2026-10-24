// The version shown on the main menu matches package.json.
import { readFileSync } from 'fs';
import { check, section } from './harness';
import { GAME_STAGE, GAME_VERSION } from '../src/state/version';

section('Version');
{
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  check('main menu version matches package.json', pkg.version === GAME_VERSION, `${GAME_VERSION} vs ${pkg.version}`);
  check('says it\'s in development', GAME_STAGE === 'Game in development');
}
