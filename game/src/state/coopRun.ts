// Update 0.9.9 — co-op run rules (pure, tested). What each player sends about themselves ten times a
// second, how teammates are smoothed between those updates, the host's noise queue, what a catch does to
// you, going down and getting back up, who's still in it, and when the run is over.
import type { Vec2 } from '../world/level';
import type { Noise } from '../world/enemyAI';
import type { CarryKind } from './throwables';
import type { Gait } from './playerRules';
import type { CoopDifficulty } from './coop';

export const SEND_HZ = 10;
/** Teammates (and, off the host, The Patient) are drawn this far in the past, so there's an update on
 *  each side to blend between. */
export const VIEW_DELAY = 0.15;

/** Where a player is in the run: on their feet, in its hands, down, out (taken), or out the exit. */
export type LifeState = 'up' | 'caught' | 'down' | 'out' | 'escaped';
export const IN_PLAY: LifeState[] = ['up', 'caught', 'down'];

export interface LiveState {
  pos: Vec2;
  /** Up the stairs (m). */
  rise: number;
  yaw: number;
  pitch: number;
  gait: Gait;
  crouching: boolean;
  /** A real flashlight beam is on (Easy's goggles don't count; there's no Easy in co-op anyway). */
  light: boolean;
  /** In a locker it didn't see you get into: it can't see or catch you. */
  hidden: boolean;
  /** Where The Patient goes for you: the locker door if it saw you get in, else where you are. */
  sense: Vec2;
  /** The locker you're in, or -1. */
  locker: number;
  hold: CarryKind | null;
  injured: boolean;
  life: LifeState;
  /** Down: seconds left before you're out. */
  bleed: number;
  /** Caught by its blow (your last life: sent flying), not its grab. */
  hit: boolean;
  /** The loudest noise you made since the last update (`seq` counts up so the host takes it once). */
  noise: (Noise & { seq: number }) | null;
  /** The sender's clock (s), for smoothing. */
  t: number;
}

const GAITS: Gait[] = ['idle', 'walk', 'sprint', 'crouch'];
const LIVES: LifeState[] = ['up', 'caught', 'down', 'out', 'escaped'];
const KINDS: CarryKind[] = ['brick', 'bottle', 'fuse', 'battery', 'medkit'];
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Short keys and rounded numbers: this goes out ten times a second. */
export function encodeLive(s: LiveState): Record<string, unknown> {
  const n = s.noise;
  return {
    x: r2(s.pos.x),
    z: r2(s.pos.z),
    y: r2(s.rise),
    a: r3(s.yaw),
    b: r3(s.pitch),
    g: GAITS.indexOf(s.gait),
    c: s.crouching ? 1 : 0,
    l: s.light ? 1 : 0,
    hd: s.hidden ? 1 : 0,
    sx: r2(s.sense.x),
    sz: r2(s.sense.z),
    k: s.locker,
    h: s.hold ?? '',
    i: s.injured ? 1 : 0,
    s: s.life,
    bl: Math.ceil(s.bleed),
    ht: s.hit ? 1 : 0,
    // [x, z, radius, flags (1 run, 2 lure, 4 step), seq]; 0 = none (null would delete the key).
    n: n ? [r2(n.pos.x), r2(n.pos.z), r2(n.radius), (n.run ? 1 : 0) | (n.lure ? 2 : 0) | (n.step ? 4 : 0), n.seq] : 0,
    t: r3(s.t),
  };
}

export function decodeLive(raw: unknown): LiveState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.x !== 'number' || typeof r.z !== 'number') return null;
  const n = Array.isArray(r.n) && r.n.length >= 5 ? (r.n as number[]) : null;
  const flags = n ? num(n[3]) : 0;
  const pos = { x: r.x, z: r.z };
  return {
    pos,
    rise: num(r.y),
    yaw: num(r.a),
    pitch: num(r.b),
    gait: GAITS[num(r.g)] ?? 'idle',
    crouching: r.c === 1,
    light: r.l === 1,
    hidden: r.hd === 1,
    sense: typeof r.sx === 'number' && typeof r.sz === 'number' ? { x: r.sx, z: r.sz } : { ...pos },
    locker: num(r.k, -1),
    hold: KINDS.includes(r.h as CarryKind) ? (r.h as CarryKind) : null,
    injured: r.i === 1,
    life: LIVES.includes(r.s as LifeState) ? (r.s as LifeState) : 'up',
    bleed: num(r.bl),
    hit: r.ht === 1,
    noise: n ? { pos: { x: num(n[0]), z: num(n[1]) }, radius: num(n[2]), run: !!(flags & 1), lure: !!(flags & 2), step: !!(flags & 4), seq: num(n[4]) } : null,
    t: num(r.t),
  };
}

