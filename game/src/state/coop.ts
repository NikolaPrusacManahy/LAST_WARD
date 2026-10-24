// Update 0.9.9 — co-op lobby rules (up to three players). Pure: no network here. The room lives in the
// database as plain JSON (src/net/room.ts writes it); these functions read it, decide what the host does
// next, and place everyone in the spawn room.
//
// Room JSON, under rooms/{code}:
//   host: uid · created: ms · status: 'lobby' | 'starting' | 'playing' · startAt: ms (0 = no countdown)
//   difficulty: 'normal' | 'hard' · seed: number · voice, hear: booleans (proximity chat, it hears you talk)
//   slots: { s0: uid, s1: uid, s2: uid }      (s-keys: numbered keys come back as arrays from Firebase)
//   players: { [uid]: { name, ready, slot } }
import type { Rng } from '../world/rng';
import type { Level, Vec2 } from '../world/level';
import { cellCenter } from '../world/level';
import { nearestFree } from '../world/collision';
import { placedProps, propBlockers } from '../world/props';

export const MAX_PLAYERS = 3;
/** Co-op is for two or three; one player alone plays solo. */
export const MIN_PLAYERS = 2;
export const COUNTDOWN_MS = 3000;
export const NAME_MAX = 16;
/** No 0/O, 1/I/L: easy to read out to a friend. */
export const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export type CoopDifficulty = 'normal' | 'hard';
export const COOP_DIFFICULTIES: CoopDifficulty[] = ['normal', 'hard'];
export const COOP_DIFFICULTY: Record<CoopDifficulty, { label: string; blurb: string }> = {
  normal: { label: 'Normal', blurb: 'Two lives each. Caught on your last one, you go down: a friend can get you back up.' },
  hard: { label: 'Hard', blurb: 'Batteries last 40% less, one life each, no getting back up. It climbs the ceilings more.' },
};

export type RoomStatus = 'lobby' | 'starting' | 'playing';

export interface RoomPlayer {
  id: string;
  name: string;
  ready: boolean;
  slot: number;
}

export interface Room {
  code: string;
  host: string;
  status: RoomStatus;
  startAt: number;
  difficulty: CoopDifficulty;
  seed: number;
  /** Update 0.9.9 — the host's lobby options: proximity chat, and The Patient hearing you talk (needs chat). */
  voice: boolean;
  hear: boolean;
  /** In slot order (the host is slot 0). */
  players: RoomPlayer[];
}

export const slotKey = (slot: number) => `s${slot}`;

export function makeRoomCode(rng: Rng): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_LETTERS[Math.floor(rng() * CODE_LETTERS.length)];
  return code;
}

/** What someone typed → a code to look up: capitals, no spaces or dashes. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_LETTERS.includes(c));
}

/** A name to show the others: no control characters or angle brackets, single spaces, at most NAME_MAX. */
export function cleanName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** Database JSON → a room, or null if it's gone (or half written). Missing bits get safe defaults. */
export function parseRoom(code: string, raw: unknown): Room | null {
  if (!isObj(raw) || typeof raw.host !== 'string') return null;
  const players: RoomPlayer[] = [];
  if (isObj(raw.players)) {
    for (const [id, p] of Object.entries(raw.players)) {
      if (!isObj(p) || typeof p.slot !== 'number') continue;
      players.push({ id, name: typeof p.name === 'string' ? cleanName(p.name) || '?' : '?', ready: p.ready === true, slot: p.slot });
    }
  }
  players.sort((a, b) => a.slot - b.slot);
  const status: RoomStatus = raw.status === 'starting' || raw.status === 'playing' ? raw.status : 'lobby';
  return {
    code,
    host: raw.host,
    status,
    startAt: typeof raw.startAt === 'number' ? raw.startAt : 0,
    difficulty: raw.difficulty === 'hard' ? 'hard' : 'normal',
    seed: typeof raw.seed === 'number' ? raw.seed : 1,
    voice: raw.voice === true,
    hear: raw.voice === true && raw.hear === true,
    players,
  };
}

/** Enough players and every one of them ready. */
export function canStart(room: Room): boolean {
  return room.players.length >= MIN_PLAYERS && room.players.every((p) => p.ready);
}

/** The slots a joining player can take, lowest first (empty = full). Slot 0 is the host's. */
export function freeSlots(room: Room): number[] {
  const out: number[] = [];
  for (let s = 1; s < MAX_PLAYERS; s++) if (!room.players.some((p) => p.slot === s)) out.push(s);
  return out;
}

/**
 * What the host writes next (null = nothing). Everyone ready → the countdown starts; someone un-readies
 * or leaves → it stops; the countdown runs out → the run starts. Only the host runs this, so the start
 * is one decision everyone sees at the same moment.
 */
export function hostStep(room: Room, now: number): Partial<Pick<Room, 'status' | 'startAt'>> | null {
  if (room.status === 'lobby' && canStart(room)) return { status: 'starting', startAt: now + COUNTDOWN_MS };
  if (room.status === 'starting' && !canStart(room)) return { status: 'lobby', startAt: 0 };
  if (room.status === 'starting' && now >= room.startAt) return { status: 'playing' };
  return null;
}

/** Whole seconds left on the countdown (3, 2, 1), or null when there isn't one. */
export function countdownLeft(room: Room, now: number): number | null {
  if (room.status !== 'starting') return null;
  return Math.max(1, Math.ceil((room.startAt - now) / 1000));
}

/** What the lobby says under the player list. */
export function lobbyHint(room: Room): string {
  if (room.status === 'starting') return 'Get ready…';
  if (room.players.length < MIN_PLAYERS) return 'Send the code to a friend. Co-op needs at least two of you.';
  const waiting = room.players.filter((p) => !p.ready).length;
  return waiting === 0 ? 'Everyone is ready.' : `Waiting for ${waiting === 1 ? 'one player' : `${waiting} players`} to be ready.`;
}

const SPREAD = 1.6;

/**
 * Where each slot wakes up: side by side in the spawn room, SPREAD metres apart across the way you face
 * (slot 0 on the usual spot, 1 to its left, 2 to its right), nudged off any wall or prop.
 */
export function spawnSpot(level: Level, slot: number, radius = 0.35): Vec2 {
  const at = cellCenter(level.playerStart);
  const side = slot === 1 ? -1 : slot === 2 ? 1 : 0;
  // Facing is (-sin yaw, -cos yaw); its right-hand side is (cos yaw, -sin yaw).
  const right = { x: Math.cos(level.startYaw), z: -Math.sin(level.startYaw) };
  const p = { x: at.x + right.x * side * SPREAD, z: at.z + right.z * side * SPREAD };
  return nearestFree(level, p, radius, propBlockers(placedProps(level)));
}
