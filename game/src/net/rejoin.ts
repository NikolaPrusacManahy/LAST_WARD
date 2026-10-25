// Update 0.9.9 — rejoining a co-op run. This tab remembers the run you're in (sessionStorage: it survives a
// reload, not closing the tab); the main menu offers to take you back. Your id survives a reload too (Firebase
// keeps its sign-in per tab; the stand-in keeps its id here), so the room still knows you.
const KEY = 'lw-coop-rejoin';

export interface RejoinTicket {
  code: string;
  name: string;
}

export function saveTicket(t: RejoinTicket) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* storage blocked: no rejoining */
  }
}

export function loadTicket(): RejoinTicket | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    return t && typeof t.code === 'string' && typeof t.name === 'string' ? t : null;
  } catch {
    return null;
  }
}

export function clearTicket() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
