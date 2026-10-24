// Update 0.8 — real props in level 1, the new power chain and the breaker panel minigame.
import { existsSync } from 'fs';
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { TILE, cellCenter, dist, isSolid, itemPos, parseLevel, worldToCell } from '../src/world/level';
import { PROPS, PropKind, backedByWall, brickLining, panelSpots, panelSwitches, placedProps, propBlockers } from '../src/world/props';
import { findTarget } from '../src/world/interact';
import { moveWithCollision } from '../src/world/collision';
import { reachable } from '../src/world/pathfinding';
import { BLOCKER_RADIUS } from '../src/world/collision';
import { PLAYER } from '../src/state/playerRules';
import { FUSES_NEEDED, PANEL_COUNT, allPanelsOn, createProgress, finishRepair, fitFuse, fusesHeld, objectiveDetail, objectiveText, panelsOn, startGenerator, throwPanelSwitch, tryExit } from '../src/state/objectives';
import { SKILL, cancelCheck, createRepair, judge, needle, stepRepair } from '../src/state/skillCheck';
import { ENEMY, visibility, createEnemy } from '../src/world/enemyAI';
import { promptFor } from '../src/state/prompts';
import { createRng } from '../src/world/rng';
import { CREDITS, PROP_CREDIT } from '../src/state/credits';

const level = parseLevel(LEVEL_01);
const placed = placedProps(level);

