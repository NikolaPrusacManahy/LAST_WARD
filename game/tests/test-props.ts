// Update 0.8 — real props in level 1, the new power chain and the breaker panel minigame.
import { existsSync } from 'fs';
import { check, section } from './harness';
import { LEVEL_01 } from '../src/world/content/level01';
import { TILE, cellCenter, dist, isSolid, itemPos, parseLevel, worldToCell } from '../src/world/level';
import { PROPS, PropKind, backedByWall, findProp, placedProps, propBlockers } from '../src/world/props';
import { findTarget } from '../src/world/interact';
import { moveWithCollision } from '../src/world/collision';
import { reachable } from '../src/world/pathfinding';
import { BLOCKER_RADIUS } from '../src/world/collision';
import { PLAYER } from '../src/state/playerRules';
import { FUSES_NEEDED, activateGenerator, createProgress, fixPanel, objectiveText, throwSwitch, tryExit } from '../src/state/objectives';
import { REPAIR, createRepair, repairDone, sparking, stepRepair } from '../src/state/panelRepair';
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
  const panel = findProp(level, 'breaker_box')!;
  const sw = findProp(level, 'power_switch')!;
  const inGenRoom = (v: { x: number; z: number }) => {
    const c = worldToCell(v);
    return c.col >= 9 && c.col <= 15 && c.row >= 7 && c.row <= 9;
  };
  check('breaker panel and power switch are in the generator room', !!panel && !!sw && inGenRoom(panel) && inGenRoom(sw));
  const front = { x: panel.x, z: panel.z + 1 };
  check('standing at the panel, you can reach it', findTarget(level, front, { x: 0, z: -1 }, [])?.type === 'panel');
  const swFront = { x: sw.x, z: sw.z + 1 };
  check('…and the switch next to it', findTarget(level, swFront, { x: 0, z: -1 }, [])?.type === 'switch');
}

section('Power chain: fuses → generator → panel → switch (0.8)');
{
  const p = createProgress();
  check('generator wants fuses first', activateGenerator(p) === 'need-fuses' && !p.fusesIn);
  check('switch is dead with no current', throwSwitch(p) === 'no-current' && !p.powered);
  check('panel can\'t be fixed before the generator runs', !fixPanel(p));
  p.fuses = FUSES_NEEDED;
  check('objective: put them in', objectiveText(p) === 'Fuses found. Put them in the generator.');
  check('fuses go in (no power yet)', activateGenerator(p) === 'fuses-in' && p.fusesIn && !p.powered);
  check('objective: repair the panel', objectiveText(p) === 'Repair the breaker panel.');
  check('still no current at the switch', throwSwitch(p) === 'no-current');
  check('exit still locked', tryExit(p) === 'locked');
  check('panel fixed', fixPanel(p) && p.panelFixed && objectiveText(p) === 'Throw the power switch.');
  check('the switch brings the power back', throwSwitch(p) === 'powered' && p.powered);
  check('exit opens', tryExit(p) === 'escaped');
  const q = { ...createProgress(), fuses: 3, fusesIn: true };
  check('prompt: Hold [icon] to repair the panel', promptFor({ type: 'panel' }, q, false)?.verb === 'repair' && promptFor({ type: 'panel' }, q, false)?.hold === true);
  check('prompt: panel dead before the generator', promptFor({ type: 'panel' }, createProgress(), false)?.verb === null);
  check('prompt: switch needs the panel', promptFor({ type: 'switch' }, q, false)?.verb === null);
  check('prompt: generator running, breaker tripped', promptFor({ type: 'generator' }, q, false)?.info === "Running. The breaker's tripped.");
}

section('Breaker panel minigame (0.8)');
{
  const run = (letGo: boolean, seconds = 60) => {
    const rng = createRng(4);
    let s = createRepair(rng);
    let t = 0;
    const ev: string[] = [];
    let holding = true;
    for (; t < seconds && !repairDone(s); t += 1 / 60) {
      // A careful player lets go 0.3 s into a spark and grabs again.
      if (letGo && sparking(s) && s.warnT > 0.3) holding = false;
      else if (!sparking(s)) holding = true;
      const r = stepRepair(s, 1 / 60, holding, rng);
      s = r.state;
      ev.push(...r.events);
    }
    return { s, t, ev };
  };
  const careful = run(true);
  check('letting go when it sparks: done in about 12 s of work, never shorts', repairDone(careful.s) && !careful.ev.includes('short') && careful.t < REPAIR.seconds + 6, `${careful.t.toFixed(1)} s`);
  check('it sparks a few times along the way', careful.ev.filter((e) => e === 'spark').length >= 2);
  check('working on it makes a little noise now and then', careful.ev.filter((e) => e === 'noise').length >= 5);
  const greedy = run(false, 40);
  check('holding on through the sparks shorts it out (bang)', greedy.ev.includes('short'));
  check('…which costs time', !repairDone(greedy.s) || greedy.t > careful.t + 2);
  // One short: progress drops, dead for a moment.
  const rng = createRng(1);
  let s = { ...createRepair(rng), progress: 0.5, nextSpark: 0.01 };
  s = stepRepair(s, 0.02, true, rng).state;
  check('a spark starts the warning', sparking(s));
  let short = false;
  for (let i = 0; i < 60 && !short; i++) {
    const r = stepRepair(s, 1 / 60, true, rng);
    s = r.state;
    short = r.events.includes('short');
  }
  check(`you get ${REPAIR.warn} s to let go, then it shorts and loses ${REPAIR.setback * 100}%`, short && Math.abs(s.progress - (0.5 + 0.02 / REPAIR.seconds - REPAIR.setback)) < 0.01);
  const before = s.progress;
  s = stepRepair(s, 0.5, true, rng).state;
  check('dead for a moment after a short (no progress)', s.progress === before && s.stun > 0);
  check('nothing happens while you don\'t hold', stepRepair(createRepair(createRng(2)), 1, false, createRng(2)).state.progress === 0);
}

section('Credits (0.8)');
{
  const ids = new Set(CREDITS.map((c) => c.id));
  check('every prop model is credited', (Object.keys(PROPS) as PropKind[]).every((k) => ids.has(PROP_CREDIT[k])));
  check('every CC BY credit has title, author and a source link', CREDITS.filter((c) => c.licence.startsWith('CC BY')).every((c) => c.title && c.author && c.source?.startsWith('https://')));
  check('the hospital room credit names its author (KarolinaGlad)', CREDITS.some((c) => c.title === 'Horror Hospital Room' && c.author === 'KarolinaGlad'));
}
