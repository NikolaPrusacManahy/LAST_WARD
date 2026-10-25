// Update 0.9.9 — a co-op run: what each player sends, teammates smoothed between updates, the host's noise
// queue, what a catch does, the end of a run, proximity chat, who The Patient hunts and catches, and the
// shared world (items, panels, lockers, power, revives) through the stand-in database.
import { check, section } from './harness';
import {
  DOWN, HARD_CRAWL_BOOST, LiveState, Member, VIEW_DELAY, VOICE, addToTrack, catchOutcome, createTrack, decodeLive, encodeLive, hears, louder, nextWatch,
  runOver, sampleTrack, teamEscaped, voiceDistanceGain, voiceNoiseRadius, watchable,
} from '../src/state/coopRun';
import { Hunted, NOBODY, catchable, pickTarget } from '../src/world/enemyTargets';
import { ENEMY, createEnemy, stepEnemy } from '../src/world/enemyAI';
import { parseLevel, cellCenter, isCorridor } from '../src/world/level';
import { LEVEL_01 } from '../src/world/content/level01';
import { createRng } from '../src/world/rng';
import { MemoryHub } from '../src/net/memoryStore';
import { RunSync } from '../src/net/runSync';
import { CoopClient } from '../src/net/room';
import { parseRoom } from '../src/state/coop';
import { DEFAULT_BINDINGS } from '../src/state/bindings';
import { defaultSave, hydrateSave, mixVolumes } from '../src/state/settings';
import { worldTimeScale } from '../src/state/session';
import { MIMIC, decodeResume, encodeResume, mimicNow, mimicWho, nextMimic } from '../src/state/coopRun';
import { pixelRatioFor } from '../src/state/settings';
import { PING, inCrosshair, pingRay, pingText, snapPing } from '../src/world/ping';
import { HIT, flyProgress, hitBlack, hitCues, hitLids, hitTimes } from '../src/state/hitSequence';
import { caughtTimes } from '../src/state/caughtSequence';
import { DOWN_BREATH_GAIN } from '../src/audio/spatial';
import { readFileSync } from 'fs';
import { askMic, askMicOnce, currentMic, micAnswer, micIfAllowed } from '../src/net/voice';
import { KNEEL, kneelAt, reviveBack, reviveFree } from '../src/state/coopRun';
import { PLAYER } from '../src/state/playerRules';
import { VIEW_DELAY_MAX, easeDelay, stepTrack, targetDelay } from '../src/state/coopRun';
import { catchesYou } from '../src/world/enemyTargets';
import { CRAWL } from '../src/world/enemyAI';
import { PLAY_ONCE } from '../src/engine/playerAnim';

/** player.glb's clips (read in the hit section, checked in the revive one). */
type GlbClips = { animations: { name: string; samplers: { input: number }[] }[]; accessors: { max: number[] }[] };
let reviveClip = null as GlbClips | null;

const live = (over: Partial<LiveState> = {}): LiveState => ({
  pos: { x: 10, z: 7 }, rise: 0, yaw: 1, pitch: 0, gait: 'walk', crouching: false, light: true, hidden: false, sense: { x: 10, z: 7 }, locker: -1,
  hold: null, injured: false, life: 'up', bleed: 0, hit: false, noise: null, t: 0, ...over,
});

section('Co-op run: what you send (0.9.9)');
{
  const s = live({ pos: { x: 12.3456, z: 8.111 }, yaw: -2.71828, gait: 'sprint', hold: 'fuse', injured: true, life: 'down', bleed: 21.4, noise: { pos: { x: 3, z: 4 }, radius: 20, lure: true, seq: 7 }, t: 5.5 });
  const back = decodeLive(JSON.parse(JSON.stringify(encodeLive(s))))!;
  check('round trip: where, facing, gait, what you hold, hurt, down', Math.abs(back.pos.x - 12.35) < 1e-9 && Math.abs(back.yaw + 2.718) < 1e-9 && back.gait === 'sprint' && back.hold === 'fuse' && back.injured && back.life === 'down');
  check('the noise keeps what kind it is', back.noise?.lure === true && !back.noise.run && !back.noise.step && back.noise.seq === 7 && back.noise.radius === 20);
  check('no noise is a 0, not null (null would delete the field)', encodeLive(live()).n === 0 && decodeLive(encodeLive(live()))!.noise === null);
  check('small: under 300 characters', JSON.stringify(encodeLive(s)).length < 300, `${JSON.stringify(encodeLive(s)).length}`);
  check('junk is nothing', decodeLive(null) === null && decodeLive({ x: 'a' }) === null);
  check('odd values fall back (gait, life, hold)', (() => {
    const d = decodeLive({ x: 1, z: 2, g: 9, s: 'zombie', h: 'gun' })!;
    return d.gait === 'idle' && d.life === 'up' && d.hold === null && d.locker === -1;
  })());
}