/**
 * Update 0.9.9 — rejoining: what your game saves about you about once a second (rooms/{code}/run/sv/{uid}),
 * so a reload (or a dropped connection) puts you back where you were, as you were. Not what you carried:
 * that fell where you dropped out.
 */
export interface ResumeState {
  pos: Vec2;
  yaw: number;
  lives: number;
  injured: boolean;
  life: LifeState;
  bleed: number;
}

export function encodeResume(r: ResumeState): Record<string, unknown> {
  return { x: r2(r.pos.x), z: r2(r.pos.z), a: r3(r.yaw), lv: r.lives, i: r.injured ? 1 : 0, s: r.life === 'caught' ? 'up' : r.life, bl: Math.ceil(r.bleed) };
}

export function decodeResume(raw: unknown): ResumeState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.x !== 'number' || typeof r.z !== 'number') return null;
  return {
    pos: { x: r.x, z: r.z },
    yaw: num(r.a),
    lives: Math.max(0, Math.min(2, num(r.lv, 1))),
    injured: r.i === 1,
    life: LIVES.includes(r.s as LifeState) ? (r.s as LifeState) : 'up',
    bleed: num(r.bl),
  };
}

/** A teammate's recent updates, and how far their clock is from ours. */
export interface Track {
  snaps: LiveState[];
  /** Our clock minus theirs, the smallest seen (the quickest an update has ever arrived). */
  offset: number;
}

export const createTrack = (): Track => ({ snaps: [], offset: Infinity });

