// Local persistence cascade: IndexedDB → localStorage → memory.
// Verbatim port of legacy `Store`, including legacy `quanto` migrations.

type Kind = "mem" | "local" | "idb";

class StoreImpl {
  kind: Kind = "mem";
  db: IDBDatabase | null = null;
  mem: Record<string, unknown> = {};
  private _k: Kind = "mem";

  init(): Promise<this> {
    return new Promise((res) => {
      let localOk = false;
      try {
        localStorage.setItem("__q", "1");
        localStorage.removeItem("__q");
        localOk = true;
      } catch {
        /* storage unavailable */
      }
      this._k = localOk ? "local" : "mem";
      let idb: IDBFactory | null = null;
      try {
        idb = window.indexedDB;
      } catch {
        /* no indexedDB */
      }
      if (!idb) {
        this.kind = this._k;
        return res(this);
      }
      try {
        const rq = idb.open("xpend", 1);
        rq.onupgradeneeded = (e) => {
          (e.target as IDBOpenDBRequest).result.createObjectStore("kv");
        };
        rq.onsuccess = () => {
          this.db = rq.result;
          this.kind = "idb";
          this.migrate().then(() => res(this));
        };
        rq.onerror = () => {
          this.kind = this._k;
          res(this);
        };
        rq.onblocked = () => {
          this.kind = this._k;
          res(this);
        };
      } catch {
        this.kind = this._k;
        res(this);
      }
    });
  }

  private _has(k: string): Promise<boolean> {
    return new Promise((r) => {
      try {
        const st = this.db!.transaction("kv");
        const t = st.objectStore("kv").get(k);
        t.onsuccess = () => r(t.result != null);
        t.onerror = () => r(false);
      } catch {
        r(false);
      }
    });
  }

  private _put(k: string, v: unknown): Promise<boolean> {
    return new Promise((r) => {
      try {
        const t = this.db!.transaction("kv", "readwrite").objectStore("kv").put(v, k);
        t.onsuccess = () => r(true);
        t.onerror = () => r(false);
      } catch {
        r(false);
      }
    });
  }

  async migrate(): Promise<void> {
    if (!(await this._has("doc"))) {
      /* legacy IDB db from the "quanto" era */
      try {
        const old = await new Promise<IDBDatabase | null>((r) => {
          const q = indexedDB.open("quanto", 1);
          q.onupgradeneeded = () => undefined;
          q.onsuccess = () => r(q.result);
          q.onerror = () => r(null);
        });
        if (old) {
          try {
            const doc = await new Promise<unknown>((r) => {
              try {
                const t = old.transaction("kv").objectStore("kv").get("doc");
                t.onsuccess = () => r(t.result || null);
                t.onerror = () => r(null);
              } catch {
                r(null);
              }
            });
            if (doc) await this._put("doc", doc);
          } catch {
            /* ignore */
          }
          try {
            old.close();
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }
    /* legacy localStorage prefix */
    try {
      const oldR = localStorage.getItem("quanto:doc");
      if (oldR) {
        localStorage.setItem("xpend:doc", oldR);
        localStorage.removeItem("quanto:doc");
      }
      const newR = localStorage.getItem("xpend:doc");
      if (newR && this.kind === "idb") {
        await this._put("doc", JSON.parse(newR));
        localStorage.removeItem("xpend:doc");
      }
    } catch {
      /* ignore */
    }
  }

  get<T>(k: string): Promise<T | null> {
    return new Promise((res) => {
      if (this.kind === "idb") {
        try {
          const st = this.db!.transaction("kv");
          const t = st.objectStore("kv").get(k);
          t.onsuccess = () => res((t.result as T) || null);
          t.onerror = () => res(null);
        } catch {
          res(null);
        }
      } else if (this.kind === "local") {
        try {
          const r = localStorage.getItem("xpend:" + k);
          res(r ? (JSON.parse(r) as T) : null);
        } catch {
          res(null);
        }
      } else {
        res(k in this.mem ? (this.mem[k] as T) : null);
      }
    });
  }

  set(k: string, v: unknown): Promise<boolean> {
    return new Promise((res) => {
      if (this.kind === "idb") {
        try {
          const t = this.db!.transaction("kv", "readwrite").objectStore("kv").put(v, k);
          t.onsuccess = () => res(true);
          t.onerror = () => res(false);
        } catch {
          res(false);
        }
      } else if (this.kind === "local") {
        try {
          localStorage.setItem("xpend:" + k, JSON.stringify(v));
          res(true);
        } catch {
          res(false);
        }
      } else {
        this.mem[k] = v;
        res(true);
      }
    });
  }
}

export const Store = new StoreImpl();
