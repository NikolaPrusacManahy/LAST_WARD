// Update 0.9.9 — one player's side of a co-op room: make one, join one by code, ready up, leave. The
// room creator is the host: only the host starts and stops the countdown (state/coop.ts hostStep), and
// when the host goes the room goes with them. React reads it through subscribe / getSnapshot.
import type { Rng } from '../world/rng';
import type { Store, Unsubscribe } from './store';
import { CoopDifficulty, Room, RoomPlayer, cleanName, freeSlots, hostStep, isValidCode, makeRoomCode, normalizeCode, parseRoom, slotKey } from '../state/coop';

export interface CoopSnapshot {
  /** Creating / joining / leaving: buttons wait. */
  busy: boolean;
  /** The last thing that went wrong, in a line for the player. */
  error: string | null;
  room: Room | null;
  /** This player's id ('' until connected). */
  me: string;
  /** The stand-in database: rooms only reach other tabs of this browser. */
  local: boolean;
}

/** What a run needs to know when the countdown ends. */
export interface CoopStart {
  code: string;
  difficulty: CoopDifficulty;
  seed: number;
  slot: number;
  host: boolean;
  players: RoomPlayer[];
}

export const COOP_ERRORS = {
  offline: 'Could not reach the server. Check your connection and try again.',
  badCode: 'Room codes are five letters and numbers.',
  noRoom: 'No room with that code.',
  started: 'That run has already started.',
  full: 'That room is full.',
  closed: 'The host closed the room.',
  noName: 'Pick a name first.',
  busyCodes: 'Could not make a room. Try again.',
};

const roomPath = (code: string) => `rooms/${code}`;

export class CoopClient {
  private store: Store | null = null;
  private snap: CoopSnapshot = { busy: false, error: null, room: null, me: '', local: false };
  private listeners = new Set<() => void>();
  private unwatch: Unsubscribe | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private leaving = false;

