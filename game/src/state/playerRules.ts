// Player rules: speed, stamina, battery, noise, fear. Pure numbers, no rendering.

export const PLAYER = {
  radius: 0.35,
  eyeHeight: 1.65,
  crouchEyeHeight: 1.25, // Update 0.3 — matches the crouch-walk body's head height
  speed: { walk: 3.0, sprint: 5.4, crouch: 1.6 },
  staminaMax: 4.5, // seconds of sprint
  staminaRegen: 0.9, // per second while not sprinting
  staminaRegenDelay: 0.8,
  /** Sprinting is locked out until stamina refills to this after running dry. */
  staminaUnlock: 1.5,
  batteryMax: 100,
  batteryDrainPerSec: 1.1, // ~90 s of light per full battery
  batteryPickup: 45,
  /** How far each gait is heard (metres). Crouching is silent. */
  noise: { walk: 6, sprint: 15, crouch: 0 },
  stepLength: { walk: 2.0, sprint: 2.6, crouch: 1.5 },
};

export type Gait = 'idle' | 'walk' | 'sprint' | 'crouch';

export interface PlayerStatus {
  stamina: number;
  exhausted: boolean;
  regenWait: number;
  battery: number;
  flashlightOn: boolean;
}

export function createPlayerStatus(): PlayerStatus {
  return { stamina: PLAYER.staminaMax, exhausted: false, regenWait: 0, battery: PLAYER.batteryMax, flashlightOn: true };
}

export function chooseGait(moving: boolean, wantSprint: boolean, wantCrouch: boolean, s: PlayerStatus): Gait {
  if (!moving) return 'idle';
  if (wantCrouch) return 'crouch';
  if (wantSprint && !s.exhausted && s.stamina > 0) return 'sprint';
  return 'walk';
}

export function gaitSpeed(g: Gait): number {
  return g === 'idle' ? 0 : PLAYER.speed[g];
}

export function gaitNoise(g: Gait): number {
  return g === 'idle' ? 0 : PLAYER.noise[g];
}

/** Mutates status for one frame. */
export function tickStatus(s: PlayerStatus, gait: Gait, dt: number): void {
  if (gait === 'sprint') {
    s.stamina = Math.max(0, s.stamina - dt);
    s.regenWait = PLAYER.staminaRegenDelay;
    if (s.stamina === 0) s.exhausted = true;
  } else if (s.regenWait > 0) {
    s.regenWait -= dt;
  } else {
    s.stamina = Math.min(PLAYER.staminaMax, s.stamina + PLAYER.staminaRegen * dt);
    if (s.exhausted && s.stamina >= PLAYER.staminaUnlock) s.exhausted = false;
  }

  if (s.flashlightOn) {
    s.battery = Math.max(0, s.battery - PLAYER.batteryDrainPerSec * dt);
    if (s.battery === 0) s.flashlightOn = false;
  }
}

export function toggleFlashlight(s: PlayerStatus): boolean {
  if (!s.flashlightOn && s.battery <= 0) return false;
  s.flashlightOn = !s.flashlightOn;
  return true;
}

export function addBattery(s: PlayerStatus): void {
  s.battery = Math.min(PLAYER.batteryMax, s.battery + PLAYER.batteryPickup);
}

/** Flicker kicks in below 20% and gets worse as it drains. 0 = steady, 1 = dying. */
export function flickerAmount(battery: number): number {
  return battery >= 20 ? 0 : 1 - battery / 20;
}

/** Fear 0..1 from distance to the enemy and whether it's chasing. Drives heartbeat + screen FX. */
export function fearLevel(distance: number, chasing: boolean): number {
  const near = Math.max(0, 1 - distance / 18);
  return Math.min(1, near * near + (chasing ? 0.45 : 0));
}
