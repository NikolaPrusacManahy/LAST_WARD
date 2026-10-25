// Update 0.5.4 — look over your shoulder while running (Q by default): the camera swings 180°
// while the key is held. Update 0.9.9 — no slow motion any more (Nikola: just looking back is fine).
// Pure (tested); Game applies the yaw offset.

export const LOOK_BACK = {
  /** Seconds for the camera to swing round (and back). */
  turnSeconds: 0.18,
};

export interface LookBack {
  active: boolean;
  /** 0 = looking ahead, 1 = fully turned round. */
  amount: number;
}

export function createLookBack(): LookBack {
  return { active: false, amount: 0 };
}

/** `held`: the look-back key is down. `running`: sprinting right now (look back only works on the run). */
export function stepLookBack(s: LookBack, realDt: number, held: boolean, running: boolean): LookBack {
  const dt = Math.max(0, realDt);
  const active = held && running;
  const step = dt / LOOK_BACK.turnSeconds;
  const amount = active ? Math.min(1, s.amount + step) : Math.max(0, s.amount - step);
  return { active, amount };
}

/** Camera yaw offset (radians), eased so the swing starts and ends softly. */
export function lookBackYaw(s: LookBack): number {
  const a = s.amount;
  return Math.PI * a * a * (3 - 2 * a);
}

/** Hide your own body once the camera is past a quarter turn (it would block the view). */
export const hideBodyWhileLookingBack = (s: LookBack) => s.amount > 0.25;
