// Repeat-purchase detector — pure, local, free. Fuses grocery purchase
// history (purchasedAt per normalized item name) with expense transactions
// (dates + amounts per normalized note) into due-date candidates with
// confidence tiers. Powers "expected spends next month" with zero writes.

import { dstr } from "./format";
import type { Doc } from "../types";

export function normName(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function median(ns: number[]): number {
  if (!ns.length) return 0;
  const a = [...ns].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

function dayNum(iso: string): number {
  return new Date(
    parseInt(iso.slice(0, 4), 10),
    parseInt(iso.slice(5, 7), 10) - 1,
    parseInt(iso.slice(8, 10), 10)
  ).getTime();
}

function plusDays(iso: string, n: number): string {
  return dstr(new Date(dayNum(iso) + n * 86400000));
}

function todayIso(): string {
  const t = new Date();
  return dstr(new Date(t.getFullYear(), t.getMonth(), t.getDate()));
}

function plusDaysFromToday(n: number): string {
  const t = new Date();
  return dstr(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n));
}

export interface ReplenCandidate {
  name: string; // normalized key
  display: string; // most-frequent raw form
  qty: string; // modal grocery qty
  intervalDays: number; // median purchase interval
  lastDate: string; // YYYY-MM-DD of most recent event
  nextDate: string; // predicted next buy
  evidence: number; // distinct purchase dates observed
  tier: "firm" | "early"; // firm: 3+ dates, early: exactly 2
  price: number | null; // rupees, median of last ≤3 matched expenses
  onList: boolean; // already active on some grocery list
  sources: Array<"grocery" | "expense">;
}

export function detectReplenishment(
  doc: Doc,
  opts?: { dueWithinDays?: number; minEvidence?: "firm" | "any" }
): { asOf: string; candidates: ReplenCandidate[] } {
  const dueWithin = opts?.dueWithinDays ?? 35;
  const minEv = opts?.minEvidence ?? "any";
  const horizon = plusDaysFromToday(dueWithin);

  interface Acc {
    raw: Record<string, number>;
    qty: Record<string, number>;
    dates: Set<string>;
    amounts: number[];
    grocery: boolean;
    expense: boolean;
  }
  const byKey = new Map<string, Acc>();
  const acc = (k: string): Acc => {
    let a = byKey.get(k);
    if (!a) {
      a = { raw: {}, qty: {}, dates: new Set(), amounts: [], grocery: false, expense: false };
      byKey.set(k, a);
    }
    return a;
  };

  for (const l of doc.groceryLists || []) {
    for (const it of l.items || []) {
      if (it.deleted || !it.purchasedAt) continue;
      const k = normName(it.name);
      if (!k) continue;
      const a = acc(k);
      a.grocery = true;
      a.raw[it.name] = (a.raw[it.name] || 0) + 1;
      if (it.qty) a.qty[it.qty] = (a.qty[it.qty] || 0) + 1;
      a.dates.add(dstr(new Date(it.purchasedAt)));
    }
  }
  for (const t of doc.transactions || []) {
    if (t.dir !== "expense") continue;
    const raw = ((t.note || "") as string).trim();
    if (!raw) continue;
    const k = normName(raw);
    if (!k) continue;
    const a = acc(k);
    a.expense = true;
    a.raw[raw] = (a.raw[raw] || 0) + 1;
    a.dates.add(t.date.slice(0, 10));
    a.amounts.push(t.amount);
  }

  const onListKeys = new Set<string>();
  for (const l of doc.groceryLists || []) {
    for (const it of l.items || []) {
      if (!it.deleted && it.status === "active") onListKeys.add(normName(it.name));
    }
  }

  const out: ReplenCandidate[] = [];
  for (const [k, a] of byKey) {
    const dates = [...a.dates].sort();
    if (dates.length < 2) continue;
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push(Math.round((dayNum(dates[i]) - dayNum(dates[i - 1])) / 86400000));
    }
    const med = median(gaps.filter((g) => g > 0));
    if (med <= 0) continue;
    const last = dates[dates.length - 1];
    const next = plusDays(last, med);
    if (next > horizon) continue;
    const tier = dates.length >= 3 ? "firm" : "early";
    if (minEv === "firm" && tier !== "firm") continue;
    const display =
      Object.entries(a.raw).sort((x, y) => y[1] - x[1])[0]?.[0] || k;
    const qty = Object.entries(a.qty).sort((x, y) => y[1] - x[1])[0]?.[0] || "";
    // Price: median of the most recent ≤3 matched expense amounts (paise → ₹).
    const recent = a.amounts.slice(-3);
    const price = recent.length ? Math.round((median(recent) / 100) * 100) / 100 : null;
    out.push({
      name: k, display, qty, intervalDays: med, lastDate: last, nextDate: next,
      evidence: dates.length, tier, price,
      onList: onListKeys.has(k),
      sources: [a.grocery ? "grocery" : null, a.expense ? "expense" : null].filter(
        (x): x is "grocery" | "expense" => !!x
      ),
    });
  }
  out.sort((a, b) => (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0));
  return { asOf: todayIso(), candidates: out };
}
