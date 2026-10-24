// Update 0.9.6 — The Patient: faster walk, sharper hearing, spotted by your beam, lured by throws,
// checks lockers, and no more walking backwards.
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { cellCenter, dist, parseLevel } from '../src/world/level';
import { lockerSpots, propFront } from '../src/world/props';
import { ENEMY, EnemyEvent, LockerSpot, createEnemy, heardNoise, litByBeam, stepEnemy, turnToward } from '../src/world/enemyAI';
import { createRng } from '../src/world/rng';

const level = parseLevel(LEVEL_01);
const at = (col: number, row: number) => cellCenter({ col, row });
const lockers: LockerSpot[] = lockerSpots(level).map((l) => {
  const f = propFront(l);
  return { center: { x: l.x, z: l.z }, stand: { x: l.x + f.x * 0.95, z: l.z + f.z * 0.95 } };
});
const hidden = { pos: { x: -100, z: -100 }, flashlightOn: false, crouching: true, hidden: true };

section('Faster, sharper (0.9.6)');
{
  check('it walks twice as fast (patrol 1.5 → 3.0 m/s)', ENEMY.speed.patrol === 3.0);
  check('searching / checking a noise is still a walk, slower than the chase', ENEMY.speed.search < ENEMY.speed.chase && ENEMY.speed.investigate < ENEMY.speed.chase);
  const e = createEnemy(level);
  e.pos = at(10, 5);
  check('hears twice as far: walking 10 m away down the corridor (radius 6)', heardNoise(level, e, { pos: at(13, 5), radius: 6 }) && !heardNoise(level, e, { pos: at(16, 5), radius: 6 }));
}

section('Your flashlight on its body (0.9.6)');
{
  const e = createEnemy(level);
  e.pos = at(16, 5);
  e.dir = { x: 1, z: 0 }; // facing away from you
  const you = { pos: at(10, 5), flashlightOn: true, crouching: true, facing: { x: 1, z: 0 }, beam: true };
  check('beam on its back, 18 m away: it knows', litByBeam(level, e, you));
  const ev = stepEnemy(level, e, { dt: 1 / 60, player: you, noise: null, fuses: 0 }, createRng(1));
  check('…spotted at once, even facing away', ev.includes('spotted') && e.mode === 'chase');
  const e2 = createEnemy(level);
  e2.pos = at(16, 5);
  e2.dir = { x: 1, z: 0 };
  check('beam pointed elsewhere: no', !litByBeam(level, e2, { ...you, facing: { x: 0, z: 1 } }));
  check('night vision goggles give off no beam', !litByBeam(level, e2, { ...you, beam: false }));
  check('not through a wall', !litByBeam(level, e2, { ...you, pos: at(16, 8), facing: { x: 0, z: -1 } }));
}

section('No more walking backwards (0.9.6)');
{
  const e = createEnemy(level);
  e.dir = { x: 1, z: 0 };
  for (let i = 0; i < 30; i++) turnToward(e, { x: -1, z: 0 }, 1 / 60);
  check('told to go straight back the way it faces, it turns round', e.dir.x < -0.9, `${e.dir.x.toFixed(2)}`);
}

section('Thrown things (0.9.6)');
{
  const run = (youAt: { x: number; z: number }) => {
    const e = createEnemy(level);
    e.pos = at(4, 5);
    e.dir = { x: 1, z: 0 };
    const target = at(20, 5);
    const you = { pos: youAt, flashlightOn: false, crouching: true };
    const rng = createRng(2);
    let ev: EnemyEvent[] = stepEnemy(level, e, { dt: 1 / 60, player: you, noise: { pos: target, radius: 30, lure: true }, fuses: 0 }, rng);
    const t0 = { ...e.pos };
    let speed = 0;
    let spotted = false;
    for (let i = 0; i < 20 * 60 && !spotted && e.mode !== 'search'; i++) {
      ev = stepEnemy(level, e, { dt: 1 / 60, player: you, noise: null, fuses: 0 }, rng);
      if (i === 59) speed = dist(t0, e.pos);
      spotted = ev.includes('spotted');
    }
    return { e, speed, spotted };
  };
  const close = run({ x: at(21, 5).x + 1, z: at(21, 5).z }); // 4 m past where it lands

  check('it sprints to where it landed', close.speed > ENEMY.speed.investigate * 1.2, `${close.speed.toFixed(2)} m/s`);
  check('you within 5 m when it gets there: it comes for you', close.spotted && close.e.mode === 'chase');
  const far = run(at(10, 11));
  check('you far from it: it just searches', !far.spotted && far.e.mode === 'search');
}

section('Checking lockers (0.9.6)');
{
  // It goes to look at a noise right by locker 1, finds nothing, and checks the locker.
  const l = lockers[0];
  const go = (playerLocker: number | null) => {
    const e = createEnemy(level);
    e.pos = at(9, 2);
    const rng = createRng(3);
    const events: EnemyEvent[] = [];
    events.push(...stepEnemy(level, e, { dt: 1 / 60, player: hidden, noise: { pos: l.stand, radius: 20 }, fuses: 0, lockers, playerLocker }, rng));
    let t = 0;
    for (let i = 0; i < 30 * 60 && !events.includes('lockerClose') && !events.includes('foundYou'); i++) {
      events.push(...stepEnemy(level, e, { dt: 1 / 60, player: hidden, noise: null, fuses: 0, lockers, playerLocker }, rng));
      if (events.includes('lockerOpen')) t += 1 / 60;
    }
    return { e, events, t };
  };
  const empty = go(null);
  check('it walks up to a locker near where it lost you and opens it', empty.events.includes('lockerOpen') && dist(empty.e.pos, lockers[0].stand) < 1.2);
  check('looks for about a second, then shuts it', empty.events.includes('lockerClose') && empty.t > 0.9 && empty.t < 1.3, `${empty.t.toFixed(2)} s`);
  check('…and won\'t check the same one again straight away', empty.e.checked[0] !== undefined);
  const found = go(0);
  check('you were in it: found', found.events.includes('foundYou'));
}