section('Co-op run: teammates between updates (0.9.9)');
{
  const tr = createTrack();
  // Their clock runs 100 s behind ours; updates every 0.1 s, arriving 50 ms after they're sent.
  for (let i = 0; i <= 10; i++) addToTrack(tr, live({ pos: { x: i, z: 0 }, yaw: i < 5 ? 3.1 : -3.1, t: i * 0.1 }), 100 + i * 0.1 + 0.05);
  check('their clock is worked out', Math.abs(tr.offset - 100.05) < 1e-9);
  const mid = sampleTrack(tr, 100.05 + 0.55 + VIEW_DELAY)!;
  check('drawn a little in the past, blended between two updates', Math.abs(mid.pos.x - 5.5) < 1e-6, `${mid.pos.x}`);
  const turn = sampleTrack(tr, 100.05 + 0.45 + VIEW_DELAY)!;
  check('turning through ±π takes the short way', Math.abs(Math.abs(turn.yaw) - Math.PI) < 0.1, `${turn.yaw}`);
  check('before the first update: held there', sampleTrack(tr, 0)!.pos.x === 0);
  check('past the last: held there (no guessing ahead)', sampleTrack(tr, 1000)!.pos.x === 10);
  addToTrack(tr, live({ pos: { x: 99, z: 0 }, life: 'down', t: 0.5 }), 200);
  check('a late update changes the facts, not the time', tr.snaps[tr.snaps.length - 1].life === 'down' && tr.snaps[tr.snaps.length - 1].t === 1);
  check('…nor where they are (0.9.9: it moved them back)', tr.snaps[tr.snaps.length - 1].pos.x === 10);
}

section('Co-op run: a bad connection (0.9.9, after Nikola\'s co-op test)');
{
  // They run at 5 m/s and send ten times a second; the updates arrive in order but late: 50 ms, plus up to
  // 300 ms more at random. We draw sixty times a second.
  const feed = (adaptive: boolean) => {
    const tr = createTrack();
    const rng = createRng(7);
    let arrive = 0;
    const queue: { at: number; t: number }[] = [];
    for (let i = 0; i < 300; i++) {
      const t = i * 0.1;
      arrive = Math.max(arrive, t + 0.05 + rng() * rng() * 0.3);
      queue.push({ at: 1000 + arrive, t });
    }
    let held = 0;
    let frames = 0;
    let back = 0;
    let prev = -Infinity;
    for (let now = 1000; now < 1029; now += 1 / 60) {
      while (queue.length && queue[0].at <= now) {
        const u = queue.shift()!;
        addToTrack(tr, live({ pos: { x: u.t * 5, z: 0 }, t: u.t }), u.at);
      }
      if (adaptive) stepTrack(tr, 1 / 60);
      const x = sampleTrack(tr, now, adaptive ? tr.delay : VIEW_DELAY)?.pos.x;
      if (x === undefined || now < 1005) {
        prev = x ?? prev;
        continue;
      }
      frames++;
      if (x < prev - 1e-9) back++;
      if (Math.abs(x - prev) < 1e-9) held++;
      prev = x;
    }
    return { held: held / frames, back, delay: tr.delay };
  };
  const fixed = feed(false);
  const smooth = feed(true);
  check('the old fixed 0.15 s: they kept stopping, then jumping', fixed.held > 0.15, `${(fixed.held * 100).toFixed(0)}% of frames standing still`);
  check('now: drawn a little further back, they keep moving', smooth.held < 0.03 && smooth.held < fixed.held / 5, `${(smooth.held * 100).toFixed(1)}% standing still, ${smooth.delay.toFixed(2)} s behind`);
  check('…and never move backwards', smooth.back === 0);
  check('a good connection stays at 0.15 s; a bad one at most 0.5 s', Math.abs(targetDelay([0.01, 0.02, 0.01, 0.0, 0.02, 0.01]) - VIEW_DELAY) < 0.001 && targetDelay(Array(20).fill(2)) === VIEW_DELAY_MAX && VIEW_DELAY_MAX <= 0.5);
  check('the delay changes slowly (no jump in what you see): up 0.25 s a second, down 0.05', Math.abs(easeDelay(0.15, 0.5, 0.1) - 0.175) < 1e-9 && Math.abs(easeDelay(0.5, 0.15, 0.1) - 0.495) < 1e-9);
  // They rejoin: their game starts again, its clock from zero.
  const tr = createTrack();
  for (let i = 0; i <= 50; i++) addToTrack(tr, live({ pos: { x: i, z: 0 }, t: 600 + i * 0.1 }), 2000 + i * 0.1);
  for (let i = 0; i <= 5; i++) addToTrack(tr, live({ pos: { x: 100 + i, z: 0 }, t: 3 + i * 0.1 }), 2010 + i * 0.1);
  const after = sampleTrack(tr, 2010 + 0.25 + VIEW_DELAY)!;
  check('a teammate rejoins (their clock starts again): smoothed again at once', tr.snaps.length === 6 && Math.abs(after.pos.x - 102.5) < 1e-6, `${after.pos.x}`);
}

section('Co-op run: your catch is decided on your screen (0.9.9)');
{
  const e = createEnemy(parseLevel(LEVEL_01));
  e.pos = { x: 10, z: 7 };
  const you = (x: number, hidden = false) => ({ pos: { x, z: 7 }, flashlightOn: true, crouching: false, hidden });
  check('The Patient you see reaches you: caught', catchesYou(e, false, you(10.8)));
  check('still a step off on your screen: not caught (the host\'s older picture of you no longer counts)', !catchesYou(e, false, you(10 + ENEMY.catchRadius + 0.3)));
  check('in a locker it didn\'t see you get into: no', !catchesYou(e, false, you(10.5, true)));
  check('while it holds someone else: no', !catchesYou(e, true, you(10.5)));
  e.crawl = { phase: 'on', t: 1, left: CRAWL.minSeconds, then: 'patrol', noise: null };
  check('from the ceiling: no', !catchesYou(e, false, you(10.5)));
}

