// Update 0.9.9 — co-op lobby: room codes, names, the host's countdown, spawn spots, the stand-in
// database, and a whole create → join → ready → countdown → run with three players (and a fourth turned away).
import { check, section } from './harness';
import {
  CODE_LENGTH, CODE_LETTERS, COUNTDOWN_MS, MAX_PLAYERS, NAME_MAX, Room, canStart, cleanName, countdownLeft, freeSlots,
  hostStep, isValidCode, lobbyHint, makeRoomCode, normalizeCode, parseRoom, spawnSpot,
} from '../src/state/coop';
import { MemoryHub } from '../src/net/memoryStore';
import { COOP_ERRORS, CONNECT_TRIES, CoopClient } from '../src/net/room';
import { wantsLocalCoop } from '../src/net/backend';
import { createRng } from '../src/world/rng';
import { parseLevel, cellCenter } from '../src/world/level';
import { LEVEL_01 } from '../src/world/content/level01';
import { overlapsWall } from '../src/world/collision';
import { placedProps, propBlockers } from '../src/world/props';
import { PLAYER } from '../src/state/playerRules';
import { defaultSave, hydrateSave } from '../src/state/settings';

const room = (over: Partial<Room> = {}): Room => ({
  code: 'K7Q2M', host: 'a', status: 'lobby', startAt: 0, difficulty: 'normal', seed: 1, voice: true, hear: false, mimic: true,
  players: [{ id: 'a', name: 'Ann', ready: false, slot: 0 }],
  ...over,
});

section('Co-op: room codes and names (0.9.9)');
{
  const rng = createRng(7);
  const codes = Array.from({ length: 500 }, () => makeRoomCode(rng));
  check('codes are five characters from the easy-to-read set', codes.every((c) => c.length === CODE_LENGTH && isValidCode(c)));
  check('no 0/O or 1/I/L to mix up', !/[0O1IL]/.test(CODE_LETTERS) && !isValidCode('K0Q2M') && !isValidCode('KIQ2M'));
  check('codes vary', new Set(codes).size > 490, `${new Set(codes).size} different of 500`);
  check('typed codes: lower case, spaces and dashes are fine', normalizeCode(' k7q-2m ') === 'K7Q2M' && isValidCode(normalizeCode('k7q 2m')));
  check('too short or too long is not a code', !isValidCode('K7Q2') && !isValidCode('K7Q2MM'));
  check('names: trimmed, single spaces', cleanName('   Night   Nurse  ') === 'Night Nurse');
  check('names: no angle brackets or control characters', cleanName('<b>Ann</b>\u0007') === 'bAnn/b');
  check(`names: at most ${NAME_MAX} characters`, cleanName('x'.repeat(40)).length === NAME_MAX);
  check('names: blank is no name', cleanName('   ') === '');
  check('the name is saved; old saves get an empty one', hydrateSave({ coopName: 'Ann' }).coopName === 'Ann' && hydrateSave({}).coopName === '' && defaultSave().coopName === '');
  check('the stand-in database only on request, only in dev', wantsLocalCoop(true, '?coop=local') && !wantsLocalCoop(false, '?coop=local') && !wantsLocalCoop(true, ''));
}

section('Co-op: reading a room (0.9.9)');
{
  check('nothing there → no room', parseRoom('K7Q2M', null) === null && parseRoom('K7Q2M', { players: {} }) === null);
  const r = parseRoom('K7Q2M', {
    host: 'a', status: 'starting', startAt: 5000, difficulty: 'hard', seed: 9,
    slots: { s0: 'a', s2: 'c' },
    players: { c: { name: 'Cy', ready: true, slot: 2 }, a: { name: 'Ann', ready: false, slot: 0 }, junk: 'x' },
  })!;
  check('players come in slot order, junk skipped', r.players.map((p) => p.id).join() === 'a,c');
  check('fields read back', r.status === 'starting' && r.startAt === 5000 && r.difficulty === 'hard' && r.seed === 9);
  const d = parseRoom('K7Q2M', { host: 'a', status: 'weird', difficulty: 'easy' })!;
  check('missing or odd fields get safe defaults (lobby, Normal, no countdown)', d.status === 'lobby' && d.difficulty === 'normal' && d.startAt === 0 && d.players.length === 0);
  check('free slots skip the host and anyone in', freeSlots(r).join() === '1' && freeSlots(room()).join() === '1,2');
}

