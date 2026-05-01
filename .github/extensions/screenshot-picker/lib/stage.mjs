// stage.mjs — In-memory staged screenshot set, scoped to extension process lifetime.
//
// Set semantics: keyed by absolute path (after path.resolve). Adding a path
// already in the set is a no-op (dedup).

import path from "node:path";

export function createStage() {
  const set = new Set();
  return {
    add(p) {
      if (typeof p !== "string" || p.length === 0) return false;
      const key = path.resolve(p);
      if (set.has(key)) return false;
      set.add(key);
      return true;
    },
    addMany(arr) {
      let count = 0;
      for (const p of arr ?? []) if (this.add(p)) count++;
      return count;
    },
    remove(p) {
      const key = path.resolve(p);
      return set.delete(key);
    },
    has(p) {
      return set.has(path.resolve(p));
    },
    clear() {
      const n = set.size;
      set.clear();
      return n;
    },
    size() {
      return set.size;
    },
    list() {
      return [...set];
    },
  };
}
