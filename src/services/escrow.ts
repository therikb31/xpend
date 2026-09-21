// Key escrow + lossless-migration helpers for the passphrase → OAuth move.
// Escrow = one PRIVATE gist holding the raw doc key (base64). Data still
// flows through the backup gist; escrow only answers "which key opens it".
// Migration is a resumable state machine (xpend:mig) with a full pre-step
// snapshot (xpend:pre-oauth) and read-back verification after every write.

import { C } from "../lib/crypto";
import type { Doc } from "../types";
import { ghApi } from "./githubAuth";

export const ESCROW_DESC = "Xpend key escrow";
const ESCROW_FILE = "xpend-key.json";

const LS_SNAP = "xpend:pre-oauth";
const LS_MIG = "xpend:mig";

export type MigState = "idle" | "pushed" | "escrowed" | "verified" | "linked";

export async function exportRawKey(key: CryptoKey): Promise<string> {
  return C.b64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

export async function importRawKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", C.unb(b64), "AES-GCM", true, ["encrypt", "decrypt"]);
}

/** Short public fingerprint of a key (safe to read aloud, useless to steal). */
export async function keyFingerprint(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  const digest = await crypto.subtle.digest("SHA-256", raw);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 4) + "-" + hex.slice(4, 8) + "-" + hex.slice(8, 12);
}

export async function findEscrow(): Promise<string | null> {
  const gs = (await ghApi("GET", "/user/gists?per_page=100")) as Array<{
    id: string;
    description?: string | null;
    public?: boolean;
  }>;
  const hit = (gs || []).find((g) => (g.description || "") === ESCROW_DESC);
  return hit ? hit.id : null;
}

export interface EscrowPayload {
  gistId: string;
  isPrivate: boolean;
  keyB64: string;
}

export async function readEscrow(gistId: string): Promise<EscrowPayload | null> {
  try {
    const g = (await ghApi("GET", "/gists/" + gistId)) as {
      public?: boolean;
      files?: Record<string, { content?: string }>;
    };
    const content = g && g.files && g.files[ESCROW_FILE] && g.files[ESCROW_FILE].content;
    if (!content) return null;
    const o = JSON.parse(content) as { v?: number; key?: string };
    if (!o || o.v !== 1 || !o.key) return null;
    // Trial import proves the payload is a real key before trusting it.
    await importRawKey(o.key);
    return { gistId, isPrivate: g.public !== true, keyB64: o.key };
  } catch {
    return null;
  }
}

export async function writeEscrow(keyB64: string): Promise<string> {
  const g = (await ghApi("POST", "/gists", {
    description: ESCROW_DESC,
    public: false,
    files: { [ESCROW_FILE]: { content: JSON.stringify({ v: 1, key: keyB64 }) } },
  })) as { id: string };
  if (!g || !g.id) throw new Error("No gist id");
  return g.id;
}

// ---------------- migration state + snapshot ----------------

export function getMig(): { state: MigState; at: number } {
  try {
    const raw = localStorage.getItem(LS_MIG);
    if (raw) {
      const o = JSON.parse(raw) as { state: MigState; at: number };
      if (o && typeof o.state === "string") return o;
    }
  } catch {
    /* ignore */
  }
  return { state: "idle", at: 0 };
}

export function setMig(state: MigState): void {
  try {
    localStorage.setItem(LS_MIG, JSON.stringify({ state, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export interface Snapshot {
  doc: Doc;
  at: number;
}

export function takeSnapshot(doc: Doc): void {
  try {
    localStorage.setItem(LS_SNAP, JSON.stringify({ doc, at: Date.now() } satisfies Snapshot));
  } catch {
    /* snapshot too large for quota — surface at call site */
    throw new Error("snapshot-quota");
  }
}

export function readSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(LS_SNAP);
    if (!raw) return null;
    const o = JSON.parse(raw) as Snapshot;
    if (!o || !o.doc || !Array.isArray(o.doc.transactions)) return null;
    return o;
  } catch {
    return null;
  }
}

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(LS_SNAP);
  } catch {
    /* ignore */
  }
}