section('Co-op: the host starts the countdown (0.9.9)');
{
  const one = room({ players: [{ id: 'a', name: 'Ann', ready: true, slot: 0 }] });
  check('alone, even ready: no countdown (co-op needs two)', !canStart(one) && hostStep(one, 0) === null);
  const two = room({ players: [{ id: 'a', name: 'Ann', ready: true, slot: 0 }, { id: 'b', name: 'Bo', ready: false, slot: 1 }] });
  check('one not ready: no countdown', hostStep(two, 0) === null);
  check('the hint says who it waits for', lobbyHint(two) === 'Waiting for 1 player.' && lobbyHint(one) === 'Share the code. 2 players minimum.');
  two.players[1].ready = true;
  const go = hostStep(two, 1000);
  check(`everyone ready → the countdown starts (${COUNTDOWN_MS / 1000} s)`, go?.status === 'starting' && go.startAt === 1000 + COUNTDOWN_MS);
  const counting = { ...two, status: 'starting' as const, startAt: 4000 };
  const left = [1000, 1500, 2100, 3100, 3999].map((t) => countdownLeft(counting, t)).join();
  check('it shows 3, 2, 1', left === '3,3,2,1,1', left);
  check('nothing to do mid-countdown', hostStep(counting, 2500) === null);
  check('it runs out → the run starts', hostStep(counting, 4000)?.status === 'playing');
  const unready = { ...counting, players: counting.players.map((p, i) => ({ ...p, ready: i === 0 })) };
  check('someone un-readies → it stops', hostStep(unready, 2500)?.status === 'lobby' && hostStep(unready, 2500)?.startAt === 0);
  const left1 = { ...counting, players: counting.players.slice(0, 1) };
  check('someone leaves → it stops', hostStep(left1, 2500)?.status === 'lobby');
  check('no countdown shown outside it', countdownLeft(two, 0) === null);
}

section('Co-op: waking up side by side (0.9.9)');
{
  const level = parseLevel(LEVEL_01);
  const blockers = propBlockers(placedProps(level));
  const spots = [0, 1, 2].map((s) => spawnSpot(level, s, PLAYER.radius));
  const start = cellCenter(level.playerStart);
  check('slot 0 is the usual spot', spots[0].x === start.x && spots[0].z === start.z);
  let near = Infinity;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) near = Math.min(near, Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z));
  check('everyone at least 1.2 m apart (no clipping)', near >= 1.2, `closest ${near.toFixed(2)} m`);
  check('nobody in a wall or a prop', spots.every((p) => !overlapsWall(level, p, PLAYER.radius, blockers)));
  check('all in the spawn room (same cell row, within a cell of the start)', spots.every((p) => Math.abs(p.z - start.z) < 0.5 && Math.abs(p.x - start.x) <= 3));
}

