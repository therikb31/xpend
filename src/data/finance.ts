// Pure domain logic — ports of the App.* query/calc methods.
// Every function takes the doc explicitly; nothing here touches React or storage.

import { APP_VER, monthKey, parseMk, rupees } from "../lib/format";
import type {
  Account,
  Budget,
  Category,
  Doc,
  ExpenseTxn,
  Filters,
  Goal,
  Merchant,
  Txn,
  View,
} from "../types";

export const PAL = ["#7B61FF", "#FF5678", "#31C4F3", "#FF9F43", "#52E5A5", "#FFD166", "#9B8CFA", "#4EC49B"];

/* 50-30-20 buckets: stable identities (not PAL-cycled). Rule shares are
   fractions of month income, matching the classic rule's definition. */
export const NW_META = {
  need: { name: "Needs", emoji: "🏠", color: "#5BB98C", rule: 50 },
  want: { name: "Wants", emoji: "✨", color: "#FF9F43", rule: 30 },
  saving: { name: "Savings", emoji: "🏦", color: "#8C52FF", rule: 20 },
} as const;

export type NwKey = keyof typeof NW_META;

/* 50-30-20 drill predicate — single source of truth for the Insights cards,
   the bucket drill page, and export. Buckets match their category tag
   (expense-only, account filter applies). Transfers never count as flow:
   money moved into savings shows up via the account balance instead
   (see savingsBalance). */
export function bucketTxns(doc: Doc, key: NwKey, mkey: string, acc: string): Txn[] {
  return sortedTxs(doc).filter((t) => {
    if (t.date.slice(0, 7) !== mkey || t.dir !== "expense") return false;
    if (acc !== "all" && t.accountId !== acc) return false;
    return (catById(doc, t.categoryId).need || "need") === key;
  });
}

/* Savings bucket amount: sum of current savings-account balances
   (the "Current savings" figure from Accounts; excludes previous savings). */
export function savingsBalance(doc: Doc): number {
  return (doc.accounts || [])
    .filter((a) => a.kind === "savings")
    .reduce((s, a) => s + accBalance(doc, a.id), 0);
}

/* Date-bounded per-account net (same definition as accBalance/netOf, but
   only legs dated within-or-before mkey). Powers past-month savings. */
function balanceAsOf(doc: Doc, id: string, mkey: string): number {
  let n = 0;
  for (const t of doc.transactions) {
    if (t.date.slice(0, 7) > mkey) continue;
    if (t.dir === "trans") {
      if (t.from === id) n -= t.amount;
      if (t.to === id) n += t.amount;
      continue;
    }
    if (t.accountId !== id) continue;
    n += t.dir === "income" ? t.amount : -t.amount;
  }
  return n;
}

export interface SavingsTally {
  total: number; // balance + moved + tagged
  balance: number; // savings held at month end (live for the current month)
  moved: number; // manual Current → Previous moves dated in month
  tagged: number; // saving-tagged expenses dated in month
  movedTxns: Txn[];
  taggedTxns: Txn[];
  inTxns: Txn[]; // transfers into savings + income on savings, in month
  outTxns: Txn[]; // transfers out (non-previous) + expenses on savings, in month
  savAccs: Account[];
}

/* Month M's savings, computed purely from the ledger (no snapshots):
   balance held at end of M + manual moves to Previous in M + tagged
   expenses in M. Transfers never count as flow — money moved in shows up
   via the balance exactly once. Current month uses live balances so the
   card matches Accounts; past months use the date-bounded balance. */
