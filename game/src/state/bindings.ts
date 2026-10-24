// Update 0.5 — rebindable controls. Pure: codes are KeyboardEvent.code ('KeyW', 'ShiftLeft')
// or mouse buttons as 'Mouse0'..'Mouse4' (left, middle, right, back, forward).

export type Action = 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'crouch' | 'flashlight' | 'interact' | 'skillCheck' | 'lookBack' | 'mute';
export type Bindings = Record<Action, string>;

/** Order shown in settings and the controls card. */
export const ACTIONS: { id: Action; label: string }[] = [
  { id: 'forward', label: 'Forward' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'sprint', label: 'Run' },
  { id: 'crouch', label: 'Crouch' },
  { id: 'flashlight', label: 'Flashlight' },
  { id: 'interact', label: 'Collect / interact' },
  { id: 'skillCheck', label: 'Skill check / drop' }, // Update 0.9 — electrical panel repairs; 0.9.8: drop what's in your hand
  { id: 'lookBack', label: 'Look back (running)' }, // Update 0.5.4
  { id: 'mute', label: 'Mute microphone (co-op)' }, // Update 0.9.9 — proximity chat
];

export const DEFAULT_BINDINGS: Bindings = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'ControlLeft',
  flashlight: 'Mouse2', // right click
  interact: 'Mouse0', // left click
  skillCheck: 'Space', // Update 0.9
  lookBack: 'KeyQ', // Update 0.5.4 — hold while running
  mute: 'KeyV', // Update 0.9.9
};

/** Never bindable: Esc pauses (the browser owns it), F2/F3 are the debug view, Win/Cmd opens the OS.
 *  Update 0.9.8 — 1–3 (and the numpad's) pick your slot. */
export const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'];
export const RESERVED = ['Escape', 'F2', 'F3', 'MetaLeft', 'MetaRight', 'ContextMenu', ...SLOT_KEYS];

const MOUSE = /^Mouse[0-4]$/;
const KEY = /^[A-Za-z][A-Za-z0-9]{1,24}$/;

export function isBindable(code: string): boolean {
  if (code.startsWith('Mouse')) return MOUSE.test(code);
  return KEY.test(code) && !RESERVED.includes(code);
}

export const mouseCode = (button: number) => `Mouse${button}`;

/** Free keys handed to a new action whose default is already taken in an old save. */
const SPARE_KEYS = ['Space', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyG', 'KeyV', 'KeyX', 'KeyZ', 'Mouse1', 'Mouse3', 'Mouse4'];

/** Left and right Shift / Ctrl / Alt count as the same key. */
export function codesFor(code: string): string[] {
  const m = /^(Shift|Control|Alt)(Left|Right)$/.exec(code);
  return m ? [`${m[1]}Left`, `${m[1]}Right`] : [code];
}

/** Bind `code` to `action`. If another action already uses it, the two swap, so nothing is ever unbound. */
export function rebind(b: Bindings, action: Action, code: string): Bindings {
  if (!isBindable(code)) return b;
  const next = { ...b };
  const same = (a: string, c: string) => codesFor(a).includes(c);
  const clash = ACTIONS.find((a) => a.id !== action && same(b[a.id], code));
  if (clash) next[clash.id] = b[action];
  next[action] = code;
  return next;
}

/** Saves: anything in, a complete valid set out. A broken or duplicated set falls back to defaults. */
export function hydrateBindings(raw: unknown): Bindings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_BINDINGS };
  const r = raw as Partial<Record<Action, unknown>>;
  const out = { ...DEFAULT_BINDINGS };
  for (const { id } of ACTIONS) {
    const v = r[id];
    if (typeof v === 'string' && isBindable(v)) out[id] = v;
  }
  const firstCode = (a: Action) => codesFor(out[a])[0];
  const clashes = () => ACTIONS.filter((a, i) => ACTIONS.some((b, j) => j !== i && firstCode(a.id) === firstCode(b.id)));
  // Update 0.5.4 — a new action (Look back) missing from an old save whose default key the player
  // already uses elsewhere: give it a free key instead of wiping every custom binding.
  for (const a of clashes()) {
    if (typeof r[a.id] === 'string') continue;
    const taken = new Set(ACTIONS.map((x) => firstCode(x.id)));
    out[a.id] = SPARE_KEYS.find((k) => !taken.has(k)) ?? out[a.id];
  }
  return clashes().length === 0 ? out : { ...DEFAULT_BINDINGS };
}
