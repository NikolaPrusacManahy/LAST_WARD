// Update 0.9.6 — The Patient: faster walk, sharper hearing, spotted by your beam, lured by throws,
// checks lockers, and no more walking backwards.
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { cellCenter, dist, parseLevel } from '../src/world/level';
import { lockerSpots, propFront } from '../src/world/props';
import { LOCKER, seesYouGetIn } from '../src/state/hiding';
import { ENEMY, EnemyEvent, LockerSpot, chaseSees, createEnemy, heardNoise, litByBeam, stepEnemy, turnToward, visibility } from '../src/world/enemyAI';
import { lineOfSight } from '../src/world/lineOfSight';
import { floorCells } from '../src/world/level';
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
  check('0.9.6.2: back to its old walk (patrol 1.5, search 2.1, to a noise 2.6 m/s; 0.9.6 had 3.0 / 3.0 / 3.2)', ENEMY.speed.patrol === 1.5 && ENEMY.speed.search === 2.1 && ENEMY.speed.investigate === 2.6);
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
  // Update 0.9.8 — not from behind any more: only from in front of it or at its side.
  check('0.9.8: beam on its back, 18 m away: it doesn\'t know', !litByBeam(level, e, you));
  const ev = stepEnemy(level, e, { dt: 1 / 60, player: you, noise: null, fuses: 0 }, createRng(1));
  check('0.9.8: …nothing happens', !ev.includes('spotted') && e.mode !== 'chase');
  const front = createEnemy(level);
  front.pos = at(16, 5);
  front.dir = { x: -1, z: 0 }; // facing you
  check('beam on it from in front, 18 m away: it knows at once', litByBeam(level, front, you));
  const ev2 = stepEnemy(level, front, { dt: 1 / 60, player: you, noise: null, fuses: 0 }, createRng(1));
  check('…spotted at once', ev2.includes('spotted') && front.mode === 'chase');
  const side = createEnemy(level);
  side.pos = at(16, 5);
  side.dir = { x: 0, z: 1 }; // side on to you
  check('0.9.8: from its side: it knows (front and sides, not behind)', litByBeam(level, side, you));
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

section('Lockers are safe (0.9.6 checked them; 0.9.9 never)');
{
  // It goes to look at a noise right by locker 1, finds nothing, and searches round there: it used to open
  // the nearest locker, which was always the one you'd hidden in.
  const l = lockers[0];
  const go = (playerLocker: number | null) => {
    const e = createEnemy(level);
    e.pos = at(9, 2);
    const rng = createRng(3);
    const events: EnemyEvent[] = [];
    events.push(...stepEnemy(level, e, { dt: 1 / 60, player: hidden, noise: { pos: l.stand, radius: 20 }, fuses: 0, lockers, playerLocker }, rng));
    let searched = false;
    for (let i = 0; i < 30 * 60; i++) {
      events.push(...stepEnemy(level, e, { dt: 1 / 60, player: hidden, noise: null, fuses: 0, lockers, playerLocker }, rng));
      if (e.mode === 'search') searched = true;
    }
    return { e, events, searched };
  };
  const empty = go(null);
  check('it walks over to the noise and searches round there', empty.searched);
  check('…but never opens a locker', !empty.events.includes('lockerOpen') && empty.e.check === null);
  const inside = go(0);
  check('you in the locker right by the noise: never found', !inside.events.includes('foundYou') && !inside.events.includes('caught'));
}

section('Hiding mid-chase (0.9.9)');
{
  // It chases you round a corner; you get into a locker out of its sight. It used to keep tracking you for
  // 1.2 s after losing sight (into the locker), walk to its door and, searching, open it.
  const e = createEnemy(level);
  e.pos = at(10, 5);
  e.dir = { x: 1, z: 0 };
  const rng = createRng(5);
  // Chasing you: it saw you a moment ago at (12, 5).
  Object.assign(e, { mode: 'chase', alert: 1, windup: 0, sinceSeen: 0, lastKnown: at(12, 5) });
  const seenAt = { ...e.lastKnown! };
  // You're in a locker it didn't see you get into (its door: far from where it last saw you).
  const l = lockers[lockers.length - 1];
  const inLocker = { pos: l.stand, flashlightOn: false, crouching: true, hidden: true };
  for (let i = 0; i < 20; i++) stepEnemy(level, e, { dt: 1 / 60, player: inLocker, noise: null, fuses: 0, lockers }, rng);
  check('it remembers where it saw you, not the locker you went into', dist(e.lastKnown!, seenAt) < 0.5 && dist(e.lastKnown!, l.stand) > 3, `${dist(e.lastKnown!, l.stand).toFixed(1)} m from your locker`);
  check('it only knows you got in if it saw you from close by', seesYouGetIn(true, 4) && seesYouGetIn(true, LOCKER.seenWithin) && !seesYouGetIn(true, 7) && !seesYouGetIn(false, 1));
  check('(it can see you much further than that: from a lead, a locker works)', ENEMY.viewDistDark > LOCKER.seenWithin + 3);
}

