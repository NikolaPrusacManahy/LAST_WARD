// Update 0.9.5 — hiding in a locker (Outlast style). Step in: the door shuts and it's dark (no
// flashlight, no goggles). Hold the skill-check key (Space) and forward (W) to ease the door open and
// peek out, at most 60°; let go and it swings back. Interact (left click) gets you out. If The Patient
// saw you get in, it knows: it comes and drags you out. If it didn't, you're invisible in there.
// Pure (tested): the engine places the camera and swings the door from what this says.
export const LOCKER = {
  /** Stepping in / out (s): the door swings open and shut around you. */
  enterSeconds: 0.75,
  exitSeconds: 0.6,
  /** How wide the door swings while you get in or out (rad). */
  swing: 1.4,
  /** Peeking: the furthest the door opens (60°), how fast it creeps open / falls shut (share of max per s). */
  peekMax: Math.PI / 3,
  peekOpen: 0.4,
  peekClose: 1.8,
  /** Inside, you can look this far round from straight out (rad). */
  lookYaw: 0.75,
  lookPitch: 0.45,
  /** Where your eyes are: this far behind the locker's middle; where you stand when you get out (m). */
  eyeBack: 0.06,
  exitOut: 1.05,
};

export type HidePhase = 'entering' | 'inside' | 'exiting';

export interface HideState {
  locker: number;
  phase: HidePhase;
  /** Seconds into entering / exiting. */
  t: number;
  /** How far the door is open from peeking (0..1 of peekMax). */
  peek: number;
  /** The Patient saw you get in: hiding won't help. */
  exposed: boolean;
  /** The flashlight / goggles were on when you got in (they come back on when you get out). */
  lightWas: boolean;
}

export type HideEvent = 'inside' | 'out' | 'peekStart';

export function startHide(locker: number, seen: boolean, lightWas: boolean): HideState {
  return { locker, phase: 'entering', t: 0, peek: 0, exposed: seen, lightWas };
}

export interface HideInput {
  dt: number;
  /** Space + W both held. */
  peekHeld: boolean;
  /** The Patient can see you this frame (only matters while you're still getting in). */
  seen: boolean;
}

export function stepHide(s: HideState, i: HideInput): { state: HideState; events: HideEvent[] } {
  const n = { ...s };
  const events: HideEvent[] = [];
  if (n.phase === 'entering') {
    n.t += i.dt;
    if (i.seen) n.exposed = true;
    if (n.t >= LOCKER.enterSeconds) {
      n.phase = 'inside';
      n.t = 0;
      events.push('inside');
    }
  } else if (n.phase === 'inside') {
    const was = n.peek;
    n.peek = i.peekHeld ? Math.min(1, n.peek + i.dt * LOCKER.peekOpen) : Math.max(0, n.peek - i.dt * LOCKER.peekClose);
    if (was === 0 && n.peek > 0) events.push('peekStart');
  } else {
    n.t += i.dt;
    if (n.t >= LOCKER.exitSeconds) events.push('out');
  }
  return { state: n, events };
}

/** Get out (only once you're all the way in). */
export function requestExit(s: HideState): HideState {
  return s.phase === 'inside' ? { ...s, phase: 'exiting', t: 0 } : s;
}

const smooth = (k: number) => {
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
};

/** How far the door stands open (rad, 0 = shut). */
export function doorOpen(s: HideState): number {
  if (s.phase === 'inside') return s.peek * LOCKER.peekMax;
  const T = s.phase === 'entering' ? LOCKER.enterSeconds : LOCKER.exitSeconds;
  return Math.sin(Math.PI * Math.min(1, s.t / T)) * LOCKER.swing;
}

/** 0 = standing outside in front of it, 1 = inside. */
export function insideness(s: HideState): number {
  if (s.phase === 'inside') return 1;
  const T = s.phase === 'entering' ? LOCKER.enterSeconds : LOCKER.exitSeconds;
  const k = smooth(s.t / T);
  return s.phase === 'entering' ? k : 1 - k;
}

/** Can The Patient see / catch you? Hidden unless it saw you get in. */
export function hiddenFrom(s: HideState | null): boolean {
  return !!s && !s.exposed;
}

/** Keep your view pointing out of the locker. */
export function clampLook(yaw: number, pitch: number, facingYaw: number): { yaw: number; pitch: number } {
  let d = yaw - facingYaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  d = Math.max(-LOCKER.lookYaw, Math.min(LOCKER.lookYaw, d));
  return { yaw: facingYaw + d, pitch: Math.max(-LOCKER.lookPitch, Math.min(LOCKER.lookPitch, pitch)) };
}