section('Co-op run: the host hears everyone (0.9.9)');
{
  const step = { pos: { x: 0, z: 0 }, radius: 12, step: true };
  const thing = { pos: { x: 0, z: 0 }, radius: 8 };
  const brick = { pos: { x: 0, z: 0 }, radius: 20, lure: true };
  const bang = { pos: { x: 0, z: 0 }, radius: 4, run: true };
  check('a blown panel beats a thrown brick beats a noise beats footsteps', louder(louder(louder(step, thing), brick), bang) === bang && louder(step, thing) === thing && louder(thing, brick) === brick);
  check('same kind: the louder one', louder(step, { ...step, radius: 18 })!.radius === 18);
  check('nothing and something: the something', louder(null, step) === step && louder(step, null) === step);
}

section('Co-op run: what a catch does (0.9.9)');
{
  check('solo: thrown with a life to spare, else dead', catchOutcome(2, null) === 'thrown' && catchOutcome(1, null) === 'dead');
  check('co-op Normal: thrown, then down (a friend can get you up)', catchOutcome(2, 'normal') === 'thrown' && catchOutcome(1, 'normal') === 'down');
  check('co-op Hard: one life, no getting up', catchOutcome(1, 'hard') === 'dead');
  check('down: a minute to be got up, a 5 s revive from close by, crawling slowly', DOWN.bleedSeconds === 60 && DOWN.reviveSeconds === 5 && DOWN.reach < 2.5 && DOWN.crawlSpeed < 1);
  check('Hard climbs the ceilings twice as often', HARD_CRAWL_BOOST === 2);
}

section('Co-op run: who is still in it (0.9.9)');
{
  const m = (id: string, life: Member['life']): Member => ({ id, name: id, life });
  check('someone still on their feet: not over', !runOver([m('a', 'out'), m('b', 'up')]));
  check('someone down (could still be got up): not over', !runOver([m('a', 'escaped'), m('b', 'down')]));
  check('everyone taken, out or gone: over', runOver([m('a', 'out'), m('b', 'escaped'), m('c', 'left')]));
  check('a win if any of you got out', teamEscaped([m('a', 'out'), m('b', 'escaped')]) && !teamEscaped([m('a', 'out'), m('b', 'left')]));
  const team = [m('a', 'out'), m('b', 'up'), m('c', 'down'), m('d', 'escaped')];
  const ids = watchable(team, 'a');
  check('once out you watch whoever is still in it', ids.join() === 'b,c');
  check('click: the next one, round and round', nextWatch(ids, 'b') === 'c' && nextWatch(ids, 'c') === 'b' && nextWatch(ids, 'gone') === 'b' && nextWatch([], 'b') === null);
}

section('Co-op run: proximity chat (0.9.9)');
{
  check('quiet talk: no noise', voiceNoiseRadius(-50) === 0 && voiceNoiseRadius(-100) === 0);
  check('talking out loud carries; shouting carries far', voiceNoiseRadius(VOICE.quietDb) === VOICE.minRadius && voiceNoiseRadius(0) === VOICE.maxRadius && voiceNoiseRadius(-22) > VOICE.minRadius);
  check('heard: full close up, fading out, gone far away', voiceDistanceGain(5) === 1 && voiceDistanceGain(21) > 0 && voiceDistanceGain(21) < 1 && voiceDistanceGain(40) === 0);
  check('the living hear the living, not the out', hears('up', 'down') && hears('down', 'up') && !hears('up', 'out') && !hears('up', 'escaped'));
  check('the out hear everyone', hears('out', 'up') && hears('escaped', 'out'));
}

section('Co-op run: one Patient, three of you (0.9.9)');
{
  const level = parseLevel(LEVEL_01);
  const e = createEnemy(level);
  e.pos = cellCenter({ col: 10, row: 5 });
  e.dir = { x: 1, z: 0 }; // looking east along the top hall
  const sense = (x: number, hidden = false) => ({ pos: { x, z: e.pos.z }, flashlightOn: true, crouching: false, hidden, facing: { x: -1, z: 0 }, beam: false });
  const ahead: Hunted = { id: 'ahead', sense: sense(e.pos.x + 6) };
  const behind: Hunted = { id: 'behind', sense: sense(e.pos.x - 3) };
  check('nobody to hunt: nothing', pickTarget(level, e, [], null) === null);
  check('it goes for the one it can see, not the one behind it', pickTarget(level, e, [behind, ahead], null)?.id === 'ahead');
  e.mode = 'chase';
  check('chasing someone it still sees: stays on them', pickTarget(level, e, [ahead, { id: 'near', sense: sense(e.pos.x + 2) }], 'ahead')?.id === 'ahead');
  check('chasing someone it lost while another is in view: the one in view', pickTarget(level, e, [behind, ahead], 'behind')?.id === 'ahead');
  check('nobody in view: the nearest', pickTarget(level, e, [behind, { id: 'far', sense: sense(e.pos.x - 9) }], null)?.id === 'behind');
  const close: Hunted = { id: 'close', sense: sense(e.pos.x + ENEMY.catchRadius * 0.5) };
  const hid: Hunted = { id: 'hid', sense: sense(e.pos.x - ENEMY.catchRadius * 0.5, true) };
  check('catches anyone in reach, not just who it hunts; not the hidden', catchable(e, [ahead, close, hid]).join() === 'close');
  e.crawl = { phase: 'on', t: 1, left: 5, then: 'patrol', noise: null };
  check('nobody from the ceiling', catchable(e, [close]).length === 0);
  check('"nobody" is somewhere it can never see or catch', NOBODY.hidden === true);

  // Co-op Hard: up on the ceiling about twice as soon on average.
  const firstCrawl = (boost: number, seed: number) => {
    const rng = createRng(seed);
    const en = createEnemy(level);
    en.pos = cellCenter({ col: 4, row: 11 });
    en.home = { col: 4, row: 11 };
    en.crawlCooldown = 0;
    for (let t = 0; t < 120; t += 0.05) {
      const ev = stepEnemy(level, en, { dt: 0.05, player: NOBODY, noise: null, fuses: 0, crawlBoost: boost }, rng);
      if (ev.includes('crawlUp')) return t;
    }
    return 120;
  };
  let a = 0;
  let b = 0;
  for (let k = 1; k <= 40; k++) {
    a += firstCrawl(1, k);
    b += firstCrawl(HARD_CRAWL_BOOST, k);
  }
  check('co-op Hard: up on the ceiling sooner', b < a * 0.75, `${(a / 40).toFixed(1)} s → ${(b / 40).toFixed(1)} s on average`);
  check('(it patrols the corridors there)', isCorridor(level, { col: 4, row: 11 }));
}