export function savingsTally(doc: Doc, mkey: string, acc: string): SavingsTally {
  const nowKey = monthKey(new Date());
  const savAccs = (doc.accounts || []).filter((a) => a.kind === "savings");
  const savIds = new Set(savAccs.map((a) => a.id));
  const inMonth = (d: string) => d.slice(0, 7) === mkey;
  const legOk = (id: string) => acc === "all" || acc === id;
  const balance =
    mkey === nowKey
      ? savAccs.reduce((s, a) => s + accBalance(doc, a.id), 0)
      : savAccs.reduce((s, a) => s + balanceAsOf(doc, a.id, mkey), 0);
  const movedTxns = sortedTxs(doc).filter(
    (t) => t.dir === "trans" && t.to === "__prev" && inMonth(t.date) && savIds.has(t.from) && legOk(t.from)
  );
  const taggedTxns = bucketTxns(doc, "saving", mkey, acc);
  const inTxns = sortedTxs(doc).filter(
    (t) =>
      inMonth(t.date) &&
      ((t.dir === "trans" && !!t.to && savIds.has(t.to) && legOk(t.to)) ||
        (t.dir === "income" && savIds.has(t.accountId) && legOk(t.accountId)))
  );
  const outTxns = sortedTxs(doc).filter(
    (t) =>
      inMonth(t.date) &&
      ((t.dir === "trans" && savIds.has(t.from) && t.to !== "__prev" && legOk(t.from)) ||
        (t.dir === "expense" && savIds.has(t.accountId) && legOk(t.accountId)))
  );
  const sum = (l: Txn[]) => l.reduce((s, t) => s + t.amount, 0);
  const moved = sum(movedTxns);
  const tagged = sum(taggedTxns);
  return {
    total: balance + moved + tagged, balance, moved, tagged,
    movedTxns, taggedTxns, inTxns, outTxns, savAccs,
  };
}

export function catById(doc: Doc, id: string): Category {
  return (
    doc.categories.find((c) => c.id === id) ||
    doc.categories.find((c) => c.id === "cat-ext") ||
    doc.categories.find((c) => c.kind === "expense")!
  );
}

export function accById(doc: Doc, id: string): Account {
  return doc.accounts.find((a) => a.id === id) || doc.accounts[0];
}

export function merchById(doc: Doc, id: string): Merchant | undefined {
  return (doc.merchants || []).find((m) => m.id === id);
}

export function sortedTxs(doc: Doc): Txn[] {
  return doc.transactions.slice().sort((a, b) => {
    if (a.date === b.date) return (b.createdAt || 0) - (a.createdAt || 0);
    return a.date < b.date ? 1 : -1;
  });
}

export function monthStats(doc: Doc, key: string): { spent: number; inc: number; remaining: number; pct: number } {
  let spent = 0;
  let inc = 0;
  for (const t of doc.transactions) {
    if (t.date.slice(0, 7) !== key || t.dir === "trans") continue;
    if (t.dir === "income") inc += t.amount;
    else spent += t.amount;
  }
  return { spent, inc, remaining: Math.max(0, inc - spent), pct: inc > 0 ? Math.min(1, spent / inc) : 0 };
}

export function catSpend(doc: Doc, key: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const t of doc.transactions) {
    if (t.dir === "expense" && t.date.slice(0, 7) === key)
      map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
  }
  return map;
}

export function merchantSpend(doc: Doc, key: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const t of doc.transactions) {
    if (t.dir === "expense" && t.date.slice(0, 7) === key) {
      const k = t.merchantId || "__none";
      map[k] = (map[k] || 0) + t.amount;
    }
  }
  return map;
}

export function merchantCount(doc: Doc): Record<string, number> {
  const map: Record<string, number> = {};
  for (const t of doc.transactions) {
    if (t.dir !== "expense") continue;
    const k = t.merchantId || "__none";
    map[k] = (map[k] || 0) + 1;
  }
  return map;
}

export function merchAccent(doc: Doc, mkey: string, mid: string): string {
  const entries = Object.entries(merchantSpend(doc, mkey)).sort((a, b) => b[1] - a[1]);
  const idx = entries.findIndex((e) => e[0] === mid);
  const m = mid === "__none" ? null : merchById(doc, mid);
  return idx >= 0 ? PAL[idx % PAL.length] : (m && m.color) || "#8C52FF";
}

export function catAccent(doc: Doc, mkey: string, cid: string): string {
  const entries = Object.entries(catSpend(doc, mkey)).sort((a, b) => b[1] - a[1]);
  const idx = entries.findIndex((e) => e[0] === cid);
  const c = catById(doc, cid);
  return idx >= 0 ? PAL[idx % PAL.length] : (c && c.color) || "#8C52FF";
}