section('Co-op: the stand-in database (0.9.9)');
{
  const hub = new MemoryHub();
  const a = hub.connect('a');
  const b = hub.connect('b');
  await a.set('rooms/X/players/a', { name: 'Ann' });
  check('what one writes, the other reads', ((await b.get('rooms/X/players/a')) as { name: string }).name === 'Ann');
  const seen: unknown[] = [];
  const stop = b.watch('rooms/X', (v) => seen.push(v));
  await a.update('rooms/X', { status: 'lobby', 'players/a/ready': true });
  await a.update('rooms/Y', { other: 1 });
  check('a watch fires now, then only when its part changes', seen.length === 2, `${seen.length} calls`);
  stop();
  await a.remove('rooms/X/players/a');
  await a.remove('rooms/X/status');
  check('deleting the last child drops the empty parents', (await b.get('rooms/X')) === null);
  check('claim: first one wins, the second is refused', (await a.claim('rooms/Z/slots/s1', 'a')) && !(await b.claim('rooms/Z/slots/s1', 'b')));
  check('claim: your own claim again is fine', await a.claim('rooms/Z/slots/s1', 'a'));
  await b.set('rooms/Z/players/b', { slot: 2 });
  await b.removeOnDisconnect('rooms/Z/players/b');
  b.close();
  check('a player dropping off → their removeOnDisconnect runs', (await a.get('rooms/Z/players/b')) === null && (await a.get('rooms/Z/slots/s1')) === 'a');
}

section('Co-op: three players through the lobby (0.9.9)');
{
  let clock = 10_000;
  const hub = new MemoryHub(undefined, () => clock);
  let n = 0;
  const client = () => {
    const id = `p${n++}`;
    return new CoopClient(async () => hub.connect(id), createRng(100 + n), false);
  };
  const [ann, bo, cy, dee] = [client(), client(), client(), client()];

  check('no name, no room', !(await ann.create('  ', 'normal')) && ann.getSnapshot().error === COOP_ERRORS.noName);
  check('create a room', await ann.create('Ann', 'normal'));
  const code = ann.getSnapshot().room!.code;
  check('you get a code, you are the host in slot 1', isValidCode(code) && ann.isHost() && ann.getSnapshot().room!.players[0].slot === 0);

  check('a bad code is caught before asking', !(await bo.join('K0', 'Bo')) && bo.getSnapshot().error === COOP_ERRORS.badCode);
  const missing = code === 'ZZZZZ' ? 'YYYYY' : 'ZZZZZ';
  check('a code with no room', !(await bo.join(missing, 'Bo')) && bo.getSnapshot().error === COOP_ERRORS.noRoom);
  check('join with the code (typed in lower case)', await bo.join(code.toLowerCase(), 'Bo'));
  check('third player joins', await cy.join(code, 'Cy'));
  check(`a fourth: the room is full (${MAX_PLAYERS} max)`, !(await dee.join(code, 'Dee')) && dee.getSnapshot().error === COOP_ERRORS.full);

  const seen = ann.getSnapshot().room!;
  check('everyone sees all three names, in slots 1–3', seen.players.map((p) => `${p.name}${p.slot}`).join() === 'Ann0,Bo1,Cy2' && bo.getSnapshot().room!.players.length === 3);
  check('only the host picks the difficulty', (await bo.setDifficulty('hard'), ann.getSnapshot().room!.difficulty === 'normal'));
  await ann.setDifficulty('hard');
  check('the host picks Hard: everyone sees it', cy.getSnapshot().room!.difficulty === 'hard');

  await ann.setReady(true);
  await bo.setReady(true);
  check('two of three ready: still waiting', ann.getSnapshot().room!.status === 'lobby');
  await cy.setReady(true);
  check('all three ready → the countdown starts for everyone', bo.getSnapshot().room!.status === 'starting' && countdownLeft(bo.getSnapshot().room!, clock) === 3);
  check('…and the difficulty is locked', (await ann.setDifficulty('normal'), ann.getSnapshot().room!.difficulty === 'hard'));
  clock += 1500;
  await bo.setReady(false);
  check('Bo un-readies mid-countdown → it stops', cy.getSnapshot().room!.status === 'lobby');
  await bo.setReady(true);
  const again = ann.getSnapshot().room!;
  check('ready again → a fresh 3 seconds', again.status === 'starting' && again.startAt === clock + COUNTDOWN_MS);
  clock += COUNTDOWN_MS - 1;
  ann.tick();
  check('not before the 3 seconds are up', ann.getSnapshot().room!.status === 'starting');
  clock += 1;
  bo.tick(); // not the host: does nothing
  check('only the host starts the run', ann.getSnapshot().room!.status === 'starting');
  ann.tick();
  const runs = [ann, bo, cy].map((c) => c.startInfo());
  check('time is up → everyone starts together', runs.every((r) => r !== null));
  check('each run knows its slot, the difficulty and the seed', runs.map((r) => r!.slot).join() === '0,1,2' && runs.every((r) => r!.difficulty === 'hard' && r!.seed === runs[0]!.seed));
  check('one host among them', runs.filter((r) => r!.host).length === 1 && runs[0]!.host);
  check('too late to join a run that started', !(await dee.join(code, 'Dee')) && dee.getSnapshot().error === COOP_ERRORS.started);
}

