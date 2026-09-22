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
import { gistUnlocked } from "../services/gist";
import { ghLinked, ghWhoami } from "../services/githubAuth";
import { exportRawKey, importRawKey } from "../services/escrow";
import type { Friend, GroceryList } from "../types";
import {
  createReplicaWithKey,
  findReplica,
  friendGists,
  listKeyLoad,
  listKeySave,
  mergeLists,
  myUsername,
  openEnvelope,
  pullReplica,
  pushReplica,
  setMyUsername,
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

export function useGrocerySync() {
  const { state, mutate, toast } = useApp();
  const docRef = useRef(state.doc);
  docRef.current = state.doc;
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const pushedRef = useRef<Record<string, string>>({});
  const busyRef = useRef(false);
  const discoverRef = useRef(false);

  // ---- push my replicas (debounced; any view) ----
  useEffect(() => {
    const doc = state.doc;
    if (!doc || !canApi()) return;
    const shared = (doc.groceryLists || []).filter((l) => l.share && l.share.gistId);
    if (!shared.length) return;
    const t = setTimeout(() => {
      (async () => {
        for (const l of shared) {
          try {
            const lk = await listKeyLoad(l.id);
            if (!lk) continue;
            const body = JSON.stringify(payload(l));
            if (pushedRef.current[l.id] === body) continue;
            await pushReplica(payload(l), l.share!.gistId);
            pushedRef.current[l.id] = body;
          } catch {
            /* silent — retry on next mutation or poll */
          }
        }
      })();
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.doc]);

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
      busyRef.current = true;
      try {
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
              if (!gid) continue;
              const remote = await pullReplica(gid, l.id);
              if (!remote) continue;
              const r = mergeLists(merged, remote);
              merged = r.list;
              changed = changed || r.changed;
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
      const friends = (cur.settings.friends || []).filter((f) => f.pairSecret);
      if (!friends.length) return;
      discoverRef.current = true;
      try {
        try {
          const me = await ghWhoami().catch(() => null);
          if (me) setMyUsername(me);
        } catch {
          /* best-effort */
        }
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
      } finally {
        discoverRef.current = false;
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
          const gid = await findReplica(from, listId);
          if (!gid) continue;
          remote = await pullReplica(gid, listId);
          if (remote) break;
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
