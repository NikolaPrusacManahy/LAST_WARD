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

import { armScaleFor, bodyBackOffset, bodyRootFor, choosePlayerClip, playerClipTimeScale } from '../src/engine/playerAnim';
import { debugLines } from '../src/state/debugInfo';

section('Player body animation');
check('sprint → run', choosePlayerClip('sprint', false) === 'run');
check('walk → walk', choosePlayerClip('walk', false) === 'walk');
check('idle → idle', choosePlayerClip('idle', false) === 'idle');
check('crouching wins', choosePlayerClip('walk', true) === 'crouch' && choosePlayerClip('idle', true) === 'crouch');
check('crouch still = frozen pose', playerClipTimeScale('crouch', 0) === 0);
check('arms hidden while running', armScaleFor('run') === 0);
{
  // Crouch clip leans the head 0.29 m forward of the feet: the body must step back by that much.
  const cam = { x: 10, z: 10 };
  const fwd = { x: 0, z: -1 };
  const lean = { x: 0, z: -0.29 };
  const root = bodyRootFor(cam, lean, fwd, 0.12);
  const head = { x: root.x + lean.x, z: root.z + lean.z };
  check('crouched head sits behind the camera, not in front', Math.abs(head.z - (cam.z + 0.12)) < 1e-9 && head.x === cam.x);
  check('looking down pushes the body further back', bodyBackOffset(-1) > bodyBackOffset(0));
}
check('arms shown otherwise', armScaleFor('walk') === 1 && armScaleFor('idle') === 1 && armScaleFor('crouch') === 1);
check('walk plays at half speed', playerClipTimeScale('walk', 1.6) === 0.5 && Math.abs(playerClipTimeScale('walk', 3.0) - 0.85) < 1e-9);
check('run speed not halved', playerClipTimeScale('run', 3.2) === 1);

section('Debug panel');
{
  const lines = debugLines({ fps: 59.6, cell: { col: 3, row: 2 }, enemyMode: 'chase', alert: 1, windup: 0.4, distance: 4.25, seesYou: true, frozen: false, fuses: 2, powered: false });
  check('shows mode + scream', lines[1] === 'Patient: CHASE (screaming)');
  check('shows distance + sight', lines[2].includes('4.3 m') && lines[2].includes('SEES YOU'));
  check('lists the keys', lines[lines.length - 1].includes('F2') && lines[lines.length - 1].includes('F3'));
}

import { BOB, blendAmp, bobOffset } from '../src/state/cameraBob';

section('Camera bob');
{
  const peak = (g: keyof typeof BOB) => Math.max(...Array.from({ length: 64 }, (_, i) => Math.abs(bobOffset(BOB[g], (i / 64) * Math.PI * 2, 0).y)));
  check('sprint bobs harder than walk', peak('sprint') > peak('walk') * 2);
  check('walk bobs harder than crouch', peak('walk') > peak('crouch'));
  check('dip lands on the footstep', bobOffset(BOB.walk, Math.PI, 0).y < bobOffset(BOB.walk, Math.PI / 2, 0).y);
  check('sway swaps sides each step', Math.sign(bobOffset(BOB.walk, Math.PI / 2, 0).side) === -Math.sign(bobOffset(BOB.walk, (3 * Math.PI) / 2, 0).side));
  check('idle only breathes', peak('idle') < 0.01);
  check('sprint widens the view', BOB.sprint.fov > 0 && BOB.walk.fov === 0);
  const half = blendAmp(BOB.walk, BOB.sprint, 0.5);
  check('gait change blends smoothly', half.y > BOB.walk.y && half.y < BOB.sprint.y);
}
