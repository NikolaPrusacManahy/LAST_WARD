// Update 0.9.9 — the stand-in database: a JSON tree that behaves like Firebase's Realtime Database for
// what co-op needs. One hub, many players connected to it (each gets its own Store). The tree lives in a
// Backing: plain memory for tests, or localStorage so tabs of one browser can play together before the
// real server is set up.
import type { Store, Unsubscribe } from './store';

type Tree = Record<string, unknown>;

export interface Backing {
  load(): Tree;
  save(tree: Tree): void;
  /** Someone else (another tab) changed the tree. */
  onChange(cb: () => void): Unsubscribe;
}

export function memoryBacking(): Backing {
  let tree: Tree = {};
  return { load: () => tree, save: (t) => (tree = t), onChange: () => () => {} };
}

/** The tree in localStorage: every tab of this browser sees the same rooms. */
export function storageBacking(key = 'lw-coop-rooms'): Backing {
  return {
    load() {
      try {
        const t = JSON.parse(localStorage.getItem(key) ?? '{}');
        return t && typeof t === 'object' ? t : {};
      } catch {
        return {};
      }
    },
    save(t) {
      try {
        localStorage.setItem(key, JSON.stringify(t));
      } catch {
        /* storage blocked: rooms stay in this tab */
      }
    },
    onChange(cb) {
      const on = (e: StorageEvent) => {
        if (e.key === key) cb();
      };
      window.addEventListener('storage', on);
      return () => window.removeEventListener('storage', on);
    },
  };
}

const split = (path: string) => path.split('/').filter(Boolean);
const isObj = (v: unknown): v is Tree => !!v && typeof v === 'object';
const copy = <T>(v: T): T => (v === undefined ? (null as T) : JSON.parse(JSON.stringify(v)));

function getAt(tree: Tree, parts: string[]): unknown {
  let at: unknown = tree;
  for (const p of parts) {
    if (!isObj(at)) return null;
    at = at[p];
  }
  return at ?? null;
}

/** Write (null deletes), dropping parents left empty — the Realtime Database never keeps empty nodes. */
function setAt(tree: Tree, parts: string[], value: unknown): void {
  const chain: Tree[] = [tree];
  for (let i = 0; i < parts.length - 1; i++) {
    const at = chain[i];
    if (!isObj(at[parts[i]])) {
      if (value === null) return;
      at[parts[i]] = {};
    }
    chain.push(at[parts[i]] as Tree);
  }
  const last = chain[chain.length - 1];
  const key = parts[parts.length - 1];
  if (value === null) delete last[key];
  else last[key] = copy(value);
  for (let i = chain.length - 1; i > 0; i--) {
    if (Object.keys(chain[i]).length > 0) break;
    delete chain[i - 1][parts[i - 1]];
  }
}

interface Watcher {
  path: string[];
  cb: (v: unknown) => void;
  last: string;
  live: boolean;
}

export class MemoryHub {
  private watchers = new Set<Watcher>();
  private notifying = false;
  private again = false;

  constructor(
    private backing: Backing = memoryBacking(),
    /** The "server" clock; tests move it by hand. */
    public clock: () => number = () => Date.now(),
  ) {
    backing.onChange(() => this.notify());
  }

  private write(fn: (tree: Tree) => void) {
    const tree = this.backing.load();
    fn(tree);
    this.backing.save(tree);
    this.notify();
  }

  /** Tell every watcher whose value changed. A callback that writes again gets another pass. */
  private notify() {
    if (this.notifying) {
      this.again = true;
      return;
    }
    this.notifying = true;
    do {
      this.again = false;
      const tree = this.backing.load();
      for (const w of [...this.watchers]) {
        if (!w.live) continue;
        const v = getAt(tree, w.path);
        const s = JSON.stringify(v);
        if (s === w.last) continue;
        w.last = s;
        w.cb(copy(v));
      }
    } while (this.again);
    this.notifying = false;
  }

  /** A player connects: their own Store on the shared tree. */
  connect(uid: string, local = true): Store {
    const mine = new Set<Watcher>();
    const onDrop = new Set<string>();
    const ok = Promise.resolve();
    const store: Store = {
      uid,
      local,
      get: (path) => Promise.resolve(copy(getAt(this.backing.load(), split(path)))),
      set: (path, value) => (this.write((t) => setAt(t, split(path), value ?? null)), ok),
      update: (path, patch) => {
        this.write((t) => {
          for (const [k, v] of Object.entries(patch)) setAt(t, [...split(path), ...split(k)], v ?? null);
        });
        return ok;
      },
      remove: (path) => (this.write((t) => setAt(t, split(path), null)), ok),
      claim: (path, value) => {
        let won = false;
        this.write((t) => {
          const cur = getAt(t, split(path));
          won = cur === null || (!isObj(cur) && cur === value);
          if (won) setAt(t, split(path), value);
        });
        return Promise.resolve(won);
      },
      watch: (path, cb) => {
        const v = getAt(this.backing.load(), split(path));
        const w: Watcher = { path: split(path), cb, last: JSON.stringify(v), live: true };
        this.watchers.add(w);
        mine.add(w);
        cb(copy(v));
        return () => {
          w.live = false;
          this.watchers.delete(w);
          mine.delete(w);
        };
      },
      removeOnDisconnect: (path) => (onDrop.add(path), ok),
      cancelOnDisconnect: (path) => (onDrop.delete(path), ok),
      now: () => this.clock(),
      close: () => {
        for (const w of mine) {
          w.live = false;
          this.watchers.delete(w);
        }
        mine.clear();
        if (onDrop.size) this.write((t) => onDrop.forEach((p) => setAt(t, split(p), null)));
        onDrop.clear();
      },
    };
    return store;
  }
}
