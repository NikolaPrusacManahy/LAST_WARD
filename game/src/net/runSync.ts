// Update 0.9.9 — one co-op run over the database, under rooms/{code}/run:
//   p/{uid}   each player's live state, ten times a second (state/coopRun.ts encodeLive); only theirs
//   it/{id}   an item someone moved (picked up, dropped, thrown, used); untouched items aren't there
//   pn/{i}    a panel: fuse fitted, who's repairing it and how far, fixed, switched on, how often it blew
//   lk/{i}    who's in locker i
//   pw        the generator: who started it and where they stood
//   rv/{uid}  someone getting uid back up (d: 1 once done)
//   e         The Patient, written by the host only (everyone else draws it from here)
//   sv/{uid}  where you are and how (lives, hurt, down…), about once a second: rejoining puts you back
//   pg/{uid}  your last ping (F): what, where, and a number so each one shows once
// Anyone writes the shared world, with transactions where two of you could race for the same thing.
import type { Store, Unsubscribe } from './store';
import { LiveState, ResumeState, decodeLive, decodeResume, encodeLive, encodeResume } from '../state/coopRun';
import type { EnemyMode } from '../world/enemyAI';
import type { PingKind, PingMark } from '../world/ping';

export type ItemNetState = 'ground' | 'held' | 'flying' | 'gone';
export interface ItemNet {
  s: ItemNetState;
  x: number;
  y: number;
  z: number;
  /** Which way it lies. */
  w: number;
  /** Times thrown (a brick is half a brick after one). */
  th: number;
  /** Who has it ('held'), or who threw it ('flying'). */
  by?: string;
  /** Picked up at least once (a fuse counts as found). */
  f?: 1;
  /** Flying: its velocity. */
  vx?: number;
  vy?: number;
  vz?: number;
}

export interface PanelNet {
  fu?: 1;
  fx?: 1;
  on?: 1;
  /** Who's working on it now. */
  by?: string;
  /** Repair progress 0..1. */
  r?: number;
  /** Times it blew (each one is a bang everyone hears). */
  bg?: number;
}

export interface PowerNet {
  by: string;
  x: number;
  z: number;
}

export interface ReviveNet {
  by: string;
  d?: 1;
}

/** The host's Patient. `ev`: its last few events, numbered, so everyone plays each one once. */
export interface EnemyNet {
  x: number;
  z: number;
  dx: number;
  dz: number;
  m: EnemyMode;
  /** Screaming before a chase. */
  w: 0 | 1;
  /** On the ceiling: [phase 0 up / 1 on / 2 down, seconds into it]. */
  cr: [number, number] | 0;
  /** Checking a locker: [locker, 0 going / 1 open, seconds]. */
  ck: [number, number, number] | 0;
  /** Holding someone it caught: [their uid, seconds since, 1 if it hit them (last life) / 0 grabbed]. */
  hold: [string, number, number] | 0;
  ev: [number, string, string][];
  /** The host's clock (s), for smoothing. */
  t: number;
}

export interface RunHandlers {
  live(id: string, s: LiveState | null): void;
  item(id: number, it: ItemNet | null): void;
  panel(i: number, p: PanelNet | null): void;
  locker(i: number, who: string | null): void;
  power(p: PowerNet): void;
  revive(id: string, r: ReviveNet | null): void;
  /** Not on the host (it writes this). */
  enemy(e: EnemyNet): void;
  /** Update 0.9.9 — a teammate pinged (F). */
  ping(id: string, mark: PingMark): void;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** Children of a watched node that changed since last time (null = removed). */
function differ(on: (key: string, v: unknown) => void) {
  let last = new Map<string, string>();
  return (raw: unknown) => {
    const now = new Map<string, string>();
    if (isObj(raw)) for (const [k, v] of Object.entries(raw)) now.set(k, JSON.stringify(v));
    for (const [k, s] of now) if (last.get(k) !== s) on(k, JSON.parse(s));
    for (const k of last.keys()) if (!now.has(k)) on(k, null);
    last = now;
  };
}

export class RunSync {
  private offs: Unsubscribe[] = [];
  private path: string;

  constructor(
    private store: Store,
    code: string,
    readonly me: string,
    readonly host: boolean,
  ) {
    this.path = `rooms/${code}/run`;
  }

  /** Start listening. Your own live state drops off the server if you do. */
  start(h: RunHandlers) {
    const at = (p: string) => `${this.path}/${p}`;
    void this.store.removeOnDisconnect(at(`p/${this.me}`));
    this.offs.push(this.store.watch(at('p'), differ((id, v) => id !== this.me && h.live(id, v ? decodeLive(v) : null))));
    this.offs.push(this.store.watch(at('it'), differ((id, v) => h.item(Number(id), isObj(v) ? (v as unknown as ItemNet) : null))));
    this.offs.push(this.store.watch(at('pn'), differ((i, v) => h.panel(Number(i), isObj(v) ? (v as PanelNet) : null))));
    this.offs.push(this.store.watch(at('lk'), differ((i, v) => h.locker(Number(i), typeof v === 'string' ? v : null))));
    this.offs.push(this.store.watch(at('pw'), (v) => isObj(v) && typeof v.by === 'string' && h.power(v as unknown as PowerNet)));
    this.offs.push(this.store.watch(at('rv'), differ((id, v) => h.revive(id, isObj(v) && typeof v.by === 'string' ? (v as unknown as ReviveNet) : null))));
    if (!this.host) this.offs.push(this.store.watch(at('e'), (v) => isObj(v) && typeof v.x === 'number' && h.enemy(v as unknown as EnemyNet)));
    let first = true;
    this.offs.push(
      this.store.watch(
        at('pg'),
        differ((id, v) => {
          // (Pings already up when you arrive aren't news.)
          if (first || id === this.me || !isObj(v) || typeof v.x !== 'number') return;
          const k = (['enemy', 'item', 'spot'] as PingKind[]).includes(v.k as PingKind) ? (v.k as PingKind) : 'spot';
          h.ping(id, { kind: k, label: typeof v.l === 'string' ? v.l.slice(0, 24) : '', pos: { x: v.x as number, y: Number(v.y) || 0, z: Number(v.z) || 0 } });
        }),
      ),
    );
    first = false;
  }

