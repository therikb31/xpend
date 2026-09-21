// Shared grocery lists — peer replicas over GitHub gists.
// Each member owns one PUBLIC-but-encrypted replica gist of the list
// (description marker carries the shared list id for discovery). Sync is
// read-all-replicas + per-item last-writer-wins merge + push-to-own-replica,
// so every connected member converges without a server.
// Keys: per-list AES key derived from the single app passphrase + list salt,
// cached in localStorage ({salt, key}) exactly like the backup key cache.

import { C } from "../lib/crypto";
import type { GroceryList } from "../types";
import { Gist } from "./gist";

const FILE = "grocery-list.json";
const KIND = "grocery-list";
const ENV_V = 2;

export const replicaMarker = (listId: string): string => `xpend-grocery-list ${listId}`;

interface ListKey {
  salt: string;
  key: CryptoKey;
}

const keyCache = new Map<string, ListKey>();
const replicaCache = new Map<string, string>(); // `${username} ${listId}` -> gistId

function storeKey(listId: string): string {
  return "xpend:gl:" + listId;
}

async function exportRaw(key: CryptoKey): Promise<string> {
  const b = await crypto.subtle.exportKey("raw", key);
  return C.b64(new Uint8Array(b));
}

async function importRaw(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", C.unb(b64), "AES-GCM", true, ["encrypt", "decrypt"]);
}

export async function listKeyLoad(listId: string): Promise<ListKey | null> {
  const hit = keyCache.get(listId);
  if (hit) return hit;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storeKey(listId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { salt: string; key: string };
    if (!o.salt || !o.key) return null;
    const lk = { salt: o.salt, key: await importRaw(o.key) };
    keyCache.set(listId, lk);
    return lk;
  } catch {
    return null;
  }
}

export async function listKeySave(listId: string, salt: string, key: CryptoKey): Promise<void> {
  keyCache.set(listId, { salt, key });
  try {
    localStorage.setItem(storeKey(listId), JSON.stringify({ salt, key: await exportRaw(key) }));
  } catch {
    /* ignore */
  }
}

export function listKeyClear(listId: string): void {
  keyCache.delete(listId);
  try {
    localStorage.removeItem(storeKey(listId));
  } catch {
    /* ignore */
  }
}

interface Envelope {
  v: number;
  kind: string;
  listId: string;
  kdf: { alg: string; iterations: number; salt: string };
  cipher: string;
  iv: string;
  ct: string;
}

async function seal(list: GroceryList, lk: ListKey): Promise<Envelope> {
  const e = await C.enc(lk.key, JSON.stringify(list));
  return {
    v: ENV_V,
    kind: KIND,
    listId: list.id,
    kdf: { alg: "PBKDF2-SHA256", iterations: 210000, salt: lk.salt },
    cipher: "AES-256-GCM",
    iv: e.iv,
    ct: e.ct,
  };
}

function validList(o: unknown, listId: string): o is GroceryList {
  const l = o as GroceryList;
  return !!l && l.id === listId && Array.isArray(l.items);
}

/** Read a replica gist (any member's) and decrypt with the cached list key. */
export async function pullReplica(gistId: string, listId: string): Promise<GroceryList | null> {
  const lk = await listKeyLoad(listId);
  if (!lk) return null;
  try {
    const g = (await Gist.api("GET", "/gists/" + gistId)) as {
      files?: Record<string, { content?: string }>;
    };
    const content = g && g.files && g.files[FILE] && g.files[FILE].content;
    if (!content) return null;
    const env = JSON.parse(content) as Envelope;
    if (!env || env.listId !== listId) return null;
    const raw = await C.dec(lk.key, env.iv, env.ct);
    const list = JSON.parse(raw) as GroceryList;
    return validList(list, listId) ? list : null;
  } catch {
    return null;
  }
}

/** Push a list to MY replica gist. */
export async function pushReplica(list: GroceryList, gistId: string): Promise<void> {
  const lk = await listKeyLoad(list.id);
  if (!lk) return;
  const env = await seal(list, lk);
  await Gist.api("PATCH", "/gists/" + gistId, {
    files: { [FILE]: { content: JSON.stringify(env) } },
  });
}

/** Create MY replica gist for a list. Uses the shared list salt (generated
    once by the sharer and carried in the invite link) so every member
    derives the same key from the single app passphrase. */
export async function createReplica(list: GroceryList, pass: string, salt: string): Promise<string> {
  if (!C.sup()) throw new Error("WebCrypto unavailable");
  if (!salt) throw new Error("No salt");
  const key = await C.der(pass, salt);
  await listKeySave(list.id, salt, key);
  const env = await seal(list, { salt, key });
  const g = (await Gist.api("POST", "/gists", {
    description: replicaMarker(list.id),
    public: true,
    files: { [FILE]: { content: JSON.stringify(env) } },
  })) as { id: string };
  if (!g || !g.id) throw new Error("No gist id");
  return g.id;
}

/** Find a member's replica gist id by username + list id (cached). */
export async function findReplica(username: string, listId: string): Promise<string | null> {
  const ck = username.toLowerCase() + " " + listId;
  const hit = replicaCache.get(ck);
  if (hit) return hit;
  try {
    const gs = (await Gist.api(
      "GET",
      "/users/" + encodeURIComponent(username) + "/gists?per_page=100"
    )) as Array<{ id: string; description?: string | null }>;
    const want = replicaMarker(listId);
    const found = (gs || []).find((g) => (g.description || "") === want);
    if (found) {
      replicaCache.set(ck, found.id);
      return found.id;
    }
    return null;
  } catch {
    return null;
  }
}

export function forgetReplica(username: string, listId: string): void {
  replicaCache.delete(username.toLowerCase() + " " + listId);
}

/** Join via the sender's replica: discover + pull with the cached list key
    (caller derives it from the invite-link salt + passphrase first). */
export async function joinVia(username: string, listId: string): Promise<GroceryList | null> {
  const gistId = await findReplica(username, listId);
  if (!gistId) return null;
  return pullReplica(gistId, listId);
}

// ---------------- merge (shared-branch semantics) ----------------

export interface MergeResult {
  list: GroceryList;
  changed: boolean;
}

/** Per-item last-writer-wins on updatedAt (ties keep local). Tombstones ride
    along as ordinary fields. List name follows the newest updatedAt. */
export function mergeLists(local: GroceryList, remote: GroceryList): MergeResult {
  const out: GroceryList = {
    ...local,
    items: (local.items || []).map((i) => ({ ...i })),
  };
  let changed = false;
  const byId = new Map(out.items.map((i) => [i.id, i]));
  for (const r of remote.items || []) {
    const l = byId.get(r.id);
    if (!l) {
      out.items.push({ ...r });
      changed = true;
    } else if ((r.updatedAt || 0) > (l.updatedAt || 0)) {
      Object.assign(l, { ...r });
      changed = true;
    }
  }
  if ((remote.updatedAt || 0) > (local.updatedAt || 0)) {
    if (remote.name !== local.name) {
      out.name = remote.name;
      changed = true;
    }
    out.updatedAt = remote.updatedAt;
  } else {
    out.updatedAt = Math.max(local.updatedAt || 0, remote.updatedAt || 0);
    if (out.updatedAt !== local.updatedAt) changed = true;
  }
  return { list: out, changed };
}