section('Tasks before teleports (0.9.6)');
{
  // Running to a thrown brick when the 35 s teleport clock runs out: it gets there first.
  const e = createEnemy(level);
  e.pos = at(2, 5);
  const youFar = { pos: at(23, 17), flashlightOn: false, crouching: true };
  const rng = createRng(11);
  stepEnemy(level, e, { dt: 1 / 60, player: youFar, noise: { pos: at(22, 5), radius: 30, lure: true }, fuses: 0 }, rng);
  e.sinceSpotted = ENEMY.teleportAfter + 1; // the clock has run out
  let teleportedOnTheWay = false;
  let arrived = false;
  for (let i = 0; i < 20 * 60 && !arrived; i++) {
    const ev = stepEnemy(level, e, { dt: 1 / 60, player: youFar, noise: null, fuses: 0 }, rng);
    if (ev.includes('teleported')) teleportedOnTheWay = true;
    arrived = e.mode === 'search';
  }
  check('running to a throw: no teleport until it gets there', arrived && !teleportedOnTheWay);
  let teleported = false;
  for (let i = 0; i < 5 * 60 && !teleported; i++) teleported = stepEnemy(level, e, { dt: 1 / 60, player: youFar, noise: null, fuses: 0 }, rng).includes('teleported');
  check('…then it teleports', teleported);
  check('…and walks again: not stuck running (the bug)', !e.rush && e.mode === 'patrol');
  let v = 0;
  const p0 = { ...e.pos };
  for (let i = 0; i < 4 * 60; i++) stepEnemy(level, e, { dt: 1 / 60, player: youFar, noise: null, fuses: 0 }, rng);
  v = dist(p0, e.pos) / 4;
  check('…at walking speed', v <= ENEMY.speed.patrol + 0.05, `${v.toFixed(2)} m/s`);
  // Checking a locker: no teleport mid-check either.
  const e2 = createEnemy(level);
  e2.pos = lockers[0].stand;
  e2.mode = 'search';
  e2.check = { locker: 0, phase: 'open', t: 0 };
  e2.sinceSpotted = ENEMY.teleportAfter + 1;
  const ev2 = stepEnemy(level, e2, { dt: 1 / 60, player: youFar, noise: null, fuses: 0, lockers }, createRng(12));
  check('checking a locker: no teleport mid-check', !ev2.includes('teleported') && !!e2.check);
  // Sprinting left on outside a sprint: switched off.
  const e3 = createEnemy(level);
  e3.rush = true;
  e3.mode = 'patrol';
  stepEnemy(level, e3, { dt: 1 / 60, player: youFar, noise: null, fuses: 0 }, createRng(13));
  check('it never stays in a sprint outside going somewhere', !e3.rush);
}