export function netOf(doc: Doc, id: string, excl?: Set<Txn>): number {
  let n = 0;
  for (const t of doc.transactions) {
    if (excl && excl.has(t)) continue;
    if (t.dir === "trans") {
      if (t.from === id) n -= t.amount;
      if (t.to === id) n += t.amount;
      continue;
    }
    if (t.accountId !== id) continue;
    n += t.dir === "income" ? t.amount : -t.amount;
  }
  return n;
}

export function accBalance(doc: Doc, id: string): number {
  const a = accById(doc, id);
  if (!a) return 0;
  if (a.kind === "savings") return netOf(doc, id);
  return (a.opening || 0) + netOf(doc, id);
}

/** Keep savings previous/current buckets in sync for __prev transfers. Mutates accounts. */
export function savSync(doc: Doc, oldT: Txn | null, newT: Txn | null): void {
  const bump = (a: Account | undefined, p: number) => {
    if (a) a.prev = (a.prev == null ? 0 : a.prev) + p;
  };
  const apply = (t: Txn | null, sf: number) => {
    if (!t || t.dir !== "trans") return;
    if (t.to === "__prev") bump(accById(doc, t.from), t.amount * sf);
    else if (t.from === "__prev") bump(accById(doc, t.to), -t.amount * sf);
  };
  apply(oldT, -1);
  apply(newT, 1);
}

export function trNames(doc: Doc, t: Extract<Txn, { dir: "trans" }>): string {
  const nm = (id: string) =>
    id === "__prev" ? "Previous savings" : accById(doc, id) ? accById(doc, id).name : "?";
  return nm(t.from) + " → " + nm(t.to);
}

export function catName(doc: Doc, id: string): string {
  return catById(doc, id).name;
}

// ---------------- budgets (linear pace) ----------------

export function expenseCats(doc: Doc): Category[] {
  return doc.categories.filter((c) => c.kind === "expense");
}

export function budgetCats(doc: Doc, b: Budget): Category[] {
  if (!b || !b.categoryIds || !b.categoryIds.length) return [];
  return b.categoryIds.map((id) => catById(doc, id)).filter(Boolean);
}

export function budgetsFor(doc: Doc, mkey: string): Budget[] {
  return (doc.budgets || []).filter((b) => (b.mkey || mkey) === mkey);
}

export function isOverall(b: Budget): boolean {
  return !(b.categoryIds && b.categoryIds.length);
}

export function catBudgets(doc: Doc, mkey: string): Budget[] {
  return budgetsFor(doc, mkey).filter((b) => !isOverall(b));
}

export function overallLimit(doc: Doc, mkey: string): number {
  return catBudgets(doc, mkey).reduce((s, b) => s + (b.limit || 0), 0);
}

export function aggIdsRaw(doc: Doc, mkey: string): string[] {
  const set = new Set<string>();
  for (const b of budgetsFor(doc, mkey)) {
    (b.categoryIds || []).forEach((id) => set.add(id));
  }
  return Array.from(set);
}

export function aggSpentV(doc: Doc, mkey: string): number {
  const ids = aggIdsRaw(doc, mkey);
  return ids.length ? budgetDaily(doc, mkey, ids).reduce((s, v) => s + v, 0) : 0;
}

export function budgetMonthCtx(mkey: string): { isCur: boolean; daysInMonth: number; elapsed: number; daysLeft: number } {
  const mk = parseMk(mkey);
  const now = new Date();
  const isCur = mk.getFullYear() === now.getFullYear() && mk.getMonth() === now.getMonth();
  const daysInMonth = new Date(mk.getFullYear(), mk.getMonth() + 1, 0).getDate();
  const past = mk < new Date(now.getFullYear(), now.getMonth(), 1);
  const elapsed = isCur ? Math.min(now.getDate(), daysInMonth) : past ? daysInMonth : 0;
  return { isCur, daysInMonth, elapsed, daysLeft: daysInMonth - elapsed };
}

export function budgetDaily(doc: Doc, mkey: string, ids: string[] | null): number[] {
  const ctx = budgetMonthCtx(mkey);
  const arr = new Array<number>(ctx.daysInMonth).fill(0);
  const set = ids ? new Set(ids) : null;
  for (const t of doc.transactions) {
    if (t.dir !== "expense" || t.date.slice(0, 7) !== mkey) continue;
    if (set && !set.has(t.categoryId)) continue;
    const day = parseInt(t.date.slice(8, 10), 10) || 1;
    if (day >= 1 && day <= ctx.daysInMonth) arr[day - 1] += t.amount;
  }
  return arr;
}