section('Props in Ward 13 (0.8)');
{
  check('every prop kind has its model in public/models/props', (Object.keys(PROPS) as PropKind[]).every((k) => existsSync(new URL(`../public/models/props/${k}.glb`, import.meta.url))));
  check('every wall-mounted prop really has a wall behind it', level.props.every((p) => backedByWall(level, p)), level.props.filter((p) => !backedByWall(level, p)).map((p) => `${p.kind}@${p.cell.col},${p.cell.row}`).join(' '));
  const floorProps = placed.filter((p) => PROPS[p.kind].blocks && p.y < 0.5);
  const centreGap = (p: (typeof placed)[0]) => {
    const c = cellCenter(worldToCell(p));
    const dx = Math.max(0, Math.abs(c.x - p.x) - p.hx);
    const dz = Math.max(0, Math.abs(c.z - p.z) - p.hz);
    return Math.hypot(dx, dz);
  };
  const tooClose = floorProps.filter((p) => centreGap(p) < 0.4);
  check('furniture stays off the cell centres (The Patient walks through them)', tooClose.length === 0, tooClose.map((p) => p.kind).join(' '));
  const inWall = floorProps.filter((p) => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const c = worldToCell({ x: p.x + sx * (p.hx - 0.02), z: p.z + sz * (p.hz - 0.02) });
      if (isSolid(level, c.col, c.row)) return true;
    }
    return false;
  });
  check('nothing pokes into a wall', inWall.length === 0, inWall.map((p) => p.kind).join(' '));
  const cabinets = level.items.map((i) => itemPos(level, i.cell));
  const onCabinet = floorProps.filter((p) => cabinets.some((c) => Math.abs(c.x - p.x) < p.hx + BLOCKER_RADIUS && Math.abs(c.z - p.z) < p.hz + BLOCKER_RADIUS));
  check('no prop sits on an item cabinet', onCabinet.length === 0, onCabinet.map((p) => p.kind).join(' '));
  let overlaps = 0;
  for (let i = 0; i < floorProps.length; i++)
    for (let j = i + 1; j < floorProps.length; j++) {
      const a = floorProps[i];
      const b = floorProps[j];
      if (Math.abs(a.x - b.x) < a.hx + b.hx - 0.01 && Math.abs(a.z - b.z) < a.hz + b.hz - 0.01) overlaps++;
    }
  check('props don\'t overlap each other', overlaps === 0, `${overlaps}`);
  // The player can still walk to every cell centre with all the new blockers.
  const blockers = [...cabinets, ...propBlockers(placed)];
  const blockedCentres = reachable(level, level.playerStart);
  let stuck = 0;
  for (const k of blockedCentres) {
    const c = cellCenter({ col: k % level.cols, row: Math.floor(k / level.cols) });
    const nudged = moveWithCollision(level, c, 0.01, 0.01, PLAYER.radius, blockers);
    if (dist(nudged, c) < 0.005) stuck++;
  }
  check('every cell centre is still free to stand in', stuck === 0, `${stuck} blocked`);
  check('the bed you wake up next to is in the start room', dist(placed.find((p) => p.kind === 'hospital_bed')!, cellCenter(level.playerStart)) < 2 * TILE);
  // Update 0.9 — four electrical panels spread round the ward, each with its switch beside it.
  const panels = panelSpots(level);
  const switches = panelSwitches(level);
  check(`${PANEL_COUNT} panels, each with a switch, and ${FUSES_NEEDED} fuses to find`, panels.length === PANEL_COUNT && switches.length === PANEL_COUNT && level.items.filter((i) => i.kind === 'fuse').length === FUSES_NEEDED);
  check('each switch is right next to its panel', panels.every((p, i) => dist(p, switches[i]) < 1.5));
  const quad = new Set(panels.map((p) => `${p.x < (level.cols * TILE) / 2 ? 'W' : 'E'}${p.z < (level.rows * TILE) / 2 ? 'N' : 'S'}`));
  check('one panel in each quarter of the map', quad.size === 4, [...quad].join(' '));
  let minGap = Infinity;
  for (let i = 0; i < panels.length; i++) for (let j = i + 1; j < panels.length; j++) minGap = Math.min(minGap, dist(panels[i], panels[j]));
  check('panels are spread out (≥ 15 m apart)', minGap >= 15, `${minGap.toFixed(1)} m`);
  const genRoom = (v: { x: number; z: number }) => {
    const c = worldToCell(v);
    return c.col >= 9 && c.col <= 15 && c.row >= 7 && c.row <= 9;
  };
  check('no panel left in the generator room', !panels.some(genRoom) && !switches.some(genRoom));
  panels.forEach((p, index) => {
    const n = { x: Math.sin(p.yaw + Math.PI / 2), z: Math.cos(p.yaw + Math.PI / 2) }; // its front
    const at = { x: p.x + n.x, z: p.z + n.z };
    const t = findTarget(level, at, { x: -n.x, z: -n.z }, []);
    check(`panel ${index + 1} can be reached from in front of it`, t?.type === 'panel' && t.index === index);
  });
  // Brick: every wall face of the generator room, nowhere else.
  const lining = brickLining(level);
  check('the generator room is lined with brick on every wall', lining.length >= 18 && lining.every(genRoom), `${lining.length} panels`);
  check('…not on the generator itself', !lining.some((b) => dist(b, cellCenter(level.generator)) < 1.6));
}

section('Panels, generator, exit (0.9)');
{
  const p = createProgress();
  check('four panels to restore', p.panels.length === 4 && objectiveText(p) === 'Restore the electrical panels (0/4)');
  check('no fuse in your pocket: can\'t fit one', fitFuse(p, 0) === 'no-fuse');
  p.fuses = 1;
  check('carrying one', fusesHeld(p) === 1 && objectiveDetail(p) === 'Fuses: 1');
  check('fit it in panel 1', fitFuse(p, 0) === 'fitted' && fusesHeld(p) === 0);
  check('panel 2 has nothing to fit', fitFuse(p, 1) === 'no-fuse');
  check('switch does nothing before the repair', throwPanelSwitch(p, 0) === 'not-ready');
  check('repair finishes', finishRepair(p, 0) && p.panels[0].fixed);
  check('switch on', throwPanelSwitch(p, 0) === 'on' && panelsOn(p) === 1);
  check('objective counts it', objectiveText(p) === 'Restore the electrical panels (1/4)');
  check('generator stays dead with panels left', startGenerator(p) === 'panels');
  p.fuses = 4;
  for (const i of [1, 2, 3]) {
    fitFuse(p, i);
    finishRepair(p, i);
    throwPanelSwitch(p, i);
  }
  check('all four live', allPanelsOn(p) && objectiveText(p) === 'All panels are live. Start the generator.');
  check('exit still locked', tryExit(p) === 'locked');
  check('generator starts: power', startGenerator(p) === 'powered' && p.powered);
  check('exit opens', tryExit(p) === 'escaped');
  const q = { ...createProgress(), fuses: 1 };
  check('prompt: Press [icon] to fit a fuse', promptFor({ type: 'panel', index: 2 }, q, false)?.verb === 'fit a fuse');
  check('prompt: Needs a fuse (empty pockets)', promptFor({ type: 'panel', index: 2 }, createProgress(), false)?.info === 'Needs a fuse.');
  q.panels[2].fuse = true;
  check('prompt: Hold [icon] to repair', promptFor({ type: 'panel', index: 2 }, q, false)?.verb === 'repair' && promptFor({ type: 'panel', index: 2 }, q, false)?.hold === true);
  q.panels[2].fixed = true;
  check('repaired panel points you to its switch', promptFor({ type: 'panel', index: 2 }, q, false)?.verb === null);
}