/** An update arrived at `now` (our clock, s). */
export function addToTrack(tr: Track, s: LiveState, now: number, keep = 12): void {
  tr.offset = Math.min(tr.offset, now - s.t);
  const last = tr.snaps[tr.snaps.length - 1];
  if (last && s.t <= last.t) {
    // Out of order or a repeat: just the newest facts (life, hold…) without moving them back in time.
    tr.snaps[tr.snaps.length - 1] = { ...s, t: last.t };
    return;
  }
  tr.snaps.push(s);
  if (tr.snaps.length > keep) tr.snaps.shift();
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/** Where they were VIEW_DELAY ago (our clock `now`): blended between the two updates around then;
 *  before the first or after the last, held there (no guessing ahead). */
export function sampleTrack(tr: Track, now: number, delay = VIEW_DELAY): LiveState | null {
  const s = tr.snaps;
  if (!s.length) return null;
  const at = now - delay - tr.offset;
  if (at <= s[0].t) return s[0];
  for (let i = 1; i < s.length; i++) {
    if (at <= s[i].t) {
      const a = s[i - 1];
      const b = s[i];
      const k = (at - a.t) / (b.t - a.t || 1);
      return {
        ...b,
        pos: { x: lerp(a.pos.x, b.pos.x, k), z: lerp(a.pos.z, b.pos.z, k) },
        sense: { x: lerp(a.sense.x, b.sense.x, k), z: lerp(a.sense.z, b.sense.z, k) },
        rise: lerp(a.rise, b.rise, k),
        yaw: lerpAngle(a.yaw, b.yaw, k),
        pitch: lerp(a.pitch, b.pitch, k),
      };
    }
  }
  return s[s.length - 1];
}

/** How much a noise matters to it: a blown panel it runs to, something thrown, something you did, steps. */
export function noiseRank(n: Noise): number {
  return n.run ? 4 : n.lure ? 3 : n.step ? 1 : 2;
}

/** The one to keep when two noises happen before the next update / frame. */
export function louder<T extends Noise>(a: T | null, b: T | null): T | null {
  if (!a) return b;
  if (!b) return a;
  const ra = noiseRank(a);
  const rb = noiseRank(b);
  if (ra !== rb) return ra > rb ? a : b;
  return b.radius > a.radius ? b : a;
}

/** What a catch does to you. Solo: thrown while you have a life to spare, else dead. Co-op Normal: on
 *  your last life you go down (a teammate can get you up). Co-op Hard: one life, no getting up. */
export type CatchOutcome = 'thrown' | 'down' | 'dead';
export function catchOutcome(lives: number, coop: CoopDifficulty | null): CatchOutcome {
  if (lives > 1) return 'thrown';
  return coop === 'normal' ? 'down' : 'dead';
}

export const DOWN = {
  /** Seconds you have before you're out (the clock stops while someone is getting you up). */
  bleedSeconds: 60,
  /** You can crawl (m/s), toward a friend; not while someone is getting you up. */
  crawlSpeed: 0.6,
  /** Your eyes, on your front (m). */
  crawlEye: 0.35,
  /** How long a teammate holds left click on you. */
  reviveSeconds: 5,
  /** How close they have to be (m). */
  reach: 1.8,
};

/**
 * Update 0.9.9 — getting someone up you kneel at their side, square to them, your hands along their back
 * (Nikola's `player_reviving.fbx`, clip `revive`: the hands work 0.45 m ahead of you, 0.4 m apart, their
 * middle 0.16 m to your right). They're up on their elbows, so your hands go on their near side.
 */
export const KNEEL = {
  /** The middle of their back: this far ahead of the spot they lie on (m). */
  back: 0.15,
  /** Their spine: this far ahead of you (m), and to your right (the hands' middle). */
  ahead: 0.57,
  right: 0.16,
  /** Your eyes on one knee, bent over them, and how far ahead of your knee (m): just above your bent head
   *  (it's hidden), your shoulders behind, their back 40 cm below. The first-person camera stays there:
   *  riding the head itself put it on their back; further back, your own shoulders filled the view. */
  eye: 1.0,
  eyeAhead: 0.5,
  /** How fast you shuffle over to them once you start (m/s). */
  shuffle: 2,
  /** Down onto your knee / back up (s). */
  fade: 0.35,
};

/** The middle of their back (`yaw`: the way they face, on their front). */
export function reviveBack(down: { pos: Vec2; yaw: number }): Vec2 {
  return { x: down.pos.x - Math.sin(down.yaw) * KNEEL.back, z: down.pos.z - Math.cos(down.yaw) * KNEEL.back };
}

/** Where you kneel and the way you face, coming from `from`: at whichever side of them you're on (`other`:
 *  the other side, when yours is up against a wall). */
export function kneelAt(from: Vec2, down: { pos: Vec2; yaw: number }, other = false): { pos: Vec2; yaw: number } {
  const back = reviveBack(down);
  // Their right; you face them from that side or the other.
  const side = { x: Math.cos(down.yaw), z: -Math.sin(down.yaw) };
  const s = ((from.x - back.x) * side.x + (from.z - back.z) * side.z >= 0 ? 1 : -1) * (other ? -1 : 1);
  const yaw = Math.atan2(side.x * s, side.z * s);
  const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const r = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  return { pos: { x: back.x - f.x * KNEEL.ahead - r.x * KNEEL.right, z: back.z - f.z * KNEEL.ahead - r.z * KNEEL.right }, yaw };
}

/**
 * Update 0.9.9 — can you start getting them up? `r`: their revive now; `byIsUp`: whoever it names is in the
 * run on their feet. Not once it's done (they're on their way up: starting again would undo it), nor while
 * someone else is at it; but someone caught or gone mid-revive doesn't keep them from you.
 */
export function reviveFree(r: { by: string; d?: 1 } | undefined, me: string, byIsUp: boolean): boolean {
  return !r || (!r.d && (r.by === me || !byIsUp));
}

/** Update 0.9.9 — co-op Hard: it climbs the ceilings this many times as often (and waits that much less). */
export const HARD_CRAWL_BOOST = 2;

export interface Member {
  id: string;
  name: string;
  /** 'left': gone from the room mid-run. */
  life: LifeState | 'left';
}

/** Everyone is out, out the exit, or gone: the run is over. */
export function runOver(team: Member[]): boolean {
  return team.length > 0 && team.every((m) => m.life === 'out' || m.life === 'escaped' || m.life === 'left');
}

/** At least one of you got out. */
export const teamEscaped = (team: Member[]) => team.some((m) => m.life === 'escaped');

/** Who you can watch once you're out: anyone still in it. */
export function watchable(team: Member[], me: string): string[] {
  return team.filter((m) => m.id !== me && IN_PLAY.includes(m.life as LifeState)).map((m) => m.id);
}

/** The next one to watch (wraps round; the first if `current` isn't there any more). */
export function nextWatch(ids: string[], current: string | null, step = 1): string | null {
  if (!ids.length) return null;
  const i = current ? ids.indexOf(current) : -1;
  if (i < 0) return ids[0];
  return ids[(i + step + ids.length) % ids.length];
}

/** Update 0.9.9 — proximity chat. Your voice as a noise (if the host ticked "Enemy can hear you talk"):
 *  quiet talk is safe; from `quietDb` up it carries `minRadius` m, up to `maxRadius` m at `loudDb`. */
export const VOICE = { quietDb: -34, loudDb: -10, minRadius: 3, maxRadius: 14, every: 0.4, fadeFrom: 16, fadeTo: 26 };

export function voiceNoiseRadius(db: number): number {
  if (!(db >= VOICE.quietDb)) return 0;
  const k = Math.min(1, (db - VOICE.quietDb) / (VOICE.loudDb - VOICE.quietDb));
  return VOICE.minRadius + (VOICE.maxRadius - VOICE.minRadius) * k;
}

/** Proximity: full voice up close, fading out between `fadeFrom` and `fadeTo` m (on top of the 3D
 *  falloff and the walls in between). */
export function voiceDistanceGain(d: number): number {
  if (d <= VOICE.fadeFrom) return 1;
  return Math.max(0, 1 - (d - VOICE.fadeFrom) / (VOICE.fadeTo - VOICE.fadeFrom));
}

/**
 * Update 0.9.9 — the mimic (lobby: "It mimics your voices", needs proximity chat). Lines kept: someone talks
 * for `minLine`–`maxLine` s (a stretch ends after `endQuiet` s of quiet; louder than `talkRms` counts as
 * talking), the last `keep` per person. It mimics while it prowls, never mid-chase: the first time 60–90 s
 * in, then every 45–90 s, someone who has talked. Played at `rate` (lower and slower than they said it).
 */
export const MIMIC = {
  minLine: 0.7,
  maxLine: 4,
  endQuiet: 0.45,
  talkRms: 0.015,
  keep: 5,
  firstMin: 60,
  firstMax: 90,
  everyMin: 45,
  everyMax: 90,
  /** Nobody has talked yet: look again in this many seconds. */
  retry: 10,
  rate: 0.84,
};

/** Update 0.9.9 — the test build's solo mimic (Settings → Audio): sooner, so there's something to hear. */
export const MIMIC_SOLO_TEST = { firstMin: 15, firstMax: 25, everyMin: 20, everyMax: 40 };

/** Seconds until it mimics (again). */
export function nextMimic(first: boolean, rng: () => number): number {
  return first ? MIMIC.firstMin + rng() * (MIMIC.firstMax - MIMIC.firstMin) : MIMIC.everyMin + rng() * (MIMIC.everyMax - MIMIC.everyMin);
}

/** Only while it prowls (patrol, a look round, a noise to check): not in a chase, not on the ceiling, not
 *  with one of you in its hands. */
export function mimicNow(mode: string, crawling: boolean, holding: boolean): boolean {
  return !crawling && !holding && (mode === 'patrol' || mode === 'search' || mode === 'investigate');
}

/** Whose voice: one of those who've talked, at random (null: nobody yet). */
export function mimicWho(talkers: string[], rng: () => number): string | null {
  return talkers.length ? talkers[Math.floor(rng() * talkers.length)] : null;
}

/** The living hear the living. Once you're out (taken or escaped) you hear everyone, watching from a
 *  teammate's eyes, but the living don't hear you: no help from beyond. */
export function hears(listener: LifeState, talker: LifeState): boolean {
  return !IN_PLAY.includes(listener) || IN_PLAY.includes(talker);
}
