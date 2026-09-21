// Doc migrations — verbatim ports of migrateCats / migrateSav / migrateBud /
// migrateGoals / migrateMerch / mergePool. Each returns whether it changed the doc.

import { monthKey, uid } from "../lib/format";
import type { Category, Doc } from "../types";
import { DEF_CATS, DEF_MERCHS, MERCH_POOL } from "./defaults";

const OLD_CAT_ID: Record<string, string> = {
  "cat-g": "cat-gro", "cat-e": "cat-fd", "cat-t": "cat-tra", "cat-u": "cat-utl",
  "cat-s": "cat-shp", "cat-h": "cat-ext", "cat-en": "cat-ent", "cat-tr": "cat-tra",
  "cat-r": "cat-hom", "cat-o": "cat-ext", "cat-sal": "cat-sal", "cat-oi": "cat-oi",
};

export function migrateCats(d: Doc): boolean {
  const defs = Object.fromEntries(DEF_CATS.map((c) => [c.id, c]));
  const byName = new Map(DEF_CATS.map((c) => [c.name.toLowerCase(), c]));
  const remap: Record<string, string> = {};
  for (const c of d.categories) {
    const newId = OLD_CAT_ID[c.id] || (defs[c.id] ? c.id : null);
    const repl = newId ? defs[newId] : byName.get((c.name || "").toLowerCase());
    if (repl && repl.id !== c.id) {
      remap[c.id] = repl.id;
    } else if (repl && !c.emoji) {
      c.emoji = repl.emoji;
    }
  }
  let changed = Object.keys(remap).length > 0;
  if (changed) {
    const used = new Set<string>();
    const out: Category[] = DEF_CATS.map((def) => {
      const src = d.categories.find((c) => remap[c.id] === def.id);
      if (!src) return null;
      used.add(src.id);
      return { id: def.id, name: def.name, kind: def.kind, color: def.color, emoji: def.emoji };
    }).filter((x): x is NonNullable<typeof x> => Boolean(x));
    for (const c of d.categories) {
      if (!remap[c.id] && !used.has(c.id)) out.push(c);
    }
    d.categories = out;
    for (const b of d.budgets || []) {
      if (Array.isArray(b.categoryIds)) b.categoryIds = b.categoryIds.map((id) => remap[id] || id);
    }
    for (const t of d.transactions || []) {
      if (t.dir !== "trans" && remap[t.categoryId]) t.categoryId = remap[t.categoryId];
    }
  }
  const s = (d.settings = d.settings || ({} as Doc["settings"]));
  if (s.catV === undefined) {
    const have = new Set(d.categories.map((c) => c.id));
    for (const def of DEF_CATS) {
      if (!have.has(def.id))
        d.categories.push({ id: def.id, name: def.name, kind: def.kind, color: def.color, emoji: def.emoji });
    }
    s.catV = 2;
    changed = true;
  }
  return changed;
}

export function migrateSav(d: Doc): boolean {
  const s = (d.settings = d.settings || ({} as Doc["settings"]));
  if (s.savV === 2) return false;
  let changed = false;
  for (const a of d.accounts || []) {
    if (a.kind !== "savings") continue;
    if (a.cur != null) {
      let net = 0;
      for (const t of d.transactions || []) {
        if (t.dir === "trans") {
          if (t.from === a.id) net -= t.amount;
          if (t.to === a.id) net += t.amount;
        } else if (t.accountId === a.id) {
          net += t.dir === "income" ? t.amount : -t.amount;
        }
      }
      a.opening = (a.opening || 0) + (a.cur || 0) - net;
      delete a.cur;
      changed = true;
    }
    if (a.prev == null) {
      a.prev = a.opening || 0;
      changed = true;
    }
  }
  s.savV = 2;
  return changed;
}

export function migrateBud(d: Doc): void {
  d.budgets = (d.budgets || []).map((b) => {
    if (!b.mkey) b.mkey = monthKey(new Date());
    return b;
  });
}

export function migrateGoals(d: Doc): boolean {
  const s = (d.settings = d.settings || ({} as Doc["settings"]));
  if (s.goalV === 1) return false;
  let changed = false;
  for (const g of d.goals || []) {
    if (g.sources == null) {
      g.sources = [];
      changed = true;
    }
    if (g.completed == null) {
      g.completed = false;
      changed = true;
    }
    if (g.date == null) {
      g.date = "";
      changed = true;
    }
    if (g.completedAt == null && g.completed) {
      g.completedAt = new Date().toISOString().slice(0, 7);
      changed = true;
    }
  }
  s.goalV = 1;
  return changed;
}