export function budgetDailyCum(doc: Doc, mkey: string, ids: string[] | null): number[] {
  const a = budgetDaily(doc, mkey, ids);
  let acc = 0;
  return a.map((v) => (acc += v));
}

export interface BudgetCtx {
  spent: number;
  expected: number;
  pct: number;
  overage: number;
  remaining: number;
  safeDaily: number;
  status: "over" | "ahead" | "on";
  daysInMonth: number;
  elapsed: number;
  daysLeft: number;
}

export function budgetCtx(mkey: string, limit: number, spent: number): BudgetCtx {
  const ctx = budgetMonthCtx(mkey);
  const expected = Math.round((limit * ctx.elapsed) / ctx.daysInMonth);
  const pct = limit > 0 ? spent / limit : 0;
  const overage = Math.max(0, spent - limit);
  const remaining = Math.max(0, limit - spent);
  const safeDaily = remaining > 0 ? (Math.floor(remaining / Math.max(ctx.daysLeft, 1) / 100) * 100) : 0;
  const status = spent > limit ? "over" : spent > expected ? "ahead" : "on";
  return { spent, expected, pct, overage, remaining, safeDaily, status, daysInMonth: ctx.daysInMonth, elapsed: ctx.elapsed, daysLeft: ctx.daysLeft };
}

export function budgetSpent(doc: Doc, b: Budget, mkey: string): number {
  const key = b.mkey || mkey;
  let s = 0;
  for (const t of doc.transactions) {
    if (t.dir !== "expense" || t.date.slice(0, 7) !== key) continue;
    if (b.categoryIds && b.categoryIds.length && !b.categoryIds.includes(t.categoryId)) continue;
    s += t.amount;
  }
  return s;
}

export function budgetAccent(doc: Doc, b: Budget): string {
  const cats = budgetCats(doc, b);
  if (cats.length) return cats[0].color || "#8C52FF";
  return "#52E5A5";
}

export function budStLabel(status: BudgetCtx["status"]): string {
  return status === "over" ? "Over" : status === "ahead" ? "Ahead — slow down" : "On pace";
}

export function budStClass(status: BudgetCtx["status"]): string {
  return status === "over" ? "err" : status === "ahead" ? "warn" : "on";
}

export function budBarColor(c: BudgetCtx): string {
  return c.pct >= 1 ? "#FF5A5A" : c.status === "ahead" || c.pct >= 0.8 ? "#FF9F43" : "#52E5A5";
}

export function budPaceTxt(c: BudgetCtx): string {
  if (c.status === "over") return "Over by " + rupees(c.overage) + " · safe pace is ₹0";
  return (
    "Spend ≤ " +
    rupees(c.safeDaily) +
    "/day for " +
    (c.daysLeft > 0 ? c.daysLeft : "no") +
    " more day" +
    (c.daysLeft === 1 ? "" : "s") +
    " to stay on budget"
  );
}