section('Co-op run: the shared ward (0.9.9)');
{
  const hub = new MemoryHub();
  const hs = hub.connect('host');
  const gs = hub.connect('guest');
  // A room the two of them are in (the rules let only room players write the run).
  await hs.set('rooms/K7Q2M', { host: 'host', status: 'playing', players: { host: { name: 'H', slot: 0 }, guest: { name: 'G', slot: 1 } } });
  const host = new RunSync(hs, 'K7Q2M', 'host', true);
  const guest = new RunSync(gs, 'K7Q2M', 'guest', false);
  const seen = { live: [] as string[], items: [] as string[], panels: [] as string[], lockers: [] as string[], power: [] as string[], revive: [] as string[], enemy: 0, pings: [] as string[] };
  const handlers = (who: string) => ({
    live: (id: string, s: LiveState | null) => seen.live.push(`${who}<${id}:${s ? s.life : 'gone'}`),
    item: (id: number, it: { s: string; by?: string } | null) => seen.items.push(`${who}<${id}:${it?.s}:${it?.by ?? ''}`),
    panel: (i: number, p: unknown) => seen.panels.push(`${who}<${i}:${JSON.stringify(p)}`),
    locker: (i: number, by: string | null) => seen.lockers.push(`${who}<${i}:${by}`),
    power: (p: { by: string }) => seen.power.push(`${who}<${p.by}`),
    revive: (id: string, r: { by: string; d?: 1 } | null) => seen.revive.push(`${who}<${id}:${r ? r.by + (r.d ? ':done' : '') : 'stop'}`),
    enemy: () => seen.enemy++,
    ping: (id: string, m: { kind: string; label: string }) => seen.pings.push(`${who}<${id}:${m.kind}:${m.label}`),
  });
  host.start(handlers('h'));
  guest.start(handlers('g'));
  guest.publish(live({ life: 'up', t: 1 }));
  check("each sees the other's live state, not their own", seen.live.includes('h<guest:up') && !seen.live.some((x) => x.startsWith('g<guest')));
  const [a1, a2] = await Promise.all([host.takeItem(1000, 0), guest.takeItem(1000, 0)]);
  check('two grab the same fuse: one gets it', a1 !== a2 && seen.items.some((x) => x.startsWith('g<1000:held:host')));
  guest.putItem(1000, { s: 'ground', x: 1, y: 0, z: 2, w: 0, th: 0, f: 1 });
  check('dropped: everyone sees it lying there', seen.items.includes('h<1000:ground:'));
  check('lying there: anyone can pick it up', await guest.takeItem(1000, 0));
  check('one per locker', (await host.claimLocker(3)) && !(await guest.claimLocker(3)) && seen.lockers.includes('g<3:host'));
  host.leaveLocker(3);
  check('out of it: free again', seen.lockers.includes('g<3:null') && (await guest.claimLocker(3)));
  guest.leaveLocker(3);
  host.leaveLocker(3); // (not the host's: nothing happens)
  check('one at a time on a panel', (await guest.claimPanel(2)) && !(await host.claimPanel(2)));
  guest.repairProgress(2, 0.456);
  guest.bang(2);
  guest.releasePanel(2, 0.3);
  check('the others see its progress, its bangs, and when it is free', seen.panels.some((x) => x.startsWith('h<2:') && x.includes('"bg":1')) && (await host.claimPanel(2)));
  host.fixPanel(2);
  host.switchPanel(2);
  check('fixed and on, for everyone', seen.panels.some((x) => x.startsWith('g<2:') && x.includes('"fx":1') && x.includes('"on":1')));
  guest.power(5, 6);
  host.power(1, 1);
  check('the generator: the first one counts, everyone hears it', seen.power.includes('h<guest') && !seen.power.includes('h<host') && seen.power.includes('g<guest'));
  host.revive('guest', false);
  host.stopRevive('guest');
  host.revive('guest', false);
  host.revive('guest', true);
  check('a revive: started, stopped, started, done', ['g<guest:host', 'g<guest:stop', 'g<guest:host:done'].every((x) => seen.revive.includes(x)));
  guest.clearRevive();
  host.publishEnemy({ x: 1, z: 2, dx: 1, dz: 0, m: 'patrol', w: 0, cr: 0, ck: 0, hold: 0, ev: [], t: 1 });
  guest.publishEnemy({ x: 9, z: 9, dx: 1, dz: 0, m: 'chase', w: 0, cr: 0, ck: 0, hold: 0, ev: [], t: 2 });
  check('only the host sends The Patient', seen.enemy === 1);
  guest.revive('host', false);
  host.cleanUpAfter('guest', { x: 4, z: 4 }, [], [], [], ['host']);
  check("someone leaves while getting you up: you're free again (your clock runs, you can crawl)", (await hs.get('rooms/K7Q2M/run/rv/host')) == null && seen.revive.includes('h<host:stop'));
  guest.revive('host', true);
  host.cleanUpAfter('guest', { x: 4, z: 4 }, [], [], [], ['host']);
  check("…but if they'd finished, you still get up", !!(await hs.get('rooms/K7Q2M/run/rv/host')));
  host.clearRevive();
  await host.takeItem(1001, 0);
  host.cleanUpAfter('guest', { x: 4, z: 4 }, [{ id: 1000, th: 0 }], [], []);
  check('someone leaves holding a fuse: it lands where they were', seen.items.includes('g<1000:ground:'));
  guest.ping({ kind: 'item', label: 'Fuse', pos: { x: 3, y: 0.8, z: 4 } });
  host.ping({ kind: 'enemy', label: "It's here!", pos: { x: 9, y: 1.6, z: 9 } });
  check('a ping (F) reaches the others, not yourself', seen.pings.includes('h<guest:item:Fuse') && seen.pings.includes("g<host:enemy:It's here!") && !seen.pings.some((x) => x.startsWith('g<guest') || x.startsWith('h<host')));
  guest.ping({ kind: 'item', label: 'Fuse', pos: { x: 3, y: 0.8, z: 4 } });
  check('the same ping again shows again', seen.pings.filter((x) => x === 'h<guest:item:Fuse').length === 2);
  guest.saveResume({ pos: { x: 12.345, z: 6 }, yaw: 1.2, lives: 1, injured: true, life: 'down', bleed: 41.3 });
  const back = await guest.loadResume();
  check('rejoining: where you were and how, saved', !!back && Math.abs(back.pos.x - 12.35) < 1e-9 && back.lives === 1 && back.injured && back.life === 'down' && back.bleed === 42);
  gs.close();
  check('a player dropping off: gone from the run for the others', seen.live.includes('h<guest:gone'));
  check('…but what they saved stays (to rejoin)', !!(await hs.get('rooms/K7Q2M/run/sv/guest')));
}

