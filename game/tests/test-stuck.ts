// Update 0.5.2 — regression: the Patient got stuck on doorway corners while chasing a player it
// could see (the sight line was clear but its body wasn't), and its shoulders sank into walls.
import { check, section } from './harness';
import { ENEMY, EnemyEvent, createEnemy, stepEnemy } from '../src/world/enemyAI';
import { overlapsWall } from '../src/world/collision';
import { lineOfSight } from '../src/world/lineOfSight';
import { LEVEL_01 } from '../src/world/content/level01';
import { TILE, Vec2, cellCenter, dist, floorCells, parseLevel } from '../src/world/level';
import { createRng } from '../src/world/rng';

const level = parseLevel(LEVEL_01);
const rng = createRng(52);
const cells = floorCells(level);
const randomSpot = (): Vec2 => {
  for (;;) {
    const c = cellCenter(cells[Math.floor(rng() * cells.length)]);
    const p = { x: c.x + (rng() - 0.5) * TILE * 0.8, z: c.z + (rng() - 0.5) * TILE * 0.8 };
    if (!overlapsWall(level, p, 0.6)) return p;
  }
};

section('Chase never gets stuck (0.5.2)');
{
  let cases = 0;
  let stuck = 0;
  let clipped = 0;
  const failures: string[] = [];
  while (cases < 150) {
    const from = randomSpot();
    const to = randomSpot();
    const d = dist(from, to);
    if (d < 4 || d > 18 || !lineOfSight(level, from, to)) continue;
    cases++;
    const e = createEnemy(level);
    e.pos = from;
    e.mode = 'chase';
    e.alert = 1;
    e.sinceSeen = 0;
    e.dir = { x: (to.x - from.x) / d, z: (to.z - from.z) / d };
    const player = { pos: to, flashlightOn: true, crouching: false };
    const r = createRng(cases);
    let caught = false;
    let wasClipped = false;
    for (let i = 0; i < 12 * 60 && !caught; i++) {
      const ev: EnemyEvent[] = stepEnemy(level, e, { dt: 1 / 60, player, noise: null, fuses: 0 }, r);
      caught = ev.includes('caught');
      if (overlapsWall(level, e.pos, ENEMY.bodyRadius - 0.05)) wasClipped = true;
    }
    if (!caught) {
      stuck++;
      if (failures.length < 3) failures.push(`(${from.x.toFixed(1)},${from.z.toFixed(1)})→(${to.x.toFixed(1)},${to.z.toFixed(1)}) ended ${e.mode} at (${e.pos.x.toFixed(1)},${e.pos.z.toFixed(1)})`);
    }
    if (wasClipped) clipped++;
  }
  check('reaches a visible, standing player every time (150 random chases)', stuck === 0, `${stuck} stuck: ${failures.join('; ')}`);
  check('its body never sinks into a wall while chasing', clipped === 0, `${clipped} runs clipped`);
  check('body radius fits its shoulders (≥ 0.5 m)', ENEMY.bodyRadius >= 0.5);
}

/** A spot where the player can stand but hugging a wall (0.36–0.5 m from it). */
const wallSpot = (): Vec2 => {
  for (;;) {
    const c = cellCenter(cells[Math.floor(rng() * cells.length)]);
    const p = { x: c.x + (rng() - 0.5) * TILE, z: c.z + (rng() - 0.5) * TILE };
    if (!overlapsWall(level, p, 0.36) && overlapsWall(level, p, 0.5)) return p;
  }
};

section('Hunting never puts its body in a wall (0.5.2)');
{
  // Two minutes of patrol / investigate / chase / search with the player popping up and making noise anywhere.
  const e = createEnemy(level);
  const r = createRng(99);
  let player = { pos: randomSpot(), flashlightOn: true, crouching: false };
  let clippedFrames = 0;
  let worst = '';
  for (let i = 0; i < 120 * 60; i++) {
    if (i % 180 === 0) player = { pos: wallSpot(), flashlightOn: rng() < 0.5, crouching: false };
    // Noise right next to a wall is the worst case for where it walks to.
    const noise = i % 90 === 0 ? { pos: { ...player.pos }, radius: 15 } : null;
    const ev = stepEnemy(level, e, { dt: 1 / 60, player, noise, fuses: 0 }, r);
    if (overlapsWall(level, e.pos, ENEMY.bodyRadius - 0.05)) {
      clippedFrames++;
      worst ||= `${e.mode} at (${e.pos.x.toFixed(2)},${e.pos.z.toFixed(2)})`;
    }
    if (ev.includes('caught')) player = { pos: randomSpot(), flashlightOn: true, crouching: false };
  }
  check('2 min of hunting: body never inside a wall', clippedFrames === 0, `${clippedFrames} frames, first: ${worst}`);
}

section('Player body stays out of walls (0.5.2)');
{
  const { BODY_RADIUS, bodyBackOffset, bodyRootFor, limitBodyBack } = await import('../src/engine/playerAnim');
  const { freeBehind } = await import('../src/world/collision');
  check('limitBodyBack pulls the body forward to the room there is', Math.abs(limitBodyBack({ x: 0, z: 0.5 }, { x: 0, z: 0 }, { x: 0, z: -1 }, 0.1).z - 0.1) < 1e-9);
  check('…and leaves it alone when there is room', limitBodyBack({ x: 0, z: 0.5 }, { x: 0, z: 0 }, { x: 0, z: -1 }, 1).z === 0.5);
  // Backed against walls and corners, looking straight down (biggest offset), crouch-lean included.
  let inWall = 0;
  let before = 0;
  for (let i = 0; i < 400; i++) {
    const cam = wallSpot();
    const a = rng() * Math.PI * 2;
    const fwd = { x: Math.sin(a), z: Math.cos(a) };
    const lean = { x: fwd.x * 0.25, z: fwd.z * 0.25 };
    const ideal = bodyRootFor(cam, lean, fwd, bodyBackOffset(-1.45));
    const at = limitBodyBack(ideal, cam, fwd, freeBehind(level, cam, fwd, 1.2, BODY_RADIUS));
    if (overlapsWall(level, ideal, BODY_RADIUS - 0.01)) before++;
    if (overlapsWall(level, at, BODY_RADIUS - 0.01)) inWall++;
  }
  check('looking down with your back to a wall: body never inside it (400 spots)', inWall === 0 && before > 0, `${inWall} inside (was ${before} before the fix)`);
}

section('Menu ambience (0.5.2)');
{
  const { MENU_AMBIENCE, wantsMenuAmbience } = await import('../src/state/menuAudio');
  check('plays on the credit screen / main menu, not during a run', wantsMenuAmbience('menu') && !wantsMenuAmbience('game'));
  check('fades in slowly, out quickly, a bit under the in-game level', MENU_AMBIENCE.fadeIn > MENU_AMBIENCE.fadeOut && MENU_AMBIENCE.gain < 0.7);
}
