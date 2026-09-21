// Demo seed — port of legacy sampleData().

import { dstr, uid } from "../lib/format";
import type { Doc } from "../types";

export function sampleData(doc: Doc): void {
  const today = new Date();
  const D = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return dstr(d);
  };
  const txs = [
    { date: D(0), dir: "expense", amount: 1200, categoryId: "cat-gro", accountId: "acc-card", name: "Groceries" },
    { date: D(0), dir: "expense", amount: 450, categoryId: "cat-fd", accountId: "acc-cash", name: "Coffee & croissant" },
    { date: D(1), dir: "expense", amount: 2100, categoryId: "cat-tra", accountId: "acc-card", name: "Cab home" },
    { date: D(2), dir: "income", amount: 85000, categoryId: "cat-sal", accountId: "acc-card", name: "Salary" },
    { date: D(3), dir: "expense", amount: 3450, categoryId: "cat-shp", accountId: "acc-card", name: "Sneakers" },
    { date: D(4), dir: "expense", amount: 950, categoryId: "cat-ext", accountId: "acc-card", name: "Pharmacy" },
    { date: D(5), dir: "expense", amount: 1800, categoryId: "cat-ent", accountId: "acc-card", name: "Movie night" },
    { date: D(8), dir: "expense", amount: 9800, categoryId: "cat-hom", accountId: "acc-card", name: "Rent" },
    { date: D(10), dir: "expense", amount: 2600, categoryId: "cat-utl", accountId: "acc-card", name: "Electricity" },
    { date: D(12), dir: "expense", amount: 1400, categoryId: "cat-gro", accountId: "acc-cash", name: "Market run" },
    { date: D(15), dir: "expense", amount: 4200, categoryId: "cat-tra", accountId: "acc-card", name: "Train tickets" },
  ];
  doc.transactions = txs.map((t, i) => ({
    id: uid(),
    note: "",
    createdAt: Date.now() - i * 1e6,
    ...t,
    dir: t.dir as "expense" | "income",
  }));
  doc.accounts[0].opening = 2000000;
  doc.accounts[1].opening = 4500000;
  const ym = (n: number) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() + n);
    return dstr(d).slice(0, 7);
  };
  doc.goals = [
    { id: "goal-1", name: "iPhone 18", target: 15000000, current: 4500000, date: ym(12), plan: 960000, completed: false, sources: [{ id: uid(), name: "Savings Account — HDFC", type: "bank", amount: 3000000 }, { id: uid(), name: "Mutual Fund — Groww", type: "mf", amount: 1500000 }] },
    { id: "goal-2", name: "Europe Trip", target: 12000000, current: 8000000, date: ym(9), plan: 600000, completed: false, sources: [{ id: uid(), name: "Fixed Deposit", type: "fd", amount: 8000000 }] },
    { id: "goal-3", name: "MacBook", target: 10000000, current: 2500000, date: ym(15), plan: 540000, completed: false, sources: [{ id: uid(), name: "Recurring Deposit", type: "rd", amount: 2500000 }] },
  ];
}
