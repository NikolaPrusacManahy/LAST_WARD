// Update 0.9.9 — co-op pings (F): point at something and everyone sees a marker there for a few seconds,
// through walls. What you point at: The Patient (if it's in your crosshair), a thing near where your
// view hits (an item, a panel, a locker, the generator, the exit), or just that spot. Pure (tested).
import { Level, TILE, WALL_HEIGHT, isSolid } from './level';

export const PING = {
  /** How far you can ping (m). */
  range: 45,
  /** How long a marker stays up (s); you can ping again after `every` s. */
  seconds: 6,
  every: 0.6,
  /** A thing this close to where your view hits (m) is what you meant. */
  snap: 1.3,
  /** The Patient counts if it's within this angle of your crosshair (rad, ~8°). */
  enemyCone: 0.14,
};

export type PingKind = 'enemy' | 'item' | 'spot';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface PingMark {
  kind: PingKind;
  /** What it says: "It's here!", "Fuse", "Here". */
  label: string;
  pos: V3;
}

/** Where your view first hits something (wall, floor, ceiling), a hair in front of it; the far end if nothing. */
export function pingRay(level: Level, eye: V3, dir: V3, max = PING.range): V3 {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  const step = 0.05;
  let last = { ...eye };
  for (let t = step; t <= max; t += step) {
    const p = { x: eye.x + d.x * t, y: eye.y + d.y * t, z: eye.z + d.z * t };
    if (p.y <= 0 || p.y >= WALL_HEIGHT || isSolid(level, Math.floor(p.x / TILE), Math.floor(p.z / TILE))) return { x: last.x, y: Math.max(0.05, Math.min(WALL_HEIGHT - 0.05, last.y)), z: last.z };
    last = p;
  }
  return last;
}

/** The thing nearest where your view hit, if one is close enough to be what you meant. */
export function snapPing<T extends { pos: V3 }>(hit: V3, things: T[], within = PING.snap): T | null {
  let best: T | null = null;
  let bestD = within;
  for (const t of things) {
    const d = Math.hypot(t.pos.x - hit.x, t.pos.y - hit.y, t.pos.z - hit.z);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/** Is The Patient in your crosshair? `to` is from your eyes to its chest. */
export function inCrosshair(forward: V3, to: V3, cone = PING.enemyCone): boolean {
  const a = Math.hypot(forward.x, forward.y, forward.z) || 1;
  const b = Math.hypot(to.x, to.y, to.z) || 1;
  const dot = (forward.x * to.x + forward.y * to.y + forward.z * to.z) / (a * b);
  return Math.acos(Math.max(-1, Math.min(1, dot))) <= cone + Math.atan2(0.4, b); // its body is ~0.8 m wide
}

/** What a ping's marker says at `metres` away ("Ann · Fuse · 12 m"; your own leaves out your name). */
export function pingText(label: string, metres: number, who: string | null): string {
  return `${who ? `${who} · ` : ''}${label} · ${Math.round(metres)} m`;
}
