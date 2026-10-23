// Update 0.5 — rebindable controls. Pure: codes are KeyboardEvent.code ('KeyW', 'ShiftLeft')
// or mouse buttons as 'Mouse0'..'Mouse4' (left, middle, right, back, forward).

export type Action = 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'crouch' | 'flashlight' | 'interact';
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
};

/** Never bindable: Esc pauses (the browser owns it), F2/F3 are the debug view, Win/Cmd opens the OS. */
export const RESERVED = ['Escape', 'F2', 'F3', 'MetaLeft', 'MetaRight', 'ContextMenu'];

const MOUSE = /^Mouse[0-4]$/;
const KEY = /^[A-Za-z][A-Za-z0-9]{1,24}$/;

export function isBindable(code: string): boolean {
  if (code.startsWith('Mouse')) return MOUSE.test(code);
  return KEY.test(code) && !RESERVED.includes(code);
}

export const mouseCode = (button: number) => `Mouse${button}`;

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
  const used = ACTIONS.map((a) => codesFor(out[a.id])[0]);
  return new Set(used).size === used.length ? out : { ...DEFAULT_BINDINGS };
}