  constructor(
    private connect: () => Promise<Store>,
    private rng: Rng,
    /** Tests drive tick() themselves. */
    private autoTick = true,
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  /** The server's clock (for the countdown on screen). */
  now(): number {
    return this.store?.now() ?? Date.now();
  }

  private put(p: Partial<CoopSnapshot>) {
    this.snap = { ...this.snap, ...p };
    this.listeners.forEach((fn) => fn());
  }

  private async ready(): Promise<Store> {
    if (!this.store) {
      this.store = await this.connect();
      this.put({ me: this.store.uid, local: this.store.local });
    }
    return this.store;
  }

  /** Make a room and wait in it as the host. False (and an error) if it didn't work. */
  async create(rawName: string, difficulty: CoopDifficulty): Promise<boolean> {
    const name = cleanName(rawName);
    if (!name) return this.fail(COOP_ERRORS.noName);
    this.put({ busy: true, error: null });
    try {
      const store = await this.ready();
      for (let i = 0; i < 8; i++) {
        const code = makeRoomCode(this.rng);
        const data = {
          host: store.uid,
          created: store.now(),
          status: 'lobby',
          startAt: 0,
          difficulty,
          seed: 1 + Math.floor(this.rng() * 0x7fffffff),
          slots: { [slotKey(0)]: store.uid },
          players: { [store.uid]: { name, ready: false, slot: 0 } },
        };
        if (!(await store.claim(roomPath(code), data))) continue;
        await store.removeOnDisconnect(roomPath(code));
        this.enter(code);
        return true;
      }
      return this.fail(COOP_ERRORS.busyCodes);
    } catch {
      return this.fail(COOP_ERRORS.offline);
    }
  }

  /** Join a friend's room by its code. False (and an error) if it didn't work. */
  async join(rawCode: string, rawName: string): Promise<boolean> {
    const name = cleanName(rawName);
    if (!name) return this.fail(COOP_ERRORS.noName);
    const code = normalizeCode(rawCode);
    if (!isValidCode(code)) return this.fail(COOP_ERRORS.badCode);
    this.put({ busy: true, error: null });
    try {
      const store = await this.ready();
      const room = parseRoom(code, await store.get(roomPath(code)));
      if (!room) return this.fail(COOP_ERRORS.noRoom);
      const back = room.players.find((p) => p.id === store.uid);
      if (back) {
        // Same player again (a reload): just carry on in your slot.
        this.enter(code);
        return true;
      }
      if (room.status !== 'lobby') return this.fail(COOP_ERRORS.started);
      for (const slot of freeSlots(room)) {
        const slotAt = `${roomPath(code)}/slots/${slotKey(slot)}`;
        if (!(await store.claim(slotAt, store.uid))) continue;
        const me = `${roomPath(code)}/players/${store.uid}`;
        await store.removeOnDisconnect(slotAt);
        await store.removeOnDisconnect(me);
        await store.set(me, { name, ready: false, slot });
        this.enter(code);
        return true;
      }
      return this.fail(COOP_ERRORS.full);
    } catch {
      return this.fail(COOP_ERRORS.offline);
    }
  }

  private fail(error: string): false {
    this.put({ busy: false, error });
    return false;
  }

  private enter(code: string) {
    this.leaving = false;
    this.unwatch = this.store!.watch(roomPath(code), (raw) => this.onRoom(code, raw));
    if (this.autoTick) this.timer = setInterval(() => this.tick(), 100);
    this.put({ busy: false, error: null });
  }

  private onRoom(code: string, raw: unknown) {
    if (this.leaving) return;
    const room = parseRoom(code, raw);
    if (!room || !room.players.some((p) => p.id === this.snap.me)) {
      this.exit(COOP_ERRORS.closed);
      return;
    }
    this.put({ room });
    this.tick();
  }

  /** The host's turn: start, stop or finish the countdown. Nothing for everyone else. */
  tick() {
    const room = this.snap.room;
    if (!room || !this.store || room.host !== this.snap.me || this.leaving) return;
    const patch = hostStep(room, this.store.now());
    if (patch) void this.store.update(roomPath(room.code), patch);
  }

  isHost(): boolean {
    return !!this.snap.room && this.snap.room.host === this.snap.me;
  }

  async setReady(ready: boolean) {
    const room = this.snap.room;
    if (!room || !this.store || room.status === 'playing') return;
    await this.store.update(`${roomPath(room.code)}/players/${this.snap.me}`, { ready });
  }

  /** Host only, and not once the countdown is running. */
  async setDifficulty(difficulty: CoopDifficulty) {
    const room = this.snap.room;
    if (!room || !this.store || !this.isHost() || room.status !== 'lobby') return;
    await this.store.update(roomPath(room.code), { difficulty });
  }

  /** What this player's run starts with, once the room is playing. */
  startInfo(): CoopStart | null {
    const room = this.snap.room;
    const me = room?.players.find((p) => p.id === this.snap.me);
    if (!room || !me || room.status !== 'playing') return null;
    return { code: room.code, difficulty: room.difficulty, seed: room.seed, slot: me.slot, host: room.host === this.snap.me, players: room.players };
  }

  /** Leave the room (the host's leaving closes it for everyone). */
  async leave() {
    const room = this.snap.room;
    const store = this.store;
    if (!room || !store) return this.exit(null);
    this.leaving = true;
    this.put({ busy: true });
    try {
      if (room.host === store.uid) {
        await store.cancelOnDisconnect(roomPath(room.code));
        await store.remove(roomPath(room.code));
      } else {
        const me = room.players.find((p) => p.id === store.uid);
        const mine = [`${roomPath(room.code)}/players/${store.uid}`, ...(me ? [`${roomPath(room.code)}/slots/${slotKey(me.slot)}`] : [])];
        for (const p of mine) {
          await store.cancelOnDisconnect(p);
          await store.remove(p);
        }
      }
    } catch {
      /* gone anyway: the server drops us when the tab closes */
    }
    this.exit(null);
  }

  private exit(error: string | null) {
    this.unwatch?.();
    this.unwatch = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.leaving = false;
    this.put({ room: null, busy: false, error });
  }

  /** Clear the last error (going back a screen). */
  clearError() {
    if (this.snap.error) this.put({ error: null });
  }

  /** The page is going away: drop off the server now (its removeOnDisconnect deletes run). */
  close() {
    this.unwatch?.();
    this.unwatch = null;
    if (this.timer) clearInterval(this.timer);
    this.store?.close();
    this.store = null;
  }
}