section('Co-op run: lobby options and settings (0.9.9)');
{
  check('"Enemy can hear you talk" needs proximity chat', parseRoom('K7Q2M', { host: 'a', voice: false, hear: true })!.hear === false && parseRoom('K7Q2M', { host: 'a', voice: true, hear: true })!.hear);
  const hub = new MemoryHub();
  const ann = new CoopClient(async () => hub.connect('a'), createRng(1), false);
  const bo = new CoopClient(async () => hub.connect('b'), createRng(2), false);
  await ann.create('Ann', 'normal');
  const code = ann.getSnapshot().room!.code;
  check('a new room: proximity chat on, it doesn\'t hear you talk', ann.getSnapshot().room!.voice && !ann.getSnapshot().room!.hear);
  await bo.join(code, 'Bo');
  await bo.setOptions({ voice: false });
  check('only the host changes them', bo.getSnapshot().room!.voice);
  await ann.setOptions({ hear: true });
  check('the host ticks "Enemy can hear you talk": everyone sees it', bo.getSnapshot().room!.hear);
  await ann.setOptions({ voice: false });
  check('chat off: hearing goes off with it', !bo.getSnapshot().room!.voice && !bo.getSnapshot().room!.hear);
  check('V mutes your microphone', DEFAULT_BINDINGS.mute === 'KeyV');
  check('a voice chat volume, full by default (old saves too)', defaultSave().settings.voiceVolume === 1 && hydrateSave({ settings: {} }).settings.voiceVolume === 1 && mixVolumes({ volume: 1, sfxVolume: 1, bgmVolume: 1, voiceVolume: 0.4 }).voice === 0.4);
  check('a note pauses the ward solo, not in co-op', worldTimeScale('reading') === 0 && worldTimeScale('reading', true) === 1);
}