section('Getting away mid-chase (0.9.9, after Nikola\'s co-op test)');
{
  // It chases you down the corridor, you running ahead at 5 m/s; then you're out of its sight (round a
  // corner) and keep running. It used to follow where you really were for 1.2 s after that.
  const e = createEnemy(level);
  e.pos = at(10, 5);
  e.dir = { x: 1, z: 0 };
  Object.assign(e, { mode: 'chase', alert: 1, windup: 0, sinceSeen: 0, crawlCooldown: 1e9 });
  const rng = createRng(3);
  const dt = 1 / 60;
  let you = { ...at(13, 5) };
  const runner = (hide: boolean) => ({ pos: you, flashlightOn: true, crouching: false, running: true, hidden: hide });
  for (let i = 0; i < 30; i++) {
    you = { x: you.x + 5 * dt, z: you.z };
    stepEnemy(level, e, { dt, player: runner(false), noise: null, fuses: 0 }, rng);
  }
  const lastSeen = { ...you };
  for (let i = 0; i < 72; i++) {
    you = { x: you.x + 5 * dt, z: you.z };
    stepEnemy(level, e, { dt, player: runner(true), noise: null, fuses: 0 }, rng);
  }
  const ahead = e.lastKnown!.x - lastSeen.x;
  check('out of sight: it heads where it last saw you and a little on the way you were going (a guess)', ahead > 1 && ahead <= ENEMY.guessAhead + 0.01, `${ahead.toFixed(2)} m on`);
  check('…not where you really are 1.2 s later', you.x - e.lastKnown!.x > 2.5, `${(you.x - e.lastKnown!.x).toFixed(1)} m short of you`);

  // It loses you: for a while your footsteps don't bring it back; anything else still does.
  const l = createEnemy(level);
  l.pos = at(10, 5);
  l.dir = { x: 1, z: 0 };
  Object.assign(l, { mode: 'chase', alert: 1, windup: 0, sinceSeen: 5, lastKnown: { ...l.pos }, crawlCooldown: 1e9 });
  const r2 = createRng(4);
  let lost = false;
  for (let i = 0; i < 120 && !lost; i++) lost = stepEnemy(level, l, { dt, player: hidden, noise: null, fuses: 0 }, r2).includes('lost');
  check('lost you: for 8 s your footsteps don\'t count', lost && l.deaf === ENEMY.deafAfterLost && ENEMY.deafAfterLost >= 5);
  const run = (pos: { x: number; z: number }) => ({ pos, radius: 15, step: true });
  const ev = stepEnemy(level, l, { dt, player: hidden, noise: run(at(12, 5)), fuses: 0 }, r2);
  check('…running right by it: nothing', !ev.includes('heard') && l.mode === 'patrol');
  const thud = stepEnemy(level, l, { dt, player: hidden, noise: { pos: at(12, 5), radius: 15 }, fuses: 0 }, r2);
  check('…but anything else you do, it hears (a door, a switch, something you threw)', thud.includes('heard') && l.mode === 'investigate');
  const later = createEnemy(level);
  later.pos = at(10, 5);
  Object.assign(later, { deaf: ENEMY.deafAfterLost, crawlCooldown: 1e9 });
  for (let i = 0; i < (ENEMY.deafAfterLost + 0.2) * 60; i++) stepEnemy(level, later, { dt, player: hidden, noise: null, fuses: 0 }, r2);
  check('…and after those 8 s your footsteps count again', stepEnemy(level, later, { dt, player: hidden, noise: run(later.pos), fuses: 0 }, r2).includes('heard'));
}

section('In a chase it sees you anywhere in its line of sight (0.9.9, Nikola)');
{
  // Down the hall, 18 m off, in the dark, crouched: it would never notice you like that on patrol.
  const e = createEnemy(level);
  e.pos = at(10, 5);
  e.dir = { x: 1, z: 0 };
  const far = { pos: at(16, 5), flashlightOn: false, crouching: true };
  check('(on patrol it doesn\'t see you there)', visibility(level, e, far) === 0);
  Object.assign(e, { mode: 'chase', alert: 1, windup: 0, sinceSeen: 3, crawlCooldown: 1e9 });
  stepEnemy(level, e, { dt: 1 / 60, player: far, noise: null, fuses: 0 }, createRng(9));
  check('chasing you: it does, at any distance, dark or not', e.sinceSeen === 0 && dist(e.lastKnown!, far.pos) < 0.01);
  const out = floorCells(level).map((c) => cellCenter(c)).find((p) => dist(p, e.pos) > 6 && dist(p, e.pos) < 15 && !lineOfSight(level, e.pos, p))!;
  check('…but out of its line of sight (round a corner, through a wall): not', !!out && !chaseSees(level, e, { pos: out, flashlightOn: true, crouching: false }));
  check('…nor in a locker it didn\'t see you get into', !chaseSees(level, e, { ...far, hidden: true }));
  check('getting into a locker in its sight mid-chase: it sees you, from any distance', seesYouGetIn(false, 15, true) && !seesYouGetIn(false, 15, false) && !seesYouGetIn(true, 15));
}
