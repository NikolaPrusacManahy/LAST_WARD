// Update 0.6.5 — the debug tools are sealed out of the public build. They only exist when the game
// runs from the dev server (START_GAME.bat / npm run dev); `npm run build` turns them all off:
// the F2 debug view (and F3 freeze), the ?debug flag (no pointer lock, window.__lastWard helpers)
// and skipping the credit screen. The engine passes import.meta.env.DEV in; this stays pure (tested).

/** F2 / F3 work at all. */
export function devToolsEnabled(isDev: boolean): boolean {
  return isDev;
}

/** ?debug in the URL: no pointer lock + console helpers for automated checks. Ignored when public. */
export function debugFlag(isDev: boolean, search: string): boolean {
  return isDev && new URLSearchParams(search).has('debug');
}

/** The boot credit screen shows, except for ?debug runs in dev (?debug&credits shows it anyway). */
export function showCredits(isDev: boolean, search: string): boolean {
  return !debugFlag(isDev, search) || new URLSearchParams(search).has('credits');
}

/** Update 0.7 — ?level=N starts on that level (1 = the hospital). Dev build only; public always starts at 1. */
export function startLevelIndex(isDev: boolean, search: string, count: number): number {
  if (!isDev) return 0;
  const n = Number(new URLSearchParams(search).get('level'));
  return Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : 0;
}

/**
 * Update 0.7.1 — the tester level picker on the main menu (dev build only). The public build always
 * starts at level 1, whatever is picked or saved.
 */
export function chooseStartLevel(isDev: boolean, picked: number, count: number): number {
  return isDev && Number.isInteger(picked) && picked >= 0 && picked < count ? picked : 0;
}
