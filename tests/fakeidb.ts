/**
 * A small stand-in for the browser's IndexedDB: as much as the app uses (open, create a store, a transaction
 * with put, get, delete and clear), with the events in the order the browser fires them. A transaction is
 * done all at once or not at all; `fail` makes the next ones that write fail, to see that nothing half is kept.
 */
type Done = (() => void) | null;
interface Req {
  result: unknown;
  error: unknown;
  onsuccess: Done;
  onerror: Done;
  onupgradeneeded: Done;
}

const request = (): Req => ({ result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null });
/** after what the caller does next, as the browser's events come: later, never at once */
const later = (fn: () => void): void => void Promise.resolve().then(() => Promise.resolve()).then(fn);

export interface FakeIDB {
  /** what goes in place of indexedDB */
  api: unknown;
  /** the data kept, by database and store */
  data: Map<string, Map<string, Map<unknown, unknown>>>;
  /** from now on, transactions that write fail (and change nothing) */
  fail(on: boolean): void;
}

export function fakeIndexedDB(): FakeIDB {
  const data = new Map<string, Map<string, Map<unknown, unknown>>>();
  let failing = false;
  const api = {
    open(name: string): Req {
      const req = request();
      later(() => {
        const fresh = !data.has(name);
        if (fresh) data.set(name, new Map());
        const stores = data.get(name)!;
        req.result = {
          createObjectStore(s: string): void {
            stores.set(s, new Map());
          },
          transaction(s: string) {
            const kept = stores.get(s);
            if (!kept) throw new Error(`no store ${s}`);
            const ops: { req: Req; write: boolean; run: (m: Map<unknown, unknown>) => unknown }[] = [];
            const op = (write: boolean, run: (m: Map<unknown, unknown>) => unknown): Req => {
              const r = request();
              ops.push({ req: r, write, run });
              return r;
            };
            const tx = {
              oncomplete: null as Done,
              onerror: null as Done,
              onabort: null as Done,
              objectStore: () => ({
                put: (v: unknown, k: unknown) => op(true, (m) => void m.set(k, v)),
                get: (k: unknown) => op(false, (m) => m.get(k)),
                delete: (k: unknown) => op(true, (m) => void m.delete(k)),
                clear: () => op(true, (m) => m.clear()),
              }),
            };
            later(() => {
              if (failing && ops.some((o) => o.write)) {
                for (const o of ops) o.req.onerror?.();
                tx.onerror?.();
                return;
              }
              const copy = new Map(kept);
              for (const o of ops) o.req.result = o.run(copy);
              kept.clear();
              copy.forEach((v, k) => kept.set(k, v));
              for (const o of ops) o.req.onsuccess?.();
              tx.oncomplete?.();
            });
            return tx;
          },
        };
        if (fresh) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  return { api, data, fail: (on) => void (failing = on) };
}
