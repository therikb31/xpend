// Encrypted gist backup — port of legacy `Gist`.
// Framework-free: the React provider attaches doc access via attach().
// The provider's reducer sets settings.gist.dirty on every user mutation;
// this module only schedules/performs pushes and runs the setup/connect/
// unlock/pull/restore/disconnect flows.

import { C } from "../lib/crypto";
import type { Doc } from "../types";
import { migrateBud, migrateCats, migrateMerch, migrateSav } from "../data/migrate";
import { Store } from "./storage";

interface Hooks {
  getDoc: () => Doc | null;
  /** Replace the doc (triggers render + persist effect). */
  setDoc: (d: Doc) => void;
  /** Persist current doc to local store without touching React state. */
  saved: () => void;
  /** Re-render for gist status changes (Settings sheet). */
  bump: () => void;
  /** Called after a successful push (clears dirty, stamps lastPushedAt). */
  pushed: (at: string) => void;
}

let H: Hooks | null = null;

export function attachGist(h: Hooks): void {
  H = h;
}

function doc(): Doc | null {
  return H ? H.getDoc() : null;
}

export function gistCfg(): Doc["settings"]["gist"] {
  const d = doc();
  return d && d.settings && d.settings.gist;
}

export function gistConnected(): boolean {
  const c = gistCfg();
  return !!c && !!c.gistId;
}

export function gistUnlocked(): boolean {
  return !!Gist.key;
}

export function gistDirty(): boolean {
  const c = gistCfg();
  return !!(c && c.dirty);
}

