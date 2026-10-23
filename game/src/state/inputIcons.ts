// Update 0.5 — which Kenney input-prompt icon (public/ui/inputs/<name>.svg) and text label
// to show for a bound code. Keys without an icon fall back to a drawn key cap with the label.

export interface InputGlyph {
  /** Icon name in public/ui/inputs (no extension), or null to draw a text key cap. */
  icon: string | null;
  label: string;
}

const NAMED: Record<string, InputGlyph> = {
  Mouse0: { icon: 'mouse_left', label: 'Left click' },
  Mouse1: { icon: 'mouse_scroll', label: 'Middle click' },
  Mouse2: { icon: 'mouse_right', label: 'Right click' },
  Mouse3: { icon: 'mouse_side_back', label: 'Mouse back' },
  Mouse4: { icon: 'mouse_side_forward', label: 'Mouse forward' },
  ShiftLeft: { icon: 'shift', label: 'Shift' },
  ShiftRight: { icon: 'shift', label: 'Shift' },
  ControlLeft: { icon: 'ctrl', label: 'Ctrl' },
  ControlRight: { icon: 'ctrl', label: 'Ctrl' },
  AltLeft: { icon: 'alt', label: 'Alt' },
  AltRight: { icon: 'alt', label: 'Alt' },
  Space: { icon: 'space', label: 'Space' },
  Tab: { icon: 'tab', label: 'Tab' },
  CapsLock: { icon: 'capslock', label: 'Caps Lock' },
  Enter: { icon: 'enter', label: 'Enter' },
  NumpadEnter: { icon: 'numpad_enter', label: 'Num Enter' },
  Backspace: { icon: 'backspace', label: 'Backspace' },
  Escape: { icon: 'escape', label: 'Esc' },
  Delete: { icon: 'delete', label: 'Delete' },
  Insert: { icon: 'insert', label: 'Insert' },
  Home: { icon: 'home', label: 'Home' },
  End: { icon: 'end', label: 'End' },
  PageUp: { icon: 'page_up', label: 'Page Up' },
  PageDown: { icon: 'page_down', label: 'Page Down' },
  ArrowUp: { icon: 'arrow_up', label: 'Up' },
  ArrowDown: { icon: 'arrow_down', label: 'Down' },
  ArrowLeft: { icon: 'arrow_left', label: 'Left' },
  ArrowRight: { icon: 'arrow_right', label: 'Right' },
  Minus: { icon: 'minus', label: '-' },
  Equal: { icon: 'equals', label: '=' },
  BracketLeft: { icon: 'bracket_open', label: '[' },
  BracketRight: { icon: 'bracket_close', label: ']' },
  Semicolon: { icon: 'semicolon', label: ';' },
  Quote: { icon: 'apostrophe', label: "'" },
  Backquote: { icon: 'tilde', label: '`' },
  Backslash: { icon: 'slash_back', label: '\\' },
  Slash: { icon: 'slash_forward', label: '/' },
  Comma: { icon: 'comma', label: ',' },
  Period: { icon: 'period', label: '.' },
  NumpadAdd: { icon: 'numpad_plus', label: 'Num +' },
  NumpadMultiply: { icon: 'asterisk', label: 'Num *' },
  NumLock: { icon: 'numlock', label: 'Num Lock' },
  Pause: { icon: 'pause', label: 'Pause' },
};

/** Fixed (not rebindable) prompts. */
export const MOUSE_LOOK: InputGlyph = { icon: 'mouse_move', label: 'Mouse' };

export function glyphFor(code: string): InputGlyph {
  const named = NAMED[code];
  if (named) return named;
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return { icon: m[1].toLowerCase(), label: m[1] };
  m = /^Digit([0-9])$/.exec(code);
  if (m) return { icon: m[1], label: m[1] };
  m = /^F([1-9]|1[0-2])$/.exec(code);
  if (m) return { icon: `f${m[1]}`, label: `F${m[1]}` };
  m = /^Numpad([0-9])$/.exec(code);
  if (m) return { icon: null, label: `Num ${m[1]}` };
  return { icon: null, label: code.replace(/(Left|Right)$/, '') };
}

/** Every icon the game can ask for. tools/prepare-input-icons.ts copies exactly these; a test checks they exist. */
export function allIconNames(): string[] {
  const names = new Set<string>([MOUSE_LOOK.icon!]);
  for (const g of Object.values(NAMED)) if (g.icon) names.add(g.icon);
  for (let c = 65; c <= 90; c++) names.add(String.fromCharCode(c).toLowerCase());
  for (let d = 0; d <= 9; d++) names.add(String(d));
  for (let f = 1; f <= 12; f++) names.add(`f${f}`);
  return [...names].sort();
}

/** Source file in the Kenney pack for an icon name: keys use the outline set, mice the filled set (red button). */
export function sourceFileFor(name: string): string {
  return name.startsWith('mouse') ? `${name}.svg` : `keyboard_${name}_outline.svg`;
}