section('Hit on your last life: sent flying (0.9.9)');
{
  // Its blow lands when its attack clip reaches the measured contact (hands furthest forward, chest high).
  check('the blow lands 0.87 s after the catch (its clip from 0.55 s to the contact at 1.42 s)', Math.abs(hitTimes.hitAt - (HIT.contactClip - HIT.clipFrom) / HIT.clipSpeed) < 1e-9 && Math.abs(hitTimes.hitAt - 0.87) < 1e-9);
  check('the contact is between its fastest swing (1.30 s) and its furthest reach (1.47 s)', HIT.contactClip >= 1.3 && HIT.contactClip <= 1.47);
  check('you hit the floor as your clip does (0.83 s after the blow)', Math.abs(hitTimes.landAt - hitTimes.hitAt - HIT.landClip) < 1e-9);
  const order: string[] = [];
  let prev = -1;
  for (let t = 0; t <= 5; t += 0.01) {
    order.push(...hitCues(prev, t, false));
    prev = t;
  }
  check('dead: the blow, the slam, the end, once each', order.join() === 'hit,land,done', order.join());
  prev = -1;
  const downOrder: string[] = [];
  for (let t = 0; t <= 5; t += 0.01) {
    downOrder.push(...hitCues(prev, t, true).filter((c) => c === 'done' && t < hitTimes.endDead));
    prev = t;
  }
  check('down: it ends sooner (you come to on the floor)', downOrder.length === 1 && hitTimes.endDown < hitTimes.endDead);
  check('you stand until the blow, then fly back, fast at first', flyProgress(hitTimes.hitAt - 0.1) === 0 && flyProgress(hitTimes.hitAt + HIT.landClip / 2) > 0.6 && flyProgress(hitTimes.landAt) === 1);
  let mono = true;
  for (let t = 0; t < 3; t += 0.02) if (flyProgress(t + 0.02) < flyProgress(t)) mono = false;
  check('and never back the other way', mono);
  check('eyes open until you\'re on the floor; dead: they shut and it goes black', hitLids(hitTimes.landAt, false) === 0 && hitLids(hitTimes.endDead, false) === 1 && hitBlack(hitTimes.endDead, false) > 0.999 && hitBlack(hitTimes.landAt, false) === 0);
  check('down: they don\'t shut all the way, no black', hitLids(hitTimes.endDown, true) < 1 && hitBlack(5, true) === 0);
  check('it flies you a good way, not across the map', HIT.flyMax >= 3 && HIT.flyMax <= 6 && HIT.reach > 0.5 && HIT.reach < 1.2);
  check('co-op: it\'s gone soon after you land', hitTimes.holdFor > hitTimes.landAt && hitTimes.holdFor < caughtTimes.teleportAt);
  const glb = readFileSync(new URL('../public/models/player.glb', import.meta.url));
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as { animations: { name: string }[] };
  const names = json.animations.map((a) => a.name);
  reviveClip = json as unknown as GlbClips;
  check('player.glb has the flight, the crawl and the slump', ['hitFly', 'crawl', 'proneDeath'].every((n) => names.includes(n)), names.join(' '));
  check('…and kept all its old clips', ['idle', 'walk', 'run', 'crouch', 'thrown', 'getUp', 'injuredIdle'].every((n) => names.includes(n)));
  check('the hit flag goes out with your state', decodeLive(encodeLive(live({ life: 'caught', hit: true })))!.hit && !decodeLive(encodeLive(live()))!.hit);
  check('heavy breathing while down: half its level', DOWN_BREATH_GAIN === 0.5);
}

section('Getting someone up: on one knee beside them (0.9.9)');
{
  const near = (a: { x: number; z: number }, b: { x: number; z: number }, e = 1e-9) => Math.hypot(a.x - b.x, a.z - b.z) < e;
  // The middle of the revive clip's hands, from where you kneel and the way you face.
  const hands = (k: { pos: { x: number; z: number }; yaw: number }) => ({
    x: k.pos.x - Math.sin(k.yaw) * KNEEL.ahead + Math.cos(k.yaw) * KNEEL.right,
    z: k.pos.z - Math.cos(k.yaw) * KNEEL.ahead - Math.sin(k.yaw) * KNEEL.right,
  });
  const down = { pos: { x: 10, z: 6 }, yaw: -1.8 };
  const back = reviveBack(down);
  check('their back: a little ahead of where they lie, the way they face', near(back, { x: down.pos.x - Math.sin(down.yaw) * KNEEL.back, z: down.pos.z - Math.cos(down.yaw) * KNEEL.back }) && KNEEL.back > 0 && KNEEL.back < 0.3);
  const theirRight = { x: Math.cos(down.yaw), z: -Math.sin(down.yaw) };
  let allOn = true;
  let square = true;
  let ownSide = true;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    const from = { x: back.x + Math.sin(a) * 1.5, z: back.z + Math.cos(a) * 1.5 };
    const k = kneelAt(from, down);
    if (!near(hands(k), back, 1e-6)) allOn = false;
    const f = { x: -Math.sin(k.yaw), z: -Math.cos(k.yaw) };
    if (Math.abs(f.x * -Math.sin(down.yaw) + f.z * -Math.cos(down.yaw)) > 1e-9) square = false;
    const mine = (from.x - back.x) * theirRight.x + (from.z - back.z) * theirRight.z;
    const spot = (k.pos.x - back.x) * theirRight.x + (k.pos.z - back.z) * theirRight.z;
    if (Math.abs(mine) > 0.01 && Math.sign(mine) !== Math.sign(spot)) ownSide = false;
  }
  check('from whichever way you come, your hands land on their back', allOn);
  check('…kneeling square to them (at their side, not their head or feet)', square);
  check('…on the side you came from', ownSide);
  const flipped = kneelAt({ x: back.x + theirRight.x, z: back.z + theirRight.z }, down, true);
  check('…or round the other side (yours up against a wall), hands still on their back', near(hands(flipped), back, 1e-6) && (flipped.pos.x - back.x) * theirRight.x + (flipped.pos.z - back.z) * theirRight.z < 0);
  check('your eyes: lower than crouching, out over your hands; you shuffle over quickly', KNEEL.eye < PLAYER.crouchEyeHeight && KNEEL.eye > 0.8 && KNEEL.eyeAhead > 0 && KNEEL.eyeAhead < KNEEL.ahead && KNEEL.shuffle >= 1.5 && KNEEL.fade > 0.1 && KNEEL.fade < 0.6);
  check('nobody on them: you can start', reviveFree(undefined, 'me', false));
  check('your own revive: you carry on', reviveFree({ by: 'me' }, 'me', true));
  check('done (they\'re on their way up): nobody starts again, it would undo it', !reviveFree({ by: 'me', d: 1 }, 'me', true) && !reviveFree({ by: 'ann', d: 1 }, 'me', false));
  check('someone else on their feet is on them: not you too', !reviveFree({ by: 'ann' }, 'me', true));
  check('…but if they were caught or left mid-way, you can take over', reviveFree({ by: 'ann' }, 'me', false));
  check('the revive clip plays once and holds (it doesn\'t loop)', PLAY_ONCE.includes('revive'));
  const rv = reviveClip?.animations.find((a) => a.name === 'revive');
  const len = rv ? Math.max(...rv.samplers.map((x) => reviveClip!.accessors[x.input].max[0])) : 0;
  check('player.glb has it, longer than the 5 s it takes (it never runs out mid-revive)', len > DOWN.reviveSeconds && len < 10, len.toFixed(2));
}

