// Shared grocery lists — peer replicas over GitHub gists.
// Each member owns one PUBLIC-but-encrypted replica gist of the list
// (description marker carries the shared list id for discovery). Sync is
// read-all-replicas + per-item last-writer-wins merge + push-to-own-replica,
// so every connected member converges without a server.
// Keys: per-list AES key derived from the single app passphrase + list salt,
// cached in localStorage ({salt, key}) exactly like the backup key cache.

import { C } from "../lib/crypto";
import type { Friend, GroceryList } from "../types";
import { importRawKey } from "./escrow";
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

/** Create MY replica gist with an explicit key (OAuth-era random keys or
    keys imported from a #/s/ invite link). The salt is envelope metadata. */
export async function createReplicaWithKey(
  list: GroceryList,
  salt: string,
  key: CryptoKey
): Promise<string> {
  if (!salt) throw new Error("No salt");
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

/** Random 256-bit list key (no passphrase involved). */
export async function randomListKey(): Promise<CryptoKey> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
}

/** Find a member's replica gist id by username + list id (cached). */
export async function findReplica(username: string, listId: string): Promise<string | null> {
  const ck = username.toLowerCase() + " " + listId;
  const hit = replicaCache.get(ck);
  if (hit) return hit;
  const gists = await friendGists(username);
  const want = replicaMarker(listId);
  const found = (gists || []).find((g) => (g.description || "") === want);
  if (found) {
    replicaCache.set(ck, found.id);
    return found.id;
  }
  return null;
}

export function forgetReplica(username: string, listId: string): void {
  replicaCache.delete(username.toLowerCase() + " " + listId);
}

// ---------------- pair secrets + key envelopes (multi-member) ----------------

export interface FriendGist {
  id: string;
  description?: string | null;
}

/** One listing call per friend; marker + envelope scans share it. */
export async function friendGists(username: string): Promise<FriendGist[]> {
  try {
    const gs = (await Gist.api(
      "GET",
      "/users/" + encodeURIComponent(username) + "/gists?per_page=100"
    )) as FriendGist[];
    return gs || [];
  } catch {
    return [];
  }
}

export const LIST_MARKER_PREFIX = "xpend-grocery-list ";
export const envelopeMarker = (listId: string, forUser: string): string =>
  `xpend-listkey ${listId} ${forUser.toLowerCase()}`;

/** Wrap a list key for one member using the pair secret. */
export async function wrapListKey(listKeyB64: string, pairSecretB64: string): Promise<{ iv: string; ct: string }> {
  const pairKey = await importRawKey(pairSecretB64);
  return C.enc(pairKey, listKeyB64);
}

/** Unwrap a list key with the pair secret (null when not ours). */
export async function unwrapListKey(iv: string, ct: string, pairSecretB64: string): Promise<string | null> {
  try {
    const pairKey = await importRawKey(pairSecretB64);
    const raw = await C.dec(pairKey, iv, ct);
    await importRawKey(raw); // trial import proves it is a key
    return raw;
  } catch {
    return null;
  }
}

export interface KeyEnvelope {
  gistId: string;
  from: string;
  listId: string;
  iv: string;
  ct: string;
}

/** Publish a key envelope so one member can unwrap the group key. */
export async function publishEnvelope(
  listId: string,
  forUser: string,
  fromUser: string,
  groupKeyB64: string,
  pairSecretB64: string
): Promise<string> {
  const e = await wrapListKey(groupKeyB64, pairSecretB64);
  const g = (await Gist.api("POST", "/gists", {
    description: envelopeMarker(listId, forUser),
    public: true,
    files: {
      "list-key.json": {
        content: JSON.stringify({ v: 1, for: forUser.toLowerCase(), from: fromUser, iv: e.iv, ct: e.ct }),
      },
    },
  })) as { id: string };
  if (!g || !g.id) throw new Error("No gist id");
  return g.id;
}

