import { check, section } from './harness';
import { chooseEnemyClip, clipTimeScale } from '../src/engine/enemyAnim';
import { ENEMY } from '../src/world/enemyAI';

section('Enemy animation choice');
check('windup → scream', chooseEnemyClip('chase', 0, true) === 'scream');
check('chasing → run', chooseEnemyClip('chase', 4, false) === 'run');
check('patrol moving → walk', chooseEnemyClip('patrol', 1.5, false) === 'walk');
check('patrol standing → idle', chooseEnemyClip('patrol', 0, false) === 'idle');
check('search standing → search', chooseEnemyClip('search', 0, false) === 'search');
check('investigate moving → walk', chooseEnemyClip('investigate', 2.6, false) === 'walk');
check('patrol walk plays near authored speed', Math.abs(clipTimeScale('walk', ENEMY.speed.patrol) - 1) < 0.1);
check('fastest chase stays under the clamp', clipTimeScale('run', ENEMY.speed.chase * 1.21) <= 1.9);
check('idle ignores speed', clipTimeScale('idle', 3) === 1);

import { choosePlayerClip, playerClipTimeScale } from '../src/engine/playerAnim';
import { debugLines } from '../src/state/debugInfo';

section('Player body animation');
check('sprint → run', choosePlayerClip('sprint', false) === 'run');
check('walk → walk', choosePlayerClip('walk', false) === 'walk');
check('idle → idle', choosePlayerClip('idle', false) === 'idle');
check('crouching wins', choosePlayerClip('walk', true) === 'crouch' && choosePlayerClip('idle', true) === 'crouch');
check('crouch still = frozen pose', playerClipTimeScale('crouch', 0) === 0);
check('walk speed clamped', playerClipTimeScale('walk', 3.0) <= 1.7 && playerClipTimeScale('walk', 1.6) === 1);

section('Debug panel');
{
  const lines = debugLines({ fps: 59.6, cell: { col: 3, row: 2 }, enemyMode: 'chase', alert: 1, windup: 0.4, distance: 4.25, seesYou: true, frozen: false, fuses: 2, powered: false });
  check('shows mode + scream', lines[1] === 'Patient: CHASE (screaming)');
  check('shows distance + sight', lines[2].includes('4.3 m') && lines[2].includes('SEES YOU'));
  check('lists the keys', lines[lines.length - 1].includes('F2') && lines[lines.length - 1].includes('F3'));
}
