// Sync engine — mounted once in the app shell.
// - Pushes shared lists to my replica gist (debounced, skips unchanged).
// - While Groceries is open: polls each peer's replica and merges.
// - Discovery pass (any view, 60s): for roster friends with pair secrets,
//   scans their public gists for unknown list markers + key envelopes and
//   auto-joins (no approval). Silent except join toasts; background errors
//   never toast.
// API access = backup unlocked OR GitHub linked.

import { useEffect, useRef } from "react";
import { useApp } from "../services/store";
import { Gist, gistUnlocked } from "../services/gist";
import { ghLinked, ghWhoami } from "../services/githubAuth";
import { exportRawKey, importRawKey } from "../services/escrow";
import type { Doc, Friend, GroceryList } from "../types";
import {
  createReplicaWithKey,
  ensurePeerRoster,
  fetchAvatar,
  findReplica,
  followerNeedsCheck,
  forgetReplica,
  friendGists,
  listKeyLoad,
  listKeySave,
  markIssue,
  markPulled,
  markPushed,
  mergeLists,
  myUsername,
  openEnvelope,
  parseAckMarker,
  pullReplica,
  pushReplica,
  ReplicaError,
  setMyUsername,
  touchLastSeen,
  LAST_SEEN_INTERVAL,
  LIST_MARKER_PREFIX,
} from "../services/grocerySync";
import { C } from "../lib/crypto";

/** Replica payload carries no local share metadata (members gossip along). */
function payload(l: GroceryList): GroceryList {
  return { ...l, share: null, items: (l.items || []).map((i) => ({ ...i })) };
}

function canApi(): boolean {
  return gistUnlocked() || ghLinked();
}

/** Last pushed payload per list (module-level: shared by debounce + flush). */
const pushedBodies = new Map<string, string>();

/** Push my replicas for every shared list with changes. Returns pushed ids. */
export async function pushSharedLists(doc: Doc): Promise<string[]> {
  const done: string[] = [];
  const shared = (doc.groceryLists || []).filter((l) => l.share && l.share.gistId);
  for (const l of shared) {
    try {
      const lk = await listKeyLoad(l.id);
      if (!lk) {
        markIssue(l.id, "missing-key");
        continue;
      }
      const body = JSON.stringify(payload(l));
      if (pushedBodies.get(l.id) === body) continue;
      await pushReplica(payload(l), l.share!.gistId);
      pushedBodies.set(l.id, body);
      markPushed(l.id);
      done.push(l.id);
    } catch {
      markIssue(l.id, "push-failed");
    }
  }
  return done;
}

/** Session-dismissed follower logins (organic follows re-checked next launch). */
const dismissedFollowers = new Set<string>();

/** Reciprocal roster touch after reading a peer's live replica. Gated so
    untouched peers cost zero writes; avatar fetched only when missing. */
async function notePeerActive(
  doc: Doc | null,
  mutate: (fn: (d: Doc) => void) => void,
  peer: string
): Promise<void> {
  if (!doc) return;
  const u = (peer || "").toLowerCase();
  if (!u) return;
  const ex = (doc.settings.friends || []).find((f) => f.githubUsername === u);
  const now = Date.now();
  const needAvatar = !ex || !ex.avatarUrl;
  const needTouch = !ex || !ex.lastSeenAt || now - ex.lastSeenAt > LAST_SEEN_INTERVAL;
  if (!needAvatar && !needTouch) return;
  const av = needAvatar ? await fetchAvatar(u) : null;
  mutate((d) => {
    const r1 = ensurePeerRoster(d.settings.friends || [], u, av);
    const r2 = touchLastSeen(r1.friends, u, Date.now());
    if (r1.changed || r2.changed) d.settings.friends = r2.friends;
  });
}