section('Skill checks (0.9)');
{
  check('needle in the zone: good', judge(0.5 + SKILL.great + 0.01, 0.5) === 'good');
  check('right at the start of the zone: great', judge(0.5 + SKILL.great / 2, 0.5) === 'great');
  check('before or after the zone: miss', judge(0.49, 0.5) === 'miss' && judge(0.5 + SKILL.good + 0.001, 0.5) === 'miss');
  // A player who always hits: about 14 s of work, a few checks along the way.
  const play = (hit: 'great' | 'good' | 'never') => {
    const rng = createRng(5);
    let s = createRepair(rng);
    let progress = 0;
    let now = 0;
    const ev: string[] = [];
    for (; now < 90 && progress < 1; now += 1 / 60) {
      let press = false;
      const f = s.check ? needle(s.check, now) : null;
      if (f !== null && hit !== 'never' && s.check) {
        const target = s.check.zone + (hit === 'great' ? SKILL.great / 2 : SKILL.great + 0.03);
        press = f >= target;
      }
      const r = stepRepair(progress, s, { dt: 1 / 60, now, holding: true, press }, rng);
      progress = r.progress;
      s = r.state;
      ev.push(...r.events);
    }
    return { now, ev, progress };
  };
  const good = play('good');
  check('hitting every check: repaired in about 14 s', good.progress >= 1 && good.now < SKILL.repairSeconds + 6, `${good.now.toFixed(1)} s`);
  check('…with 2–5 skill checks along the way', good.ev.filter((e) => e === 'warn').length >= 2 && good.ev.filter((e) => e === 'warn').length <= 5, `${good.ev.filter((e) => e === 'warn').length}`);
  check('no misses when you hit them', !good.ev.includes('miss'));
  const great = play('great');
  check('perfect hits finish it sooner', great.now < good.now - 0.3, `${great.now.toFixed(1)} vs ${good.now.toFixed(1)} s`);
  const never = play('never');
  check('ignoring the checks: each one blows the panel', never.ev.filter((e) => e === 'miss').length >= 2);
  check('…and it takes much longer', never.progress < 1 || never.now > good.now + 3);
  // One miss in detail.
  const rng = createRng(1);
  let s = { ...createRepair(rng), nextCheck: 0.01 };
  let r = stepRepair(0.5, s, { dt: 0.02, now: 10, holding: true, press: false }, rng);
  check('a warning comes first, then the circle', r.events.includes('warn') && !!r.state.check && needle(r.state.check, 10.1) === null);
  s = r.state;
  const late = s.check!.spinAt + SKILL.spin + 0.01;
  r = stepRepair(r.progress, s, { dt: 0.02, now: late, holding: true, press: false }, rng);
  check(`letting the needle go round is a miss: −${SKILL.missSetback * 100}% and the panel is dead`, r.events.includes('miss') && Math.abs(r.progress - (0.5 + 0.02 / SKILL.repairSeconds - SKILL.missSetback)) < 0.01 && r.state.deadUntil > late);
  const dead = stepRepair(r.progress, r.state, { dt: 0.5, now: late + 0.5, holding: true, press: false }, rng);
  check('no work while it\'s dead', dead.progress === r.progress);
  const early = stepRepair(0.3, { ...createRepair(rng), check: { spinAt: 5, zone: 0.5 } }, { dt: 0.02, now: 4.8, holding: true, press: true }, rng);
  check('pressing before the circle appears is a miss', early.events.includes('miss'));
  const letGo = stepRepair(0.3, { ...createRepair(rng), check: { spinAt: 5, zone: 0.5 } }, { dt: 0.02, now: 5.3, holding: false, press: false }, rng);
  check('letting go of the panel calls the check off (no penalty)', !letGo.state.check && letGo.progress === 0.3 && letGo.events.length === 0);
  check('pausing calls it off too', cancelCheck({ ...createRepair(rng), check: { spinAt: 1, zone: 0.5 } }).check === null);
}