section('The stand-in between tabs: one write at a time (0.9.9)');
{
  // Two tabs each rewriting the whole tree lost each other's writes (a voice handshake, a fuse). With an
  // `exclusive` backing (the Web Locks API in a browser) each read-change-write waits its turn.
  let tree: Record<string, unknown> = {};
  let queue = Promise.resolve();
  const slow = {
    load: () => JSON.parse(JSON.stringify(tree)),
    save: (t: Record<string, unknown>) => (tree = t),
    onChange: () => () => {},
    exclusive: <T>(fn: () => T) => {
      const run = queue.then(() => new Promise<T>((r) => setTimeout(() => r(fn()), 1)));
      queue = run.then(() => undefined);
      return run;
    },
  };
  const hub = new MemoryHub(slow);
  const a = hub.connect('a');
  const b = hub.connect('b');
  await Promise.all([a.set('rooms/R/run/p/a', { x: 1 }), b.set('rooms/R/rtc/a/b', { o: 'offer' }), a.set('rooms/R/run/p/a', { x: 2 }), b.set('rooms/R/rtc/a/b/c/0', 'cand')]);
  const r = (await a.get('rooms/R')) as { run: { p: { a: { x: number } } }; rtc: { a: { b: { o: string; c: Record<string, string> } } } };
  check('writes from both land, none lost', r.run.p.a.x === 2 && r.rtc.a.b.o === 'offer' && r.rtc.a.b.c['0'] === 'cand');
  const wins = await Promise.all([a.claim('rooms/R/lk/1', 'a'), b.claim('rooms/R/lk/1', 'b')]);
  check('two claims at once: exactly one wins', wins.filter(Boolean).length === 1);
}

section('Rejoining a run (0.9.9)');
{
  check('saved mid-throw: back on your feet (never stuck in its hands)', decodeResume(encodeResume({ pos: { x: 1, z: 2 }, yaw: 0, lives: 1, injured: true, life: 'caught', bleed: 0 }))!.life === 'up');
  check('junk: no saved state', decodeResume(null) === null && decodeResume({ x: 'a' }) === null);
  check('lives stay 0–2', decodeResume({ x: 1, z: 1, lv: 9 })!.lives === 2 && decodeResume({ x: 1, z: 1, lv: -3 })!.lives === 0);
  // The room keeps you once the run is on: a reload or a dropped connection, and you can come back in.
  let clock = 0;
  const hub = new MemoryHub(undefined, () => clock);
  const host = new CoopClient(async () => hub.connect('h'), createRng(1), false);
  let guestStore = hub.connect('g');
  const guest = new CoopClient(async () => guestStore, createRng(2), false);
  await host.create('Host', 'normal');
  const code = host.getSnapshot().room!.code;
  await guest.join(code, 'Guest');
  await host.setReady(true);
  await guest.setReady(true);
  clock += 3000;
  host.tick();
  check('(the run started)', guest.startInfo() !== null);
  guest.close(); // the tab reloads
  check('dropped out mid-run: your place in the room stays', host.getSnapshot().room!.players.some((p) => p.id === 'g'));
  guestStore = hub.connect('g');
  const again = new CoopClient(async () => guestStore, createRng(3), false);
  check('the same player again: back in the run', (await again.join(code, 'Guest')) && again.startInfo() !== null && again.startInfo()!.slot === 1);
  const fresh = new CoopClient(async () => hub.connect('x'), createRng(4), false);
  check("someone new still can't join a run that started", !(await fresh.join(code, 'New')));
  await again.leave();
  check('leaving on purpose: your place goes', !host.getSnapshot().room!.players.some((p) => p.id === 'g'));
}

