// Update 0.9.9 — one player's side of a co-op room: make one, join one by code, ready up, leave. The
// room creator is the host: only the host starts and stops the countdown (state/coop.ts hostStep), and
// when the host goes the room goes with them. React reads it through subscribe / getSnapshot.
import type { Rng } from '../world/rng';
import type { Store, Unsubscribe } from './store';
import { CoopDifficulty, Room, RoomPlayer, cleanName, freeSlots, hostStep, isValidCode, makeRoomCode, normalizeCode, parseRoom, slotKey } from '../state/coop';
import { currentMic } from './voice';
import type { ResumeState } from '../state/coopRun';

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
  /** Update 0.9.9 — the live connection for the run itself. */
  link: CoopLink;
  /** Update 0.9.9 — rejoining: where you were and how (null: a fresh start). */
  resume?: ResumeState | null;
}

/** Update 0.9.9 — what the run uses of the room: the connection, who you are, the host's options. */
export interface CoopLink {
  store: Store;
  code: string;
  me: string;
  host: boolean;
  /** Proximity chat on, The Patient hears you talk, it mimics your voices. */
  voice: boolean;
  hear: boolean;
  mimic: boolean;
  /** Your microphone, if you let the game have it (asked when you pressed Ready). */
  mic: MediaStream | null;
  /** Who's in the room now (nobody once it's closed). */
  players(): RoomPlayer[];
  /** Who started the run. */
  startedWith: RoomPlayer[];
  /** The host left: the room is gone. */
  closed(): boolean;
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

/** Update 0.9.9 — a first connection can drop (seen once on a guest's first Join): try this many times. */
export const CONNECT_TRIES = 3;

export class CoopClient {
  private store: Store | null = null;
  private snap: CoopSnapshot = { busy: false, error: null, room: null, me: '', local: false };
  private listeners = new Set<() => void>();
  private unwatch: Unsubscribe | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private leaving = false;
  /** Update 0.9.9 — the run has started: your place in the room stays if you drop out (you can rejoin). */
  private kept = false;

  constructor(
    private connect: () => Promise<Store>,
    private rng: Rng,
    /** Tests drive tick() themselves. */
    private autoTick = true,
    /** Wait before the 2nd connection try (twice that before the 3rd). */
    private retryMs = 800,
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
    if (this.store) return this.store;
    let store: Store | null = null;
    for (let i = 0; !store; i++) {
      try {
        store = await this.connect();
      } catch (e) {
        if (i + 1 >= CONNECT_TRIES) throw e;
        await new Promise((r) => setTimeout(r, this.retryMs * (i + 1)));
      }
    }
    this.store = store;
    this.put({ me: store.uid, local: store.local });
    return store;
  }

  /**
   * Off the server whenever you're not in a room: there's nothing to watch, and Firebase's free plan
   * counts every open connection (100 at once). The next Create / Join connects again.
   */
  private disconnect() {
    this.store?.close();
    this.store = null;
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
          voice: true,
          hear: false,
          mimic: true,
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
        // Same player again (a reload): carry on in your slot. (In the lobby you drop off again if you go;
        // in a run your place stays, so you can rejoin.) The room is known now, before its first update.
        if (room.status === 'lobby') {
          await store.removeOnDisconnect(`${roomPath(code)}/slots/${slotKey(back.slot)}`);
          await store.removeOnDisconnect(`${roomPath(code)}/players/${store.uid}`);
        }
        this.put({ room });
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
    this.disconnect();
    this.put({ busy: false, error });
    return false;
  }

  private enter(code: string) {
    this.leaving = false;
    this.kept = false;
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
    if (room.status === 'playing' && !this.kept && this.store) {
      this.kept = true;
      if (room.host !== this.snap.me) {
        const me = room.players.find((p) => p.id === this.snap.me);
        void this.store.cancelOnDisconnect(`${roomPath(code)}/players/${this.snap.me}`);
        if (me) void this.store.cancelOnDisconnect(`${roomPath(code)}/slots/${slotKey(me.slot)}`);
      }
    }
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

  /** Update 0.9.9 — host only, in the lobby: proximity chat on / off, and whether it hears you talk. */
  async setOptions(o: { voice?: boolean; hear?: boolean; mimic?: boolean }) {
    const room = this.snap.room;
    if (!room || !this.store || !this.isHost() || room.status !== 'lobby') return;
    const voice = o.voice ?? room.voice;
    await this.store.update(roomPath(room.code), { voice, hear: voice && (o.hear ?? room.hear), mimic: voice && (o.mimic ?? room.mimic) });
  }

  /** What this player's run starts with, once the room is playing. */
  startInfo(): CoopStart | null {
    const room = this.snap.room;
    const me = room?.players.find((p) => p.id === this.snap.me);
    if (!room || !me || room.status !== 'playing' || !this.store) return null;
    const link: CoopLink = {
      store: this.store,
      code: room.code,
      me: this.snap.me,
      host: room.host === this.snap.me,
      voice: room.voice,
      hear: room.hear,
      mimic: room.mimic,
      mic: room.voice ? currentMic() : null,
      players: () => this.snap.room?.players ?? [],
      startedWith: room.players,
      closed: () => !this.snap.room && this.snap.error === COOP_ERRORS.closed,
    };
    return { code: room.code, difficulty: room.difficulty, seed: room.seed, slot: me.slot, host: link.host, players: room.players, link };
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
    this.disconnect();
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
    this.timer = null;
    this.disconnect();
  }
}