section('Co-op: leaving (0.9.9)');
{
  const hub = new MemoryHub();
  let n = 0;
  const client = () => {
    const id = `q${n++}`;
    return new CoopClient(async () => hub.connect(id), createRng(200 + n), false);
  };
  const [ann, bo, cy] = [client(), client(), client()];
  await ann.create('Ann', 'normal');
  const code = ann.getSnapshot().room!.code;
  await bo.join(code, 'Bo');
  await bo.leave();
  check('a player leaves: gone from the list, back to no room, no error', ann.getSnapshot().room!.players.length === 1 && bo.getSnapshot().room === null && bo.getSnapshot().error === null);
  check('their slot is free again', await cy.join(code, 'Cy') && cy.getSnapshot().room!.players[1].slot === 1);
  cy.close();
  check('closing the tab drops you out of the room', ann.getSnapshot().room!.players.length === 1);
  await bo.join(code, 'Bo');
  await ann.leave();
  check('the host leaves: the room is gone, the others are told', (await hub.connect('x').get(`rooms/${code}`)) === null && bo.getSnapshot().room === null && bo.getSnapshot().error === COOP_ERRORS.closed);

  await ann.create('Ann', 'normal');
  const code2 = ann.getSnapshot().room!.code;
  await bo.join(code2, 'Bo');
  ann.close();
  check('the host closes the tab: same thing', bo.getSnapshot().error === COOP_ERRORS.closed && (await hub.connect('y').get(`rooms/${code2}`)) === null);
}

section('Co-op: a shaky connection (0.9.9)');
{
  const hub = new MemoryHub();
  // A connection that fails the first `drops` tries, and counts how often it's opened and closed.
  const flaky = (id: string, drops: number) => {
    const n = { tries: 0, open: 0 };
    const connect = async () => {
      n.tries++;
      if (n.tries <= drops) throw new Error('ERR_CONNECTION_CLOSED');
      const s = hub.connect(id);
      n.open++;
      return { ...s, close: () => (n.open--, s.close()) };
    };
    return { n, client: new CoopClient(connect, createRng(300 + drops), false, 0) };
  };
  const host = flaky('h', 2);
  check(`the connection drops twice: tried again by itself, the room is made (${CONNECT_TRIES} tries)`, (await host.client.create('Host', 'normal')) && host.n.tries === 3);
  const code = host.client.getSnapshot().room!.code;
  const gone = flaky('g', CONNECT_TRIES);
  check('it drops every time: "could not reach the server" after the last try', !(await gone.client.join(code, 'Gone')) && gone.client.getSnapshot().error === COOP_ERRORS.offline && gone.n.tries === CONNECT_TRIES);
  const guest = flaky('u', 0);
  check('a wrong code: told so, and not left connected', !(await guest.client.join('ZZZZZ', 'Guest')) && guest.n.open === 0);
  check('in a room: connected', (await guest.client.join(code, 'Guest')) && guest.n.open === 1);
  await guest.client.leave();
  check('left the room: off the server', guest.n.open === 0);
  check('joining again connects again', (await guest.client.join(code, 'Guest')) && guest.n.open === 1);
  await host.client.leave();
  check('the host closed the room: the guest is off the server too', guest.client.getSnapshot().error === COOP_ERRORS.closed && guest.n.open === 0 && host.n.open === 0);
}
