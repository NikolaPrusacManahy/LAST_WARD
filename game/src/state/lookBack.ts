// Update 0.5.4 — look over your shoulder while running (Q by default): the camera swings 180°
// while the key is held, and the first moment slows time so you can see what's behind you.
// Pure (tested); Game applies the yaw offset and the time scale.

export const LOOK_BACK = {
  /** Seconds for the camera to swing round (and back). */
  turnSeconds: 0.18,
  /** World speed during the slow-motion burst. */
  slowScale: 0.4,
  /** How long the burst lasts (real seconds), easing back to full speed over `slowEase`. */
  slowSeconds: 0.5,
  slowEase: 0.15,
  /** Real seconds before another look back can slow time again (it still turns the camera). */
  cooldown: 3,
};

export interface LookBack {
  active: boolean;
  /** 0 = looking ahead, 1 = fully turned round. */
  amount: number;
  slowLeft: number;
  cooldown: number;
}

export function createLookBack(): LookBack {
  return { active: false, amount: 0, slowLeft: 0, cooldown: 0 };
}

/** `held`: the look-back key is down. `running`: sprinting right now (look back only works on the run). */
export function stepLookBack(s: LookBack, realDt: number, held: boolean, running: boolean): LookBack {
  const dt = Math.max(0, realDt);
  const active = held && running;
  let { slowLeft, cooldown } = s;
  if (active && !s.active && cooldown <= 0) {
    slowLeft = LOOK_BACK.slowSeconds;
    cooldown = LOOK_BACK.cooldown;
  }
  if (!active) slowLeft = Math.min(slowLeft, 0); // let go: full speed at once
  const step = dt / LOOK_BACK.turnSeconds;
  const amount = active ? Math.min(1, s.amount + step) : Math.max(0, s.amount - step);
  return { active, amount, slowLeft: Math.max(0, slowLeft - dt), cooldown: Math.max(0, cooldown - dt) };
}

/** World time multiplier this frame (1 = normal). */
export function lookBackTimeScale(s: LookBack): number {
  if (s.slowLeft <= 0) return 1;
  if (s.slowLeft >= LOOK_BACK.slowEase) return LOOK_BACK.slowScale;
  const k = s.slowLeft / LOOK_BACK.slowEase; // 1 → 0 over the last moments
  return LOOK_BACK.slowScale + (1 - LOOK_BACK.slowScale) * (1 - k);
}

/** Camera yaw offset (radians), eased so the swing starts and ends softly. */
export function lookBackYaw(s: LookBack): number {
  const a = s.amount;
  return Math.PI * a * a * (3 - 2 * a);
}

/** Hide your own body once the camera is past a quarter turn (it would block the view). */
export const hideBodyWhileLookingBack = (s: LookBack) => s.amount > 0.25;
