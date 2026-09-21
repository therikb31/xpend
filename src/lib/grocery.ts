// Grocery helpers — expected-date math, labels, and item lookup.
// Dates are YYYY-MM-DD; day diffs are computed at local midnight.

import { dstr, parseD, todayStr } from "./format";
import type { Doc, GroceryItem, GroceryList } from "../types";

export function addDaysStr(days: number, from?: string): string {
  const base = from ? parseD(from) : new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return dstr(d);
}

export function dayDiff(dateStr: string): number {
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return Math.round((parseD(dateStr).getTime() - today) / 86400000);
}

export interface ExpectInfo {
  label: string; // "Today" | "Tomorrow" | "In 5d" | "Overdue 2d"
  date: string; // "Mon, 29 Sep"
  overdue: boolean;
  soon: boolean; // within 2 days (and not overdue)
}

export function expectInfo(dateStr: string): ExpectInfo {
  const diff = dayDiff(dateStr || todayStr());
  const label =
    diff < 0 ? `Overdue ${-diff}d` : diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `In ${diff}d`;
  const date = parseD(dateStr || todayStr()).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return { label, date, overdue: diff < 0, soon: diff >= 0 && diff <= 2 };
}

export function liveItems(list: GroceryList): GroceryItem[] {
  return (list.items || []).filter((i) => !i.deleted);
}

export function activeItems(list: GroceryList): GroceryItem[] {
  return liveItems(list)
    .filter((i) => i.status === "active")
    .sort((a, b) => (a.expectDate || "").localeCompare(b.expectDate || "") || a.updatedAt - b.updatedAt);
}

export function purchasedItems(list: GroceryList): GroceryItem[] {
  return liveItems(list)
    .filter((i) => i.status === "purchased")
    .sort((a, b) => (b.purchasedAt || 0) - (a.purchasedAt || 0));
}

export function findGroceryItem(
  doc: Doc,
  itemId: string
): { list: GroceryList; item: GroceryItem } | null {
  for (const l of doc.groceryLists || []) {
    const item = (l.items || []).find((i) => i.id === itemId && !i.deleted);
    if (item) return { list: l, item };
  }
  return null;
}

export function deviceName(doc: Doc): string {
  return (doc.settings.deviceName || "").trim() || "My device";
}
