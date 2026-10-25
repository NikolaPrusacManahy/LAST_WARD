// Update 0.9.9 — which database co-op uses. Firebase normally; in the dev build ?coop=local swaps in the
// stand-in (memoryStore.ts on localStorage), so two tabs can try the lobby without touching the server.
import type { Store } from './store';
import { MemoryHub, storageBacking } from './memoryStore';

export function wantsLocalCoop(dev: boolean, search: string): boolean {
  return dev && new URLSearchParams(search).get('coop') === 'local';
}

let hub: MemoryHub | null = null;

/** The stand-in database of ?coop=local (null otherwise): lets a dev-console "bot" join a room from the
 *  same tab, to try co-op with one browser tab. */
export const localCoopHub = () => hub;

function randomId(): string {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(36).padStart(2, '0')).join('');
}

export async function connectCoop(): Promise<Store> {
  if (wantsLocalCoop(import.meta.env.DEV, location.search)) {
    hub ??= new MemoryHub(storageBacking());
    // Update 0.9.9 — the same id after a reload of this tab, so you can rejoin your run.
    let id: string | null = null;
    try {
      id = sessionStorage.getItem('lw-coop-uid');
      if (!id) sessionStorage.setItem('lw-coop-uid', (id = randomId()));
    } catch {
      /* storage blocked */
    }
    return hub.connect(id ?? randomId());
  }
  const { connectFirebase } = await import('./firebaseStore');
  return connectFirebase();
}