/** Read + unwrap a key envelope with the pair secret. */
export async function openEnvelope(gistId: string, pairSecretB64: string): Promise<string | null> {
  try {
    const g = (await Gist.api("GET", "/gists/" + gistId)) as {
      files?: Record<string, { content?: string }>;
    };
    const content = g && g.files && g.files["list-key.json"] && g.files["list-key.json"].content;
    if (!content) return null;
    const o = JSON.parse(content) as { v?: number; iv?: string; ct?: string };
    if (!o || o.v !== 1 || !o.iv || !o.ct) return null;
    return unwrapListKey(o.iv, o.ct, pairSecretB64);
  } catch {
    return null;
  }
}

/** All key envelopes for me in one friend's listing (caller filters/validates). */
export function envelopeHits(
  gists: FriendGist[],
  myUsername: string | null,
  pairSecrets: Array<{ username: string; secret: string }>
): Array<{ gistId: string; listId: string; secret: string }> {
  const out: Array<{ gistId: string; listId: string; secret: string }> = [];
  for (const g of gists) {
    const d = g.description || "";
    if (!d.startsWith("xpend-listkey ")) continue;
    const parts = d.split(" ");
    if (parts.length < 3) continue;
    const listId = parts[1];
    const forUser = parts.slice(2).join(" ");
    // Without a known login we try every pair secret (decrypt-fail = skip).
    const cands = myUsername
      ? pairSecrets.filter(() => forUser === myUsername.toLowerCase())
      : pairSecrets;
    for (const c of cands) out.push({ gistId: g.id, listId, secret: c.secret });
  }
  return out;
}

/** My GitHub login, cached (best-effort; null when unknown/offline). */
const LS_ME = "xpend:me";

export function myUsername(): string | null {
  try {
    return localStorage.getItem(LS_ME);
  } catch {
    return null;
  }
}

export function setMyUsername(u: string | null): void {
  try {
    if (u) localStorage.setItem(LS_ME, u.toLowerCase());
    else localStorage.removeItem(LS_ME);
  } catch {
    /* ignore */
  }
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

// ---------------- reciprocal roster (mutual visibility) ----------------

export const LAST_SEEN_INTERVAL = 3600 * 1000;

/** Best-effort GitHub avatar for a username (null when unknown/offline). */
export async function fetchAvatar(username: string): Promise<string | null> {
  try {
    const u = (await Gist.api("GET", "/users/" + encodeURIComponent(username))) as {
      login?: string;
      avatar_url?: string | null;
    };
    return u && u.login ? u.avatar_url || null : null;
  } catch {
    return null;
  }
}

export interface RosterTouch {
  friends: Friend[];
  changed: boolean;
}

/**
 * Ensure a roster entry for a peer whose live replica we just read (proof
 * they are actively sharing). Never overwrites displayName/pairSecret —
 * only fills gaps. Pure (testable); caller persists when changed.
 */
export function ensurePeerRoster(friends: Friend[], username: string, avatar: string | null): RosterTouch {
  const u = (username || "").toLowerCase();
  if (!u) return { friends, changed: false };
  const list = friends.map((f) => ({ ...f }));
  const ex = list.find((f) => f.githubUsername === u);
  if (!ex) {
    list.push({ githubUsername: u, displayName: u, avatarUrl: avatar, addedAt: Date.now() });
    return { friends: list, changed: true };
  }
  if (avatar && !ex.avatarUrl) {
    ex.avatarUrl = avatar;
    return { friends: list, changed: true };
  }
  return { friends: list, changed: false };
}

/** Stamp lastSeenAt, throttled to LAST_SEEN_INTERVAL (bounds backup pushes). */
export function touchLastSeen(friends: Friend[], username: string, now: number): RosterTouch {
  const u = (username || "").toLowerCase();
  const list = friends.map((f) => ({ ...f }));
  const ex = list.find((f) => f.githubUsername === u);
  if (!ex) return { friends: list, changed: false };
  if (!ex.lastSeenAt || now - ex.lastSeenAt > LAST_SEEN_INTERVAL) {
    ex.lastSeenAt = now;
    return { friends: list, changed: true };
  }
  return { friends: list, changed: false };
}