section('Running is easier to spot (0.9)');
{
  const e = createEnemy(level);
  e.pos = cellCenter({ col: 1, row: 5 });
  e.dir = { x: 1, z: 0 };
  const at = (d: number) => ({ x: e.pos.x + d, z: e.pos.z });
  const walkDist = ENEMY.viewDistLight * 0.95 * 1.0;
  const far = ENEMY.viewDistLight * 1.15;
  check('walking at 1.15× its sight range: unseen', visibility(level, e, { pos: at(far), flashlightOn: true, crouching: false }) === 0);
  check('running there: seen (1.3× range)', visibility(level, e, { pos: at(far), flashlightOn: true, crouching: false, running: true }) > 0);
  check('close by, both seen', visibility(level, e, { pos: at(walkDist / 2), flashlightOn: true, crouching: false }) > 0);
}

section('Credits (0.8)');
{
  const ids = new Set(CREDITS.map((c) => c.id));
  check('every prop model is credited', (Object.keys(PROPS) as PropKind[]).every((k) => ids.has(PROP_CREDIT[k])));
  check('every CC BY credit has title, author and a source link', CREDITS.filter((c) => c.licence.startsWith('CC BY')).every((c) => c.title && c.author && c.source?.startsWith('https://')));
  check('the hospital room credit names its author (KarolinaGlad)', CREDITS.some((c) => c.title === 'Horror Hospital Room' && c.author === 'KarolinaGlad'));
}

section('Furniture (0.9.6)');
{
  // No two pieces of furniture standing in each other.
  const solid = placedProps(level).filter((p) => p.y < 0.5 && p.kind !== 'generator');
  const clash: string[] = [];
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i];
      const b = solid[j];
      if (Math.abs(a.x - b.x) < a.hx + b.hx - 0.02 && Math.abs(a.z - b.z) < a.hz + b.hz - 0.02) clash.push(`${a.kind}/${b.kind}@${worldToCell(a).col},${worldToCell(a).row}`);
    }
  check('no two pieces of furniture overlap', clash.length === 0, clash.join(' '));
  const genRoom = placedProps(level).filter((p) => {
    const c = worldToCell(p);
    return c.col >= 9 && c.col <= 15 && c.row >= 7 && c.row <= 9;
  });
  check('the generator room is furnished (10+ pieces besides the brick)', genRoom.length >= 10, `${genRoom.length}`);
}
{
  const tables = level.items.map((it) => itemPos(level, it.cell));
  const solid = placedProps(level).filter((p) => p.y < 0.5 && p.kind !== 'generator');
  const hit = tables.filter((t) => solid.some((p) => Math.abs(t.x - p.x) < p.hx + 0.38 && Math.abs(t.z - p.z) < p.hz + 0.38));
  check('item tables don\'t stand in other furniture', hit.length === 0, hit.map((t) => `${worldToCell(t).col},${worldToCell(t).row}`).join(' '));
}
