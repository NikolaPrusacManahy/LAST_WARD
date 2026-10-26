// Settings + best-time save in localStorage. Every saved field needs a default here,
// or old saves lose it on load.
import { Bindings, DEFAULT_BINDINGS, hydrateBindings } from './bindings';
import { DEFAULT_DIFFICULTY, Difficulty, hydrateDifficulty } from './difficulty';
import { NAME_MAX } from './coop';

/** Update 0.9.9 — graphics quality. Low draws at 0.75× your screen's resolution (stretched to fill it) with
 *  no shadows: the two things that cost most. High: up to 1.5× on sharp screens, the flashlight's shadows. */
export type Graphics = 'high' | 'low';
export const GRAPHICS: Record<Graphics, { label: string }> = {
  high: { label: 'High' },
  low: { label: 'Low' },
};

/** How many pixels to draw per screen pixel. */
export function pixelRatioFor(g: Graphics, devicePixelRatio: number): number {
  return g === 'low' ? Math.min(devicePixelRatio, 1) * 0.75 : Math.min(devicePixelRatio, 1.5);
}

export interface Settings {
  sensitivity: number; // 0.2 – 3
  /** Master volume 0 – 1 (the key stays `volume` so old saves keep it). */
  volume: number;
  /** Update 0.9.2 — sound effects (everything but the music / ambience bed), 0 – 1. */
  sfxVolume: number;
  /** Update 0.9.2 — background: the in-game ambience and tension, the main-menu ambience, 0 – 1. */
  bgmVolume: number;
  /** Update 0.9.9 — teammates' voices in co-op (proximity chat), 0 – 1. */
  voiceVolume: number;
  invertY: boolean;
  grain: boolean;
  /** Update 0.4.1 — vertical field of view in degrees (sprinting adds a little on top). */
  fov: number;
  /** Update 0.5 — rebindable controls (state/bindings.ts). */
  bindings: Bindings;
  /** Update 0.9.3 — the last difficulty picked (the picker starts on it). */
  difficulty: Difficulty;
  /** Update 1.0.1 — the last map picked (a level id, world/content/levels.ts). */
  map: string;
  /** Update 0.9.9 — graphics quality. */
  graphics: Graphics;
  /** Update 0.9.9 — test build only: solo runs use your microphone and The Patient mimics you. */
  soloMimic: boolean;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  bestTime: number | null; // seconds
  /** Update 1.0.1 — the best escape on each map (level id → seconds); bestTime stays the best of all. */
  bestTimes: Record<string, number>;
  escapes: number;
  deaths: number;
  /** Update 0.9.9 — the name you go by in co-op (what you last typed). */
  coopName: string;
}

export const SAVE_KEY = 'last-ward-save';

export const FOV_MIN = 60;
/** Update 1.0.1 — the hospital (world/content/level01.ts). */
export const DEFAULT_MAP = 'ward13';
const MAP_ID = /^[a-z0-9_-]{1,24}$/;
export const FOV_MAX = 100;

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, volume: 0.8, sfxVolume: 1, bgmVolume: 1, voiceVolume: 1, invertY: false, grain: true, fov: 72, bindings: DEFAULT_BINDINGS, difficulty: DEFAULT_DIFFICULTY, map: DEFAULT_MAP, graphics: 'high', soloMimic: false };

export function defaultSave(): SaveData {
  return { version: 1, settings: { ...DEFAULT_SETTINGS, bindings: { ...DEFAULT_BINDINGS } }, bestTime: null, bestTimes: {}, escapes: 0, deaths: 0, coopName: '' };
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
      sfxVolume: clamp(s.sfxVolume, 0, 1, DEFAULT_SETTINGS.sfxVolume),
      bgmVolume: clamp(s.bgmVolume, 0, 1, DEFAULT_SETTINGS.bgmVolume),
      voiceVolume: clamp(s.voiceVolume, 0, 1, DEFAULT_SETTINGS.voiceVolume),
      invertY: typeof s.invertY === 'boolean' ? s.invertY : DEFAULT_SETTINGS.invertY,
      grain: typeof s.grain === 'boolean' ? s.grain : DEFAULT_SETTINGS.grain,
      fov: Math.round(clamp(s.fov, FOV_MIN, FOV_MAX, DEFAULT_SETTINGS.fov)),
      bindings: hydrateBindings(s.bindings),
      difficulty: hydrateDifficulty(s.difficulty),
      map: typeof s.map === 'string' && MAP_ID.test(s.map) ? s.map : DEFAULT_MAP,
      graphics: s.graphics === 'low' ? 'low' : 'high',
      soloMimic: s.soloMimic === true,
    },
    bestTime: typeof r.bestTime === 'number' && r.bestTime > 0 ? r.bestTime : null,
    bestTimes: hydrateBestTimes(r.bestTimes, r.bestTime),
    escapes: clamp(r.escapes, 0, 1e9, 0),
    deaths: clamp(r.deaths, 0, 1e9, 0),
    coopName: typeof r.coopName === 'string' ? r.coopName.slice(0, NAME_MAX) : '',
  };
}

/** Update 0.9.2 — what each sound bus actually plays at: master × its own slider. */
export function mixVolumes(s: Pick<Settings, 'volume' | 'sfxVolume' | 'bgmVolume'> & { voiceVolume?: number }) {
  return { master: s.volume, sfx: s.sfxVolume, bgm: s.bgmVolume, voice: s.voiceVolume ?? 1, uiSfx: s.volume * s.sfxVolume, menuBgm: s.volume * s.bgmVolume };
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

/** Update 1.0.1 — per-map bests; a save from before the factory had one best, set in the hospital. */
function hydrateBestTimes(raw: unknown, oldBest: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, t] of Object.entries(raw)) if (MAP_ID.test(id) && typeof t === 'number' && t > 0) out[id] = t;
  } else if (typeof oldBest === 'number' && oldBest > 0) {
    out[DEFAULT_MAP] = oldBest;
  }
  return out;
}

export function recordEscape(data: SaveData, seconds: number, map = DEFAULT_MAP): SaveData {
  const best = data.bestTime === null ? seconds : Math.min(data.bestTime, seconds);
  const mapBest = data.bestTimes[map];
  return { ...data, bestTime: best, bestTimes: { ...data.bestTimes, [map]: mapBest === undefined ? seconds : Math.min(mapBest, seconds) }, escapes: data.escapes + 1 };
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