  private at(p: string) {
    return `${this.path}/${p}`;
  }

  publish(s: LiveState) {
    void this.store.set(this.at(`p/${this.me}`), encodeLive(s));
  }

  /** Update 0.9.9 — for rejoining (kept when you drop out, unlike your live state). */
  saveResume(r: ResumeState) {
    void this.store.set(this.at(`sv/${this.me}`), encodeResume(r));
  }

  async loadResume(): Promise<ResumeState | null> {
    return decodeResume(await this.store.get(this.at(`sv/${this.me}`)));
  }

  private pingSeq = 0;
  /** Update 0.9.9 — your ping (F), for everyone else. */
  ping(m: PingMark) {
    const r = (v: number) => Math.round(v * 100) / 100;
    void this.store.set(this.at(`pg/${this.me}`), { x: r(m.pos.x), y: r(m.pos.y), z: r(m.pos.z), k: m.kind, l: m.label, q: ++this.pingSeq });
  }

  publishEnemy(e: EnemyNet) {
    if (this.host) void this.store.set(this.at('e'), e);
  }

  /** Pick an item up: yours if it's lying there (or nobody has touched it yet). */
  takeItem(id: number, throws: number): Promise<boolean> {
    return this.store.transact(this.at(`it/${id}`), (cur) => {
      const c = isObj(cur) ? (cur as unknown as ItemNet) : null;
      if (c && c.s !== 'ground') return undefined;
      return { s: 'held', x: c?.x ?? 0, y: 0, z: c?.z ?? 0, w: c?.w ?? 0, th: c?.th ?? throws, by: this.me, f: 1 };
    });
  }

  /** Dropped, thrown, landed or used up: what it is now. */
  putItem(id: number, it: ItemNet) {
    void this.store.set(this.at(`it/${id}`), it);
  }

  fitFuse(i: number) {
    void this.store.update(this.at(`pn/${i}`), { fu: 1 });
  }

  /** Start repairing panel i: yours unless someone else is on it. */
  claimPanel(i: number): Promise<boolean> {
    return this.store.transact(this.at(`pn/${i}/by`), (cur) => (!cur || cur === this.me ? this.me : undefined));
  }

  repairProgress(i: number, r: number) {
    void this.store.update(this.at(`pn/${i}`), { r: Math.round(r * 100) / 100 });
  }

  releasePanel(i: number, r: number) {
    void this.store.update(this.at(`pn/${i}`), { by: null, r: Math.round(r * 100) / 100 });
  }

  fixPanel(i: number) {
    void this.store.update(this.at(`pn/${i}`), { fx: 1, r: 1, by: null });
  }

  switchPanel(i: number) {
    void this.store.update(this.at(`pn/${i}`), { on: 1 });
  }

  bang(i: number) {
    void this.store.transact(this.at(`pn/${i}/bg`), (cur) => (typeof cur === 'number' ? cur : 0) + 1);
  }

  claimLocker(i: number): Promise<boolean> {
    return this.store.claim(this.at(`lk/${i}`), this.me);
  }

  leaveLocker(i: number) {
    void this.store.transact(this.at(`lk/${i}`), (cur) => (cur === this.me ? null : undefined));
  }

  /** The generator came on (the first one to start it counts). */
  power(x: number, z: number) {
    void this.store.claim(this.at('pw'), { by: this.me, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 });
  }

  /** Getting `id` up: started (`done` false) or finished. */
  revive(id: string, done: boolean) {
    void this.store.set(this.at(`rv/${id}`), done ? { by: this.me, d: 1 } : { by: this.me });
  }

  /** Stopped getting `id` up (only if it's still you on it). */
  stopRevive(id: string) {
    void this.store.transact(this.at(`rv/${id}`), (cur) => (isObj(cur) && cur.by === this.me && !cur.d ? null : undefined));
  }

  /** You're up again: clear your revive. */
  clearRevive() {
    void this.store.remove(this.at(`rv/${this.me}`));
  }

  /** Host: someone left mid-run. What they held lands where they last stood; their locker and panel free up;
   *  (0.9.9) whoever they were getting up isn't held still any longer (their clock runs, they can crawl). */
  cleanUpAfter(id: string, at: { x: number; z: number }, items: { id: number; th: number }[], lockers: number[], panels: number[], revives: string[] = []) {
    if (!this.host) return;
    for (const it of items) this.putItem(it.id, { s: 'ground', x: at.x, y: 0, z: at.z, w: 0, th: it.th, f: 1 });
    for (const i of lockers) void this.store.transact(this.at(`lk/${i}`), (cur) => (cur === id ? null : undefined));
    for (const i of panels) void this.store.transact(this.at(`pn/${i}/by`), (cur) => (cur === id ? null : undefined));
    for (const down of revives) void this.store.transact(this.at(`rv/${down}`), (cur) => (isObj(cur) && cur.by === id && !cur.d ? null : undefined));
  }

  stop() {
    this.offs.forEach((off) => off());
    this.offs = [];
  }
}
