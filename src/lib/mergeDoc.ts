// Cross-device consolidation merge — union by id, newest-wins on collision.
// Used when two installs hold divergent histories (different keys) and must
// become one canonical doc before the OAuth migration. Settings stay with
// the base (canonical) doc; gist config is never touched.

import type { Doc } from "../types";

interface HasId {
  id: string;
  updatedAt?: number;
}

function unionById<T extends HasId>(base: T[], incoming: T[]): { out: T[]; added: number } {
  const out = (base || []).map((x) => ({ ...x }));
  const seen = new Set(out.map((x) => x.id));
  let added = 0;
  for (const inc of incoming || []) {
    if (!inc || !inc.id || seen.has(inc.id)) continue;
    seen.add(inc.id);
    out.push({ ...inc });
    added++;
  }
  return { out, added };
}

export interface MergeCounts {
  transactions: number;
  groceryLists: number;
  groceryItems: number;
  budgets: number;
  goals: number;
  merchants: number;
  accounts: number;
  categories: number;
}

export interface MergePreview {
  counts: MergeCounts;
  baseTx: number;
  incomingTx: number;
}

function isDoc(o: unknown): o is Doc {
  const d = o as Doc;
  return !!d && Array.isArray(d.transactions) && !!d.settings;
}

export function previewMerge(base: Doc, incoming: unknown): MergePreview | null {
  if (!isDoc(incoming)) return null;
  const baseTxIds = new Set((base.transactions || []).map((t) => t.id));
  const newTx = (incoming.transactions || []).filter((t) => t && t.id && !baseTxIds.has(t.id)).length;
  const baseListIds = new Set((base.groceryLists || []).map((l) => l.id));
  let newLists = 0;
  let newItems = 0;
  for (const l of incoming.groceryLists || []) {
    if (!l || !l.id) continue;
    if (!baseListIds.has(l.id)) {
      newLists++;
      newItems += (l.items || []).length;
    } else {
      const bl = (base.groceryLists || []).find((x) => x.id === l.id);
      const baseItemIds = new Set(((bl && bl.items) || []).map((i) => i.id));
      newItems += (l.items || []).filter((i) => i && i.id && !baseItemIds.has(i.id)).length;
    }
  }
  const countNew = (arr: HasId[] | undefined, barr: HasId[] | undefined): number => {
    const ids = new Set((barr || []).map((x) => x.id));
    return (arr || []).filter((x) => x && x.id && !ids.has(x.id)).length;
  };
  return {
    counts: {
      transactions: newTx,
      groceryLists: newLists,
      groceryItems: newItems,
      budgets: countNew(incoming.budgets, base.budgets),
      goals: countNew(incoming.goals, base.goals),
      merchants: countNew(incoming.merchants, base.merchants),
      accounts: countNew(incoming.accounts, base.accounts),
      categories: countNew(incoming.categories, base.categories),
    },
    baseTx: (base.transactions || []).length,
    incomingTx: (incoming.transactions || []).length,
  };
}

export function mergeDocs(base: Doc, incoming: Doc): Doc {
  const out: Doc = structuredClone(base);
  const tx = unionById(out.transactions || [], incoming.transactions || []);
  out.transactions = tx.out;
  const lists = unionById(out.groceryLists || [], []);
  for (const il of incoming.groceryLists || []) {
    if (!il || !il.id) continue;
    const ex = lists.out.find((l) => l.id === il.id);
    if (!ex) {
      lists.out.push(structuredClone(il));
      continue;
    }
    const items = unionById(ex.items || [], il.items || []);
    ex.items = items.out;
    const mhave = new Set(ex.members || []);
    for (const m of il.members || []) {
      if (m && !mhave.has(m)) {
        mhave.add(m);
        ex.members = [...(ex.members || []), m];
      }
    }
    if ((il.updatedAt || 0) > (ex.updatedAt || 0)) {
      ex.name = il.name;
      ex.updatedAt = il.updatedAt;
    }
  }
  out.groceryLists = lists.out;
  out.budgets = unionById(out.budgets || [], incoming.budgets || []).out;
  out.goals = unionById(out.goals || [], incoming.goals || []).out;
  out.merchants = unionById(out.merchants || [], incoming.merchants || []).out;
  out.accounts = unionById(out.accounts || [], incoming.accounts || []).out;
  out.categories = unionById(out.categories || [], incoming.categories || []).out;
  out.shortcuts = unionById(out.shortcuts || [], incoming.shortcuts || []).out;
  out.meta = { ...out.meta, updatedAt: new Date().toISOString() };
  if (out.settings.gist) out.settings.gist.dirty = true;
  return out;
}
