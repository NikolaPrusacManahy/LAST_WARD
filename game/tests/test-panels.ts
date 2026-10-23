// Update 0.9.1 — the panel switches (facing, their own target), what The Patient does with panel
// sounds, and the injured limp.
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { FACE_DIR, cellCenter, dist, parseLevel } from '../src/world/level';
import { panelSpots, panelSwitches } from '../src/world/props';
import { findTarget } from '../src/world/interact';
import { createProgress } from '../src/state/objectives';
import { promptFor } from '../src/state/prompts';
import { SKILL } from '../src/state/skillCheck';
import { ENEMY, createEnemy, stepEnemy } from '../src/world/enemyAI';
import { BOB, bobOffset, injuredAmp } from '../src/state/cameraBob';
import { createRng } from '../src/world/rng';

const level = parseLevel(LEVEL_01);
const boxes = panelSpots(level);
const switches = panelSwitches(level);
const plans = level.props.filter((p) => p.kind === 'power_switch');

section('Panel switches (0.9.1)');
{
  check('one switch per panel', switches.length === boxes.length && switches.length === 4);
  // The switch model's face (and its lever) is its local -z; turned by its yaw it must point out of the wall.
  const faces = switches.map((s, i) => {
    const front = { x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) };
    const want = FACE_DIR[plans[i].wall!];
    return Math.abs(front.x + want.dc) < 1e-6 && Math.abs(front.z + want.dr) < 1e-6;
  });
  check('every switch faces the room, lever out (not edge-on, not into the wall)', faces.every(Boolean), faces.join(' '));
  switches.forEach((s, i) => {
    const out = { x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) };
    const stand = { x: s.x + out.x * 1.1, z: s.z + out.z * 1.1 };
    const lookAt = (p: { x: number; z: number }) => {
      const d = dist(stand, p);
      return { x: (p.x - stand.x) / d, z: (p.z - stand.z) / d };
    };
    const atSwitch = findTarget(level, stand, lookAt(s), []);
    const atBox = findTarget(level, stand, lookAt(boxes[i]), []);
    check(`panel ${i + 1}: looking at the switch targets the switch, at the box the box`, atSwitch?.type === 'switch' && atSwitch.index === i && atBox?.type === 'panel' && atBox.index === i);
  });
  const p = createProgress();
  const sw = (i: number) => promptFor({ type: 'switch', index: i }, p, false);
  check('switch before a fuse: dead, needs a fuse', sw(0)?.verb === null && sw(0)?.info === 'Dead. The panel needs a fuse.');
  p.panels[0].fuse = true;
  check('switch before the repair: dead, repair first', sw(0)?.info === 'Dead. Repair the panel first.');
  p.panels[0].fixed = true;
  check('repaired: Press [icon] to switch on (at the switch)', sw(0)?.verb === 'switch on' && sw(0)?.title === 'Power switch');
  check('the panel itself no longer offers the switch', promptFor({ type: 'panel', index: 0 }, p, false)?.verb === null);
  p.panels[0].on = true;
  check('on: says so', sw(0)?.info === 'On.');
}

section('The Patient and panel sounds (0.9.1)');
{
  const hidden = { pos: { x: -100, z: -100 }, flashlightOn: false, crouching: true };
  const box = boxes[0];
  // A panel blowing: heard from the far side of the map, and it runs there.
  const far = createEnemy(level);
  far.pos = cellCenter({ col: 23, row: 17 });
  const startD = dist(far.pos, box);
  stepEnemy(level, far, { dt: 1 / 60, player: hidden, noise: { pos: box, radius: SKILL.bangNoise, run: true }, fuses: 0 }, createRng(2));
  check('a panel blowing is heard across the map', far.mode === 'investigate' && startD > 50, `${startD.toFixed(0)} m away`);
  const before = { ...far.pos };
  for (let i = 0; i < 60; i++) stepEnemy(level, far, { dt: 1 / 60, player: hidden, noise: null, fuses: 0 }, createRng(2));
  const speed = dist(before, far.pos);
  check('…and it runs there (chase speed)', far.rush && speed > ENEMY.speed.investigate * 1.2, `${speed.toFixed(2)} m/s`);
  // Throwing a switch: only if it's near, and it walks over.
  const sw = switches[0];
  const near = createEnemy(level);
  near.pos = cellCenter({ col: 10, row: 2 });
  const nd = dist(near.pos, sw);
  stepEnemy(level, near, { dt: 1 / 60, player: hidden, noise: { pos: sw, radius: SKILL.switchNoise }, fuses: 0 }, createRng(3));
  check('a switch thrown nearby: it comes to look, walking', nd < SKILL.switchNoise && near.mode === 'investigate' && !near.rush, `${nd.toFixed(1)} m`);
  const away = createEnemy(level);
  away.pos = cellCenter({ col: 23, row: 17 });
  stepEnemy(level, away, { dt: 1 / 60, player: hidden, noise: { pos: sw, radius: SKILL.switchNoise }, fuses: 0 }, createRng(3));
  check('a switch thrown far away: not heard', away.mode !== 'investigate');
}

section('Injured head bob (0.9.1)');
{
  const walk = BOB.walk;
  const hurt = injuredAmp(walk);
  check('injured bob is much bigger', hurt.y > walk.y * 1.5 && hurt.roll > walk.roll * 2 && hurt.side > walk.side * 1.5);
  const dip = (phase: number, limp: number) => bobOffset(hurt, phase, 0, limp).y;
  check('limp: the bad leg dips deeper than the good one', dip(Math.PI, 0.8) < dip(2 * Math.PI, 0.8) * 1.5);
  check('no limp when not injured', Math.abs(bobOffset(walk, Math.PI, 0).y - bobOffset(walk, 2 * Math.PI, 0).y) < 1e-9);
  const a = bobOffset(hurt, Math.PI * 1.5 - 1e-6, 0, 0.8).y;
  const b = bobOffset(hurt, Math.PI * 1.5 + 1e-6, 0, 0.8).y;
  check('no jump when the legs swap (mid-stride)', Math.abs(a - b) < 1e-4);
}
