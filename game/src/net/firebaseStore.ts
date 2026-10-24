// Update 0.9.9 — the real co-op database: Firebase Realtime Database, signed in anonymously. Loaded
// only when someone opens Co-op (backend.ts imports it on demand), so solo play never downloads it.
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, browserSessionPersistence, initializeAuth, signInAnonymously } from 'firebase/auth';
import { get, getDatabase, goOffline, goOnline, onDisconnect, onValue, ref, remove, runTransaction, set, update } from 'firebase/database';
import { FIREBASE_CONFIG } from './firebaseConfig';
import type { Store, Unsubscribe } from './store';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export async function connectFirebase(): Promise<Store> {
  app ??= initializeApp(FIREBASE_CONFIG);
  // Per tab, not per browser: two tabs are two players (and a reload keeps you the same player).
  auth ??= initializeAuth(app, { persistence: browserSessionPersistence });
  const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
  const db = getDatabase(app);
  goOnline(db);
  let offset = 0;
  const watches = new Set<Unsubscribe>();
  watches.add(onValue(ref(db, '.info/serverTimeOffset'), (s) => (offset = Number(s.val()) || 0)));
  const at = (path: string) => ref(db, path);
  return {
    uid: user.uid,
    local: false,
    get: async (path) => (await get(at(path))).val(),
    set: (path, value) => set(at(path), value),
    update: (path, patch) => update(at(path), patch),
    remove: (path) => remove(at(path)),
    claim: async (path, value) => {
      const r = await runTransaction(at(path), (cur) => (cur === null || (typeof cur !== 'object' && cur === value) ? value : undefined), {
        applyLocally: false,
      });
      return r.committed;
    },
    watch: (path, cb) => {
      // A watch the rules refuse (the room was deleted under us) reads as "gone".
      const off = onValue(at(path), (s) => cb(s.val()), () => cb(null));
      watches.add(off);
      return () => {
        off();
        watches.delete(off);
      };
    },
    removeOnDisconnect: (path) => onDisconnect(at(path)).remove(),
    cancelOnDisconnect: (path) => onDisconnect(at(path)).cancel(),
    now: () => Date.now() + offset,
    close: () => {
      watches.forEach((off) => off());
      watches.clear();
      goOffline(db); // the server runs our removeOnDisconnect deletes
    },
  };
}