export const Gist = {
  key: null as CryptoKey | null,
  _t: null as ReturnType<typeof setTimeout> | null,

  /** Debounced push after a mutation (dirty flag is set by the store reducer). */
  schedulePush(): void {
    if (!gistConnected()) return;
    if (!this.key) return; /* locked: queued, push runs after unlock */
    if (Gist._t) clearTimeout(Gist._t);
    Gist._t = setTimeout(() => this.push().catch(() => undefined), 2000);
  },

  kStore(): Promise<void> {
    if (!this.key) return Promise.resolve();
    return crypto.subtle.exportKey("raw", this.key).then((b) => {
      let s = "";
      const u = new Uint8Array(b);
      for (let i = 0; i < u.length; i += 0x8000)
        s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000) as unknown as number[]);
      try {
        localStorage.setItem("xpend:k", btoa(s));
      } catch {
        /* ignore */
      }
    });
  },

  kLoad(): Promise<boolean> {
    let s: string | null = null;
    try {
      s = localStorage.getItem("xpend:k");
    } catch {
      return Promise.resolve(false);
    }
    if (!s) return Promise.resolve(false);
    try {
      const b = atob(s);
      const u = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
      return crypto.subtle
        .importKey("raw", u, "AES-GCM", false, ["encrypt", "decrypt"])
        .then((k) => {
          this.key = k;
          return true;
        })
        .catch(() => false);
    } catch {
      return Promise.resolve(false);
    }
  },

  kClear(): void {
    try {
      localStorage.removeItem("xpend:k");
    } catch {
      /* ignore */
    }
  },

  pat(): Promise<string> {
    const c = gistCfg();
    return C.dec(this.key!, c!.patCipher.iv, c!.patCipher.ct).then((p) => p.trim());
  },

  api(method: string, path: string, body?: unknown): Promise<unknown> {
    return this.pat().then((pat) => {
      const h: Record<string, string> = {
        Accept: "application/vnd.github+json",
        Authorization: "token " + pat,
      };
      return fetch("https://api.github.com" + path, {
        method,
        headers: h,
        body: body ? JSON.stringify(body) : undefined,
      }).then((r) => {
        if (!r.ok)
          return r.json().then((j: { message?: string }) => {
            throw new Error((j && j.message) || "HTTP " + r.status);
          });
        return r.status === 204 ? null : r.json();
      });
    });
  },

  /** Authenticated GitHub login for the stored PAT (used for friend links). */
  async whoami(): Promise<string> {
    const u = (await this.api("GET", "/user")) as { login?: string };
    if (!u || !u.login) throw new Error("No login");
    return u.login;
  },

  envelope(d: Doc, salt: string): Promise<Record<string, unknown>> {
    return C.enc(this.key!, JSON.stringify(d)).then((e) => ({
      v: 1,
      kdf: { alg: "PBKDF2-SHA256", iterations: 210000, salt },
      cipher: "AES-256-GCM",
      iv: e.iv,
      ct: e.ct,
    }));
  },

  async push(force?: boolean): Promise<void> {
    const d = doc();
    const c = gistCfg();
    if (!d || !gistConnected() || !this.key) return;
    if (!force && !c!.dirty) return;
    const gistId = c!.gistId!;
    const env = await this.envelope(d, c!.salt);
    await this.api("PATCH", "/gists/" + gistId, {
      files: { "xpend-backup.json": { content: JSON.stringify(env) } },
    });
    if (H && gistId === gistCfg()?.gistId) H.pushed(new Date().toISOString());
  },

  async setup(pass: string, pat: string): Promise<void> {
    if (!C.sup() || !window.fetch) throw new Error("WebCrypto or fetch unavailable");
    pat = pat.trim();
    const salt = C.b64(C.rand(16));
    this.key = await C.der(pass, salt);
    await this.kStore();
    const pc = await C.enc(this.key, pat);
    const d = doc()!;
    d.settings.gist = { gistId: null, salt, patCipher: pc, dirty: true };
    const env = await this.envelope(d, salt);
    const g = (await this.api("POST", "/gists", {
      description: "Xpend encrypted backup",
      public: false,
      files: { "xpend-backup.json": { content: JSON.stringify(env) } },
    })) as { id: string };
    d.settings.gist.gistId = g.id;
    d.settings.gist.dirty = false;
    d.settings.gist.lastPushedAt = new Date().toISOString();
    H!.setDoc({ ...d });
  },

  /* Connect = find an existing backup and restore it, trying each gist until
     the passphrase matches. Creates a new gist ONLY when no backup exists. */
  async connect(pass: string, pat: string): Promise<{ restored: boolean; gistId: string }> {
    if (!C.sup() || !window.fetch) throw new Error("WebCrypto or fetch unavailable");
    pat = pat.trim();
    const h: Record<string, string> = {
      Accept: "application/vnd.github+json",
      Authorization: "token " + pat,
    };
    const raw = await fetch("https://api.github.com/gists?per_page=100", { headers: h });
    if (!raw.ok) {
      const j = (await raw.json().catch(() => ({}))) as { message?: string };
      throw new Error(j.message || "HTTP " + raw.status);
    }
    const list = (await raw.json()) as Array<{
      id: string;
      updated_at: string;
      files?: Record<string, unknown>;
    }>;
    const cands = (list || [])
      .filter((g) => g.files && g.files["xpend-backup.json"])
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    if (cands.length) {
      for (const cand of cands) {
        try {
          const gid = cand.id;
          const g = (await fetch("https://api.github.com/gists/" + gid, { headers: h }).then((r) =>
            r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))
          )) as { files?: Record<string, { content?: string }> };
          const file = g.files && g.files["xpend-backup.json"];
          if (!file || !file.content) continue;
          const env = JSON.parse(file.content) as {
            v?: number;
            kdf?: { salt?: string };
            iv?: string;
            ct?: string;
          };
          if (!env || env.v !== 1 || !env.kdf || !env.kdf.salt || !env.iv || !env.ct) continue;
          const key = await C.der(pass, env.kdf.salt);
          const restored = JSON.parse(await C.dec(key, env.iv, env.ct)) as Doc;
          if (!restored || restored.schemaVersion !== 1 && restored.schemaVersion !== 2 || !Array.isArray(restored.transactions)) continue;
          this.key = key;
          await this.kStore();
          const prev = restored.settings && restored.settings.gist;
          restored.settings = restored.settings || ({} as Doc["settings"]);
          restored.settings.gist = {
            gistId: gid,
            salt: env.kdf.salt,
            patCipher: await C.enc(key, pat),
            dirty: false,
            lastPushedAt: (prev && prev.lastPushedAt) || undefined,
          };
          H!.setDoc(restored);
          return { restored: true, gistId: gid };
        } catch {
          /* wrong passphrase for this backup — try the next one */
        }
      }
      const err = new Error("Wrong passphrase or corrupt backup");
      err.name = "OperationError";
      throw err;
    }
    await this.setup(pass, pat);
    return { restored: false, gistId: gistCfg()!.gistId! };
  },

  async unlock(pass: string): Promise<boolean> {
    const c = gistCfg();
    if (!c || !c.salt) throw new Error("No backup configured");
    const k = await C.der(pass, c.salt);
    await C.dec(k, c.patCipher.iv, c.patCipher.ct); /* verify without leaving a bad key installed */
    this.key = k;
    await this.kStore();
    if (c.dirty) {
      setTimeout(() => this.push().catch(() => undefined), 500);
      return false;
    }
    return this.pull();
  },

  /* Fetch the current gist backup and load it into the UI */
  async pull(): Promise<boolean> {
    const c = gistCfg();
    if (!c || !c.gistId || !this.key) return false;
    try {
      const g = (await this.api("GET", "/gists/" + c.gistId)) as {
        files?: Record<string, { content?: string }>;
      };
      const file = g.files && g.files["xpend-backup.json"];
      if (!file || !file.content) return false;
      const env = JSON.parse(file.content) as {
        v?: number;
        kdf?: { salt?: string };
        iv?: string;
        ct?: string;
      };
      if (!env || env.v !== 1 || !env.kdf || !env.kdf.salt || !env.iv || !env.ct) return false;
      const restored = JSON.parse(await C.dec(this.key, env.iv, env.ct)) as Doc;
      if (!restored || restored.schemaVersion !== 1 && restored.schemaVersion !== 2 || !Array.isArray(restored.transactions)) return false;
      restored.settings = restored.settings || ({} as Doc["settings"]);
      if (!restored.settings.gist || !restored.settings.gist.gistId) restored.settings.gist = c;
      migrateCats(restored);
      migrateSav(restored);
      migrateBud(restored);
      if (migrateMerch(restored)) Store.set("doc", restored).catch(() => undefined);
      Store.set("doc", restored).catch(() => undefined);
      H!.setDoc(restored);
      return true;
    } catch {
      return false;
    }
  },

  async restore(pass: string, gid: string): Promise<void> {
    const c = gistCfg();
    if (!c) throw new Error("No backup configured");
    this.key = await C.der(pass, c.salt); /* temp key: unlock the stored token */
    const tok = await this.pat(); /* throws if passphrase is wrong */
    const g = (await this.api("GET", "/gists/" + ((gid && gid.trim()) || c.gistId!))) as {
      id: string;
      files?: Record<string, { content?: string }>;
    };
    const file = g.files && g.files["xpend-backup.json"];
    if (!file || !file.content) throw new Error("xpend-backup.json not found in gist");
    const env = JSON.parse(file.content) as {
      v?: number;
      kdf?: { salt?: string };
      iv?: string;
      ct?: string;
    };
    if (!env || env.v !== 1) throw new Error("Unsupported backup format");
    if (!env.kdf || !env.kdf.salt || !env.iv || !env.ct) throw new Error("Unsupported backup format");
    const key = await C.der(pass, env.kdf.salt); /* real key of this backup */
    this.key = key;
    await this.kStore();
    const restored = JSON.parse(await C.dec(key, env.iv, env.ct)) as Doc;
    if (!restored || restored.schemaVersion !== 1 && restored.schemaVersion !== 2 || !Array.isArray(restored.transactions))
      throw new Error("Not a Xpend backup");
    const prev = restored.settings && restored.settings.gist;
    restored.settings = restored.settings || ({} as Doc["settings"]);
    restored.settings.gist = {
      gistId: g.id,
      salt: env.kdf.salt,
      patCipher: await C.enc(key, tok),
      dirty: false,
      lastPushedAt: (prev && prev.lastPushedAt) || undefined,
    };
    migrateCats(restored);
    migrateSav(restored);
    migrateBud(restored);
    if (migrateMerch(restored)) Store.set("doc", restored).catch(() => undefined);
    Store.set("doc", restored).catch(() => undefined);
    H!.setDoc(restored);
  },

  disconnect(): void {
    this.key = null;
    this.kClear();
    const d = doc();
    if (!d) return;
    H!.setDoc({ ...d, settings: { ...d.settings, gist: null } });
  },
};