export function migrateMerch(d: Doc): boolean {
  const s = (d.settings = d.settings || ({} as Doc["settings"]));
  if (s.merchV === 1) {
    if (!Array.isArray(d.merchants)) d.merchants = [];
    const preseed: Record<string, string | null | undefined> = {};
    for (const m of DEF_MERCHS) preseed[m.id] = m.icon || null;
    let changed = false;
    for (const m of d.merchants) {
      if (m && Object.prototype.hasOwnProperty.call(preseed, m.id) && m.icon !== preseed[m.id]) {
        m.icon = preseed[m.id];
        changed = true;
      }
    }
    s.merchV = 2;
    return changed;
  }
  if (s.merchV !== undefined && s.merchV >= 2) return false;
  /* legacy (pre-merchant or unversioned): seed defaults only when empty */
  if (!Array.isArray(d.merchants) || !d.merchants.length) {
    d.merchants = JSON.parse(JSON.stringify([])) as Doc["merchants"];
    s.merchV = 2;
    return true;
  }
  s.merchV = 2;
  return false;
}

/* v2: grocery lists + device identity. Normalizes legacy shapes and stamps
   schemaVersion 2. Item tombstones (deleted) are preserved for shared merges. */
export function migrateGrocery(d: Doc): boolean {
  let changed = false;
  if (!Array.isArray(d.groceryLists)) {
    d.groceryLists = [];
    changed = true;
  }
  for (const l of d.groceryLists) {
    if (!Array.isArray(l.items)) {
      l.items = [];
      changed = true;
    }
    for (const it of l.items) {
      if (it.status !== "purchased" && it.status !== "active") {
        it.status = "active";
        changed = true;
      }
      if (typeof it.qty !== "string") {
        it.qty = it.qty == null ? "" : String(it.qty);
        changed = true;
      }
      if (!it.expectDate) {
        it.expectDate = new Date().toISOString().slice(0, 10);
        changed = true;
      }
      if (!it.addedBy) {
        it.addedBy = "";
        changed = true;
      }
      if (typeof it.updatedAt !== "number") {
        it.updatedAt = Date.now();
        changed = true;
      }
    }
    if (typeof l.updatedAt !== "number") {
      l.updatedAt = Date.now();
      changed = true;
    }
  }
  const s = (d.settings = d.settings || ({} as Doc["settings"]));
  if (!s.deviceName) {
    s.deviceName = "Device-" + uid().slice(-4).toUpperCase();
    changed = true;
  }
  if ((d.schemaVersion as number) < 2) {
    d.schemaVersion = 2;
    changed = true;
  }
  return changed;
}

/* Merge the shared merchant pool into a user's list on every boot.
   Per-user deletions live in settings.merchHidden (lowercased names). */
export function mergePool(d: Doc): boolean {
  const s = (d.settings = d.settings || ({} as Doc["settings"]));
  if (!Array.isArray(s.merchHidden)) s.merchHidden = [];
  if (!s.merchPoolV) s.merchPoolV = 0;
  const byName = new Map(d.merchants.map((m) => [(m.name || "").toLowerCase(), m]));
  let changed = false;
  for (const p of MERCH_POOL) {
    const key = (p.name || "").toLowerCase();
    if (!key || s.merchHidden.includes(key)) continue;
    const ex = byName.get(key);
    if (ex) {
      if (!ex.icon && !ex.iconUrl && p.icon) {
        ex.icon = p.icon;
        changed = true;
      }
      if (!ex.icon && !ex.iconUrl && p.iconUrl) {
        ex.iconUrl = p.iconUrl;
        changed = true;
      }
      if (!ex.color && p.color) {
        ex.color = p.color;
        changed = true;
      }
    } else {
      const rec = {
        id: "mer-pool-" + uid(),
        createdAt: Date.now(),
        fromPool: true,
        ...JSON.parse(JSON.stringify(p)),
      };
      d.merchants.push(rec);
      byName.set(key, d.merchants[d.merchants.length - 1]);
      changed = true;
    }
  }
  s.merchPoolV = 1;
  return changed;
}
