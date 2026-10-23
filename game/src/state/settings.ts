// Settings + best-time save in localStorage. Every saved field needs a default here,
// or old saves lose it on load.
import { Bindings, DEFAULT_BINDINGS, hydrateBindings } from './bindings';

export interface Settings {
  sensitivity: number; // 0.2 – 3
  volume: number; // 0 – 1
  invertY: boolean;
  grain: boolean;
  /** Update 0.4.1 — vertical field of view in degrees (sprinting adds a little on top). */
  fov: number;
  /** Update 0.5 — rebindable controls (state/bindings.ts). */
  bindings: Bindings;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  bestTime: number | null; // seconds
  escapes: number;
  deaths: number;
}

export const SAVE_KEY = 'last-ward-save';

export const FOV_MIN = 60;
export const FOV_MAX = 100;

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, volume: 0.8, invertY: false, grain: true, fov: 72, bindings: DEFAULT_BINDINGS };

export function defaultSave(): SaveData {
  return { version: 1, settings: { ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_BINDINGS } }, bestTime: null, escapes: 0, deaths: 0 };
}

const clamp = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

/** Hydrate: accepts anything, always returns a complete, valid save. */
export function hydrateSave(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData> & { settings?: Partial<Settings> };
  const s: Partial<Settings> = r.settings ?? {};
  return {
    version: 1,
    settings: {
      sensitivity: clamp(s.sensitivity, 0.2, 3, DEFAULT_SETTINGS.sensitivity),
      volume: clamp(s.volume, 0, 1, DEFAULT_SETTINGS.volume),
      invertY: typeof s.invertY === 'boolean' ? s.invertY : DEFAULT_SETTINGS.invertY,
      grain: typeof s.grain === 'boolean' ? s.grain : DEFAULT_SETTINGS.grain,
      fov: Math.round(clamp(s.fov, FOV_MIN, FOV_MAX, DEFAULT_SETTINGS.fov)),
      bindings: hydrateBindings(s.bindings),
    },
    bestTime: typeof r.bestTime === 'number' && r.bestTime > 0 ? r.bestTime : null,
    escapes: clamp(r.escapes, 0, 1e9, 0),
    deaths: clamp(r.deaths, 0, 1e9, 0),
  };
}

export function loadSave(): SaveData {
  try {
    return hydrateSave(JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'));
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* private mode / storage blocked — play on without saving */
  }
}

export function recordEscape(data: SaveData, seconds: number): SaveData {
  const best = data.bestTime === null ? seconds : Math.min(data.bestTime, seconds);
  return { ...data, bestTime: best, escapes: data.escapes + 1 };
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