export function useGrocerySync() {
  const { state, mutate, toast } = useApp();
  const docRef = useRef(state.doc);
  docRef.current = state.doc;
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const busyRef = useRef(false);
  const discoverRef = useRef(false);

  // ---- push my replicas (debounced; any view) ----
  useEffect(() => {
    const doc = state.doc;
    if (!doc || !canApi()) return;
    const shared = (doc.groceryLists || []).filter((l) => l.share && l.share.gistId);
    if (!shared.length) return;
    const t = setTimeout(() => {
      pushSharedLists(doc).catch(() => undefined);
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.doc]);

  // ---- flush replicas when the page hides (add-then-close loses nothing) ----
  useEffect(() => {
    const flush = () => {
      const d = docRef.current;
      if (d && canApi()) pushSharedLists(d).catch(() => undefined);
    };
    const vis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("pagehide", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- poll peers while Groceries is open ----
  useEffect(() => {
    const doc = state.doc;
    if (!doc || state.view !== "groceries" || !canApi()) return;
    let dead = false;

    const run = async () => {
      if (busyRef.current || dead) return;
      const cur = docRef.current;
      if (!cur) return;
      const shared = (cur.groceryLists || []).filter((l) => l.share && (l.share.peers || []).length);
      if (!shared.length) return;
      busyRef.current = true;      try {
        for (const l of shared) {
          if (dead) break;
          const lk = await listKeyLoad(l.id);
          if (!lk || dead) continue;
          let merged: GroceryList = {
            ...l,
            items: (l.items || []).map((i) => ({ ...i })),
          };
          let changed = false;
          for (const peer of l.share!.peers) {
            if (dead) break;
            try {
              const gid = await findReplica(peer, l.id);
              if (!gid) {
                markIssue(l.id, "not-found");
                continue;
              }
              let remote: GroceryList;
              try {
                remote = await pullReplica(gid, l.id);
              } catch (e) {
                if (e instanceof ReplicaError && e.kind === "not-found") {
                  // Replica recreated (new gist id): drop the stale cache so
                  // the next pass rediscovers instead of 404ing forever.
                  forgetReplica(peer, l.id);
                }
                markIssue(l.id, e instanceof ReplicaError ? e.kind : "network");
                continue;
              }
              markPulled(l.id);
              const r = mergeLists(merged, remote);
              merged = r.list;
              changed = changed || r.changed;
              // Reciprocal roster: a live replica proves they share with us —
              // ensure they show up (never overwrites name/secret), throttled.
              try {
                await notePeerActive(docRef.current, mutateRef.current, peer);
              } catch {
                /* best-effort only */
              }
            } catch {
              /* one bad peer must not block the rest */
            }
          }
          if (changed && !dead) {
            const snap = merged;
            mutateRef.current((d) => {
              const t = (d.groceryLists || []).find((x) => x.id === snap.id);
              if (!t) return;
              t.name = snap.name;
              t.items = snap.items;
              t.updatedAt = snap.updatedAt;
              // Membership gossip: union discovered members into peers.
              const me = myUsername();
              const known = new Set([...((t.share && t.share.peers) || [])]);
              let grew = false;
              for (const m of snap.members || []) {
                const u = (m || "").toLowerCase();
                if (u && u !== me && !known.has(u)) {
                  known.add(u);
                  grew = true;
                }
              }
              if (grew && t.share) {
                t.share.peers = [...known];
                t.updatedAt = Math.max(t.updatedAt || 0, Date.now());
              }
              if (snap.members && snap.members.length) {
                const have = new Set(t.members || []);
                const union = [...(t.members || [])];
                for (const m of snap.members) {
                  if (m && !have.has(m)) {
                    have.add(m);
                    union.push(m);
                  }
                }
                if (union.length !== (t.members || []).length) t.members = union;
              }
            });
          }
        }
      } finally {
        busyRef.current = false;
      }
    };

    run();
    const t = setInterval(run, 25000);
    const vis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      dead = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.doc, state.view]);

  // ---- discovery: auto-join lists shared with me (any view, 60s) ----
  useEffect(() => {
    const doc = state.doc;
    if (!doc || !canApi()) return;
    let dead = false;

    const run = async () => {
      if (discoverRef.current || dead) return;
      const cur = docRef.current;
      if (!cur) return;
      discoverRef.current = true;
      try {
        try {
          const me = await ghWhoami().catch(() => null);
          if (me) setMyUsername(me);
        } catch {
          /* best-effort */
        }
        const friends = (cur.settings.friends || []).filter((f) => f.pairSecret);
        if (friends.length) {
          const mine = new Set((cur.groceryLists || []).map((l) => l.id));
          for (const f of friends as Friend[]) {
            if (dead) break;
            const secret = f.pairSecret!;
            let gists: Awaited<ReturnType<typeof friendGists>> = [];
            try {
              gists = await friendGists(f.githubUsername);
            } catch {
              continue;
            }
            if (dead) break;
            // Unknown list markers from this friend.
            const unknown = new Map<string, string>();
            for (const g of gists) {
              const d = g.description || "";
              if (d.startsWith(LIST_MARKER_PREFIX)) {
                const id = d.slice(LIST_MARKER_PREFIX.length).trim();
                if (id && !mine.has(id)) unknown.set(id, g.id);
              }
            }
            for (const [listId] of unknown) {
              if (dead) break;
              try {
                await autoJoin(f.githubUsername, listId, secret, gists);
                mine.add(listId);
              } catch {
                /* skip — retry next pass */
              }
            }
          }
        }
        // Doorbell check runs independently: newcomers have no pair secret
        // yet, which is exactly when they need to be discovered.
        try {
          await doorbellCheck();
        } catch {
          /* best-effort only */
        }
      } finally {
        discoverRef.current = false;
      }
    };

    /** A's side of the doorbell: own followers + ack markers → auto-add. */
    const doorbellCheck = async (): Promise<void> => {
      const cur = docRef.current;
      if (!cur || dead) return;
      let me = myUsername();
      if (!me) {
        try {
          me = await ghWhoami();
        } catch {
          try {
            me = await Gist.whoami();
          } catch {
            me = null;
          }
        }
        if (me) setMyUsername(me);
      }
      if (!me) return;
      const self = me.toLowerCase();
      let followers: Array<{ login?: string; avatar_url?: string | null }> = [];
      try {
        followers = (await Gist.api("GET", "/users/" + encodeURIComponent(self) + "/followers?per_page=100")) as Array<{
          login?: string;
          avatar_url?: string | null;
        }>;
      } catch {
        return;
      }
      if (dead) return;
      const roster = (docRef.current && docRef.current.settings.friends) || [];
      for (const f of followers || []) {
        if (dead) break;
        const login = (f.login || "").toLowerCase();
        if (!login || !followerNeedsCheck(roster, dismissedFollowers, login)) continue;
        let acked = false;
        try {
          const gists = await friendGists(login);
          acked = gists.some((g) => parseAckMarker(g.description, self));
        } catch {
          continue;
        }
        if (dead) break;
        if (!acked) {
          if (dismissedFollowers.size > 500) dismissedFollowers.clear();
          dismissedFollowers.add(login);
          continue;
        }
        mutateRef.current((d) => {
          const r = ensurePeerRoster(d.settings.friends || [], login, f.avatar_url || null);
          if (r.changed) d.settings.friends = r.friends;
        });
        toastRef.current("@" + login + " added you back");
      }
    };

    const autoJoin = async (
      from: string,
      listId: string,
      secret: string,
      gists: Awaited<ReturnType<typeof friendGists>>
    ): Promise<void> => {
      // 1. direct decrypt with the pair secret (pair-shared list).
      let keyB64: string | null = null;
      let remote: GroceryList | null = null;
      const directId = (gists.find((g) => (g.description || "") === `xpend-grocery-list ${listId}`) || {}).id;
      if (directId) {
        try {
          const key = await importRawKey(secret);
          const saltMeta = C.b64(C.rand(16));
          await listKeySave(listId, saltMeta, key);
          remote = await pullReplica(directId, listId);
          if (remote) keyB64 = await exportRawKey(key);
        } catch {
          remote = null;
        }
      }
      // 2. key envelope addressed to me (group list).
      if (!remote) {
        const me = myUsername();
        for (const g of gists) {
          const d = g.description || "";
          if (!d.startsWith("xpend-listkey ")) continue;
          const parts = d.split(" ");
          if (parts.length < 3 || parts[1] !== listId) continue;
          if (me && parts.slice(2).join(" ") !== me) continue;
          const opened = await openEnvelope(g.id, secret);
          if (!opened) continue;
          keyB64 = opened;
          const key = await importRawKey(opened);
          await listKeySave(listId, C.b64(C.rand(16)), key);
          try {
            const gid = await findReplica(from, listId);
            if (!gid) continue;
            remote = await pullReplica(gid, listId);
            if (remote) break;
          } catch {
            continue;
          }
        }
      }
      if (!remote || !keyB64) return;
      const key = await importRawKey(keyB64);
      const saltMeta = C.b64(C.rand(16));
      await listKeySave(listId, saltMeta, key);
      const myGistId = await createReplicaWithKey(
        { ...remote, share: null, items: (remote.items || []).map((i) => ({ ...i })) },
        saltMeta,
        key
      );
      const fr = from.toLowerCase();
      const me = myUsername();
      mutateRef.current((d) => {
        if (!Array.isArray(d.groceryLists)) d.groceryLists = [];
        if (d.groceryLists.some((x) => x.id === remote!.id)) return;
        d.groceryLists.push({
          ...remote!,
          items: (remote!.items || []).map((i) => ({ ...i })),
          members: [...new Set([...(remote!.members || []), fr, ...(me ? [me] : [])])],
          share: {
            gistId: myGistId,
            role: "member",
            peers: [...new Set([...(remote!.members || []), fr])],
            salt: saltMeta,
            keyMode: true,
          },
        });
      });
      toastRef.current("Joined “" + remote.name + "” from @" + fr);
      try {
        await notePeerActive(docRef.current, mutateRef.current, fr);
      } catch {
        /* best-effort only */
      }
    };

    run();
    const t = setInterval(run, 60000);
    return () => {
      dead = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.doc]);
}