export function monthShort(k: string): string {
  return parseMk(k).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export function budgetMonthChips(cur: string): string[] {
  const list: string[] = [];
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  for (let i = 0; i < 11; i++) {
    list.push(monthKey(d));
    d.setMonth(d.getMonth() + 1);
  }
  if (!list.includes(cur)) list.unshift(cur);
  return list;
}

// ---------------- goals ----------------

export function goalCurrent(g: Pick<Goal, "sources" | "current">): number {
  if (g && g.sources && g.sources.length) return g.sources.reduce((s, x) => s + (x.amount || 0), 0);
  return (g && g.current) || 0;
}

export interface GoalCalc {
  target: number;
  current: number;
  remaining: number;
  pct: number;
  months: number;
  saveMonths: number;
  required: number;
  plan: number;
  est: number | null;
  estDate: Date | null;
  status: "completed" | "on-track" | "needs-attention" | "overdue";
}

export function goalCalc(g: Goal): GoalCalc {
  const target = g.target || 0;
  const current = goalCurrent(g);
  const remaining = Math.max(0, target - current);
  const pct = target > 0 ? (current / target) * 100 : 0;
  const now = new Date();
  let months = 0;
  if (g.date) {
    const y = parseInt(g.date.slice(0, 4), 10);
    const m = parseInt(g.date.slice(5, 7), 10) - 1;
    months = (y - now.getFullYear()) * 12 + (m - now.getMonth());
  }
  const saveMonths = months > 1 ? months - 1 : months === 1 ? 1 : 0;
  const plan = g.plan || 0;
  const required = saveMonths > 0 ? Math.ceil(remaining / saveMonths / 100) * 100 : 0;
  const est = plan > 0 ? Math.ceil(remaining / plan) : null;
  const estDate = est != null ? new Date(now.getFullYear(), now.getMonth() + est, 1) : null;
  let status: GoalCalc["status"];
  if (g.completed) status = "completed";
  else if (current >= target && (!g.date || months >= 0)) status = "completed";
  else if (months < 0 && current < target) status = "overdue";
  else {
    const plannedTotal = current + plan * Math.max(saveMonths, 0);
    status = saveMonths > 0 && plan > 0 && plannedTotal >= target ? "on-track" : "needs-attention";
  }
  return { target, current, remaining, pct, months, saveMonths, required, plan, est, estDate, status };
}

// ---------------- export JSON dump ----------------

export function expLabel(view: View): string {
  return (
    (
      {
        overview: "Overview", summary: "Insights",
        category: "Category", merchant: "Merchant", activity: "Activity",
        budget: "Budget", goals: "Goals", groceries: "Groceries",
        accounts: "Accounts", settings: "Settings",
      } as Record<string, string>
    )[view] || "Data"
  );
}

export function resolvedTxs(doc: Doc, list: Txn[]): unknown[] {
  return list.map((t) => {
    const r: Record<string, unknown> = { id: t.id, date: t.date, dir: t.dir, amount: t.amount };
    if (t.note) r.note = t.note;
    if (t.createdAt) r.createdAt = t.createdAt;
    if (t.dir === "trans") {
      const parts = trNames(doc, t).split(" → ");
      r.from = parts[0];
      r.to = parts[1] || parts[0];
    } else {
      const c = catById(doc, t.categoryId);
      const a = accById(doc, t.accountId);
      const m = t.merchantId ? merchById(doc, t.merchantId) : null;
      r.category = c ? { id: c.id, name: c.name, emoji: c.emoji } : null;
      r.account = a ? { id: a.id, name: a.name, kind: a.kind } : null;
      r.merchant = m ? { id: m.id, name: m.name } : null;
    }
    return r;
  });
}

export function expData(doc: Doc, view: View, mkey: string, flt: Filters): Record<string, unknown> {
  const mk = parseMk(mkey);
  const now = new Date();
  const monthLabel =
    mk.getFullYear() === now.getFullYear() && mk.getMonth() === now.getMonth()
      ? "This month"
      : mk.toLocaleDateString("en-IN", { month: "long" });
  const prev = new Date(mk);
  prev.setMonth(prev.getMonth() - 1);
  const prevKey = monthKey(prev);
  const env: Record<string, unknown> = {
    app: "Xpend", version: APP_VER, view, exportedAt: new Date().toISOString(),
    month: mkey, monthLabel, filters: { ...flt }, stats: monthStats(doc, mkey),
  };
  if (view === "overview") {
    let list = sortedTxs(doc);
    if (flt.dir !== "all") list = list.filter((t) => t.dir === flt.dir);
    if (flt.acc !== "all")
      list = list.filter((t) => t.dir !== "trans" ? t.accountId === flt.acc : t.from === flt.acc || t.to === flt.acc);
    env.data = { transactions: resolvedTxs(doc, list) };
    return env;
  }
  if (view === "summary") {
    const txs = doc.transactions.filter(
      (t): t is ExpenseTxn =>
        t.dir === "expense" && t.date.slice(0, 7) === mkey && (flt.acc === "all" || t.accountId === flt.acc)
    );
    const map: Record<string, number> = {};
    for (const t of txs) {
      const k = t.categoryId;
      map[k] = (map[k] || 0) + t.amount;
    }
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, e) => s + e[1], 0);
    const prevSt = monthStats(doc, prevKey);
    const rows = entries.map(([k, amt], i) => {
      const n = txs.filter((t) => t.categoryId === k).length;
      const base = { amount: amt, count: n, pct: total > 0 ? +(amt / total * 100).toFixed(2) : 0, color: PAL[i % PAL.length] };
      const c = catById(doc, k);
      return { id: k, categoryId: k, name: c ? c.name : "Unknown", emoji: c?.emoji, ...base };
    });
    env.data = { total, prevMonthSpent: prevSt.spent, entries: rows };
    return env;
  }
  if (view === "category" || view === "merchant") {
    const byMerch = view === "merchant";
    const key = byMerch ? flt.merch : flt.cat;
    const mercKey = byMerch ? (key === "__none" ? "__none" : merchById(doc, key) ? merchById(doc, key)!.id : "__none") : null;
    const total = byMerch ? merchantSpend(doc, mkey)[mercKey!] || 0 : catSpend(doc, mkey)[key] || 0;
    const prevTotal = byMerch ? merchantSpend(doc, prevKey)[mercKey!] || 0 : catSpend(doc, prevKey)[key] || 0;
    const deltaPct = prevTotal > 0 ? Math.round(((prevTotal - total) / prevTotal) * 100) : null;
    let list = sortedTxs(doc).filter(
      (t) => t.dir === "expense" && t.date.slice(0, 7) === mkey &&
        (byMerch ? (t.merchantId || "__none") === mercKey : t.categoryId === key)
    );
    if (flt.acc !== "all") list = list.filter((t) => t.dir !== "trans" && t.accountId === flt.acc);
    const m = byMerch ? merchById(doc, mercKey!) : null;
    const c = byMerch ? null : catById(doc, key);
    env.data = {
      scope: byMerch
        ? m ? { id: m.id, name: m.name, icon: m.icon || null, iconUrl: m.iconUrl || null } : { id: "__none", name: "Unassigned" }
        : c ? { id: c.id, name: c.name, emoji: c.emoji } : { id: key, name: "Unknown" },
      total, prevTotal, deltaPct, transactions: resolvedTxs(doc, list),
    };
    return env;
  }
  if (view === "bucket") {
    const key = (flt.bucket === "need" || flt.bucket === "want" || flt.bucket === "saving") ? flt.bucket : "need";
    const meta = NW_META[key];
    if (key === "saving") {
      const tal = savingsTally(doc, mkey, flt.acc);
      const shown = flt.acc !== "all" ? tal.savAccs.filter((a) => a.id === flt.acc) : tal.savAccs;
      env.data = {
        scope: { id: key, name: meta.name, emoji: meta.emoji, rule: meta.rule },
        total: tal.total, balance: tal.balance, moved: tal.moved, tagged: tal.tagged,
        savingsAccounts: shown.map((a) => ({ id: a.id, name: a.name, balance: accBalance(doc, a.id), prev: a.prev != null ? a.prev : null })),
        transactions: resolvedTxs(doc, [...tal.inTxns, ...tal.movedTxns, ...tal.taggedTxns, ...tal.outTxns]),
      };
      return env;
    }
    const list = bucketTxns(doc, key, mkey, flt.acc);
    const total = list.reduce((s, t) => s + t.amount, 0);
    const prevTotal = bucketTxns(doc, key, prevKey, flt.acc).reduce((s, t) => s + t.amount, 0);
    env.data = {
      scope: { id: key, name: meta.name, emoji: meta.emoji, rule: meta.rule },
      total, prevTotal,
      deltaPct: prevTotal > 0 ? Math.round(((prevTotal - total) / prevTotal) * 100) : null,
      transactions: resolvedTxs(doc, list),
    };
    return env;
  }
  if (view === "activity") {    let list = sortedTxs(doc);
    if (flt.dir !== "all") list = list.filter((t) => t.dir === flt.dir);
    if (flt.cat !== "all") list = list.filter((t) => t.dir !== "trans" && t.categoryId === flt.cat);
    if (flt.merch !== "all") list = list.filter((t) => t.dir !== "trans" && (t.merchantId || "__none") === flt.merch);
    if (flt.acc !== "all")
      list = list.filter((t) => t.dir !== "trans" ? t.accountId === flt.acc : t.from === flt.acc || t.to === flt.acc);
    if (flt.q)
      list = list.filter((t) => {
        const hay = (t.note || "") + " " + (t.dir === "trans" ? trNames(doc, t) : catName(doc, (t as { categoryId: string }).categoryId) || "") + " " + t.date;
        return hay.toLowerCase().includes(flt.q.toLowerCase());
      });
    env.data = { transactions: resolvedTxs(doc, list) };
    return env;
  }
  if (view === "budget") {
    const aggLimit = overallLimit(doc, mkey);
    const aggSpent = aggSpentV(doc, mkey);
    const agg = budgetCtx(mkey, aggLimit, aggSpent);
    const unbudgeted = Math.max(0, monthStats(doc, mkey).spent - aggSpent);
    const rows = budgetsFor(doc, mkey).map((b) => {
      const all = isOverall(b);
      const bk = b.mkey || mkey;
      const limit = all ? overallLimit(doc, bk) : b.limit || 0;
      const spent = all ? aggSpentV(doc, bk) : budgetSpent(doc, b, mkey);
      const cc = budgetCtx(bk, limit, spent);
      return { id: b.id, name: b.name, overall: all, limit, spent, status: cc.status, expected: cc.expected, overage: cc.overage, remaining: cc.remaining, safeDaily: cc.safeDaily, categories: budgetCats(doc, b).map((x) => x.name) };
    });
    env.data = { totals: { limit: aggLimit, spent: aggSpent, remaining: agg.remaining, safeDaily: agg.safeDaily, status: agg.status, unbudgeted }, budgets: rows };
    return env;
  }
  if (view === "goals") {
    const gs = doc.goals || [];
    const active = gs.filter((g) => !g.completed);
    const rows = gs.map((g) => {
      const cc = goalCalc(g);
      const sources = (g.sources || []).map((s) => ({ name: s.name, amount: s.amount || 0, date: s.date || null }));
      return { id: g.id, name: g.name, target: g.target, current: cc.current, remaining: cc.remaining, pct: +cc.pct.toFixed(1), status: cc.status, date: g.date || null, plan: g.plan || 0, monthlyRequired: cc.required, estimatedMonths: cc.est, estimatedDate: cc.estDate ? cc.estDate.toISOString().slice(0, 7) : null, sources, completed: !!g.completed, actualAmount: g.actualAmount || null };
    });
    env.data = {
      aggregates: {
        totalTarget: gs.reduce((s, g) => s + (g.target || 0), 0),
        totalSaved: gs.reduce((s, g) => s + goalCurrent(g), 0),
        monthlyRequired: active.reduce((s, g) => s + (goalCalc(g).required || 0), 0),
        onTrack: active.filter((g) => goalCalc(g).status === "on-track").length,
        needsAttention: active.filter((g) => goalCalc(g).status === "needs-attention").length,
        overdue: active.filter((g) => goalCalc(g).status === "overdue").length,
        completed: gs.filter((g) => g.completed).length,
      },
      goals: rows,
    };
    return env;
  }
  if (view === "accounts") {
    const accs = doc.accounts;
    const net = accs.reduce((s, a) => s + (a.kind === "savings" || a.secondary ? 0 : accBalance(doc, a.id)), 0);
    env.data = {
      netWorth: net,
      accounts: accs.map((a) => ({ id: a.id, name: a.name, kind: a.kind, opening: a.opening, balance: accBalance(doc, a.id), icon: a.icon || null, color: a.color, secondary: !!a.secondary, prev: a.prev != null ? a.prev : null })),
    };
    return env;
  }
  env.data = {
    categories: doc.categories, accounts: doc.accounts, merchants: doc.merchants || [],
    budgets: doc.budgets || [], goals: doc.goals || [], shortcuts: doc.shortcuts || [],
    groceryLists: doc.groceryLists || [],
    transactions: doc.transactions, settings: doc.settings,
    counts: { transactions: doc.transactions.length },
  };
  return env;
}