section('Pings (0.9.9)');
{
  const level = parseLevel(LEVEL_01);
  const eye = { x: 10.5, y: 1.6, z: 7.5 };
  const atWall = pingRay(level, eye, { x: 0, y: 0, z: -1 });
  check("looking at a wall: the ping is on it (the spawn room's north wall, z = 3)", atWall.z >= 3 && atWall.z < 3.2, `${atWall.z.toFixed(2)}`);
  const atFloor = pingRay(level, eye, { x: 0, y: -1, z: 0.3 });
  check('looking at the floor: on the floor', atFloor.y < 0.1 && atFloor.z > 7.5);
  check('aim near a thing: that thing', snapPing({ x: 1, y: 1, z: 1 }, [{ pos: { x: 1.5, y: 0.8, z: 1.2 }, label: 'Fuse' }, { pos: { x: 5, y: 1, z: 5 }, label: 'Locker' }])?.label === 'Fuse');
  check('nothing near: just the spot', snapPing({ x: 1, y: 1, z: 1 }, [{ pos: { x: 5, y: 1, z: 5 }, label: 'Locker' }]) === null);
  check('The Patient in your crosshair (or close to it)', inCrosshair({ x: 0, y: 0, z: -1 }, { x: 0.5, y: 0, z: -10 }) && !inCrosshair({ x: 0, y: 0, z: -1 }, { x: 5, y: 0, z: -10 }));
  check('the marker says who, what and how far', pingText('Fuse', 12.4, 'Ann') === 'Ann · Fuse · 12 m' && pingText('Here', 3, null) === 'Here · 3 m');
  check('F pings', DEFAULT_BINDINGS.ping === 'KeyF');
  check('a marker for a few seconds, not spam', PING.seconds >= 4 && PING.every >= 0.5);
}

section('The mimic (0.9.9)');
{
  check('"It mimics your voices" needs proximity chat', parseRoom('K7Q2M', { host: 'a', voice: false, mimic: true })!.mimic === false && parseRoom('K7Q2M', { host: 'a', voice: true, mimic: true })!.mimic);
  check('it only mimics while it prowls: not in a chase, not on the ceiling, not holding one of you', mimicNow('patrol', false, false) && mimicNow('search', false, false) && !mimicNow('chase', false, false) && !mimicNow('patrol', true, false) && !mimicNow('patrol', false, true));
  const rng = createRng(4);
  const first = nextMimic(true, rng);
  const later = nextMimic(false, rng);
  check('the first time a minute or so in, then every 45–90 s', first >= 60 && first <= 90 && later >= 45 && later <= 90);
  check('someone who has talked (nobody yet: nobody)', mimicWho([], rng) === null && ['a', 'b'].includes(mimicWho(['a', 'b'], rng)!));
  const picks = new Set<string>();
  for (let i = 0; i < 50; i++) picks.add(mimicWho(['a', 'b', 'c'], rng)!);
  check('…any of them', picks.size === 3);
  check('lines between 0.7 and 4 s, the last few each, played lower and slower', MIMIC.minLine < MIMIC.maxLine && MIMIC.keep >= 3 && MIMIC.rate < 1 && MIMIC.rate > 0.7);
  const hub = new MemoryHub();
  const ann = new CoopClient(async () => hub.connect('a'), createRng(1), false);
  const bo = new CoopClient(async () => hub.connect('b'), createRng(2), false);
  await ann.create('Ann', 'normal');
  await bo.join(ann.getSnapshot().room!.code, 'Bo');
  check('a new room: the mimic on (with chat)', ann.getSnapshot().room!.mimic);
  await bo.setOptions({ mimic: false });
  check('only the host turns it off', bo.getSnapshot().room!.mimic);
  await ann.setOptions({ mimic: false });
  check('the host turns it off: everyone sees it', !bo.getSnapshot().room!.mimic);
}

section('Graphics (0.9.9)');
{
  check('High by default; Low is kept; junk is High', defaultSave().settings.graphics === 'high' && hydrateSave({ settings: { graphics: 'low' } }).settings.graphics === 'low' && hydrateSave({ settings: { graphics: 'ultra' } }).settings.graphics === 'high');
  check('High: up to 1.5× on a sharp screen', pixelRatioFor('high', 2) === 1.5 && pixelRatioFor('high', 1) === 1);
  check('Low: 0.75× (a softer, much cheaper picture)', pixelRatioFor('low', 2) === 0.75 && pixelRatioFor('low', 1) === 0.75);
}

section('The microphone: asked on the main menu, never mid-run (0.9.9)');
{
  // A stand-in browser: what it already knows about the mic, and every time the mic is opened (a prompt
  // unless it's already allowed).
  let state: PermissionState = 'prompt';
  let opened = 0;
  const stopped: string[] = [];
  const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      permissions: { query: async () => ({ state }) },
      mediaDevices: {
        getUserMedia: async () => {
          opened++;
          if (state === 'denied') throw new Error('NotAllowedError');
          const id = `s${opened}`;
          return { id, getTracks: () => [{ stop: () => stopped.push(id) }] } as unknown as MediaStream;
        },
      },
    },
  });
  check('in a run, not asked yet: no mic, and no question', (await micIfAllowed()) === null && opened === 0);
  state = 'denied';
  check('the main menu: the browser already knows "no": nothing asked', (await askMicOnce()) === 'no' && opened === 0);
  check('…and the run doesn\'t ask either', (await micIfAllowed()) === null && opened === 0);
  state = 'prompt';
  check('back on the main menu: not asked again', (await askMicOnce()) === 'no' && opened === 0);
  const yes = await askMic();
  state = 'granted';
  check('asked (the solo switch, Ready): yes', yes === 'yes' && micAnswer() === 'yes' && opened === 1);
  check('…and the mic is let go at once (no recording light while you play solo)', stopped.includes('s1') && currentMic() === null);
  const m = await micIfAllowed();
  check('the run opens it with no question (already allowed)', m !== null && m.id === 's2' && currentMic() === m && !stopped.includes('s2'));
  check('…once', (await micIfAllowed()) === m && opened === 2);
  if (real) Object.defineProperty(globalThis, 'navigator', real);
}
