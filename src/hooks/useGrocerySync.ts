// Sync engine — mounted once in the app shell. Pushes shared lists to my
// replica gist (debounced, skips unchanged payloads) and, while the
// Groceries view is open, polls each peer's replica and merges. Silent:
// convergence just appears; errors never toast from the background loop.

import { useEffect, useRef } from "react";
import { useApp } from "../services/store";
import { gistUnlocked } from "../services/gist";
import type { GroceryList } from "../types";
import {
  findReplica,
  listKeyLoad,
  mergeLists,
  pullReplica,
  pushReplica,
} from "../services/grocerySync";

/** Replica payload carries no local share metadata. */
function payload(l: GroceryList): GroceryList {
  return { ...l, share: null, items: (l.items || []).map((i) => ({ ...i })) };
}

export function useGrocerySync() {
  const { state, mutate } = useApp();
  const docRef = useRef(state.doc);
  docRef.current = state.doc;
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const pushedRef = useRef<Record<string, string>>({});
  const busyRef = useRef(false);

  // ---- push my replicas (debounced; any view) ----
  useEffect(() => {
    const doc = state.doc;
    if (!doc || !gistUnlocked()) return;
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
    if (!doc || state.view !== "groceries" || !gistUnlocked()) return;
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
}
