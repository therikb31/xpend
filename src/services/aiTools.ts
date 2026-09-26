// AI tool layer — read-only function schemas + local execution.
// Every tool runs against the on-device doc; only each tool's RESULT
// crosses to OpenRouter. No write tools exist by design (advice-only AI:
// the chat proposes, the user taps things in).

import {
  accBalance, bucketTxns, budgetsFor, budgetCtx, budgetSpent, catById, catSpend, isOverall,
  goalExpected, goalFunded, goalProgress, goalTag, merchById, merchantSpend, monthStats, p1Floor, savingsTally, sortedTxs,
  trNames,
} from "../data/finance";
import { monthKey, parseMk } from "../lib/format";
import { detectReplenishment } from "../lib/replenish";
import type { Doc, Txn } from "../types";

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** All money in tool inputs/outputs is decimal ₹ rupees ( converted from paise). */
const rs = (paise: number) => Math.round(paise) / 100;

function prevKeys(mkey: string, n: number): string[] {
  const out: string[] = [mkey];
  const d = parseMk(mkey);
  for (let i = 1; i < n; i++) {
    d.setMonth(d.getMonth() - 1);
    out.unshift(monthKey(d));
  }
  return out;
}

function checkMkey(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) {
    throw new Error("mkey must be YYYY-MM");
  }
  return v;
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === "number" && isFinite(v) ? Math.floor(v) : def;
  return Math.min(max, Math.max(min, n));
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "get_month_overview",
    description:
      "Month finances: spent, income, remaining, savings tally with 50-30-20 split, top-5 categories. Pass months>1 for consecutive history (oldest first). Start here for almost every question.",
    parameters: {
      type: "object",
      properties: {
        mkey: { type: "string", description: "YYYY-MM month (default: current)" },
        months: { type: "integer", description: "How many consecutive months ending at mkey (1-12, default 1)" },
      },
    },
  },
  {
    name: "get_category_data",
    description: "Per-category expense totals, optionally over several months (for averages and trends).",
    parameters: {
      type: "object",
      properties: {
        mkey: { type: "string", description: "YYYY-MM month (default: current)" },
        months: { type: "integer", description: "Consecutive months ending at mkey (1-12, default 1)" },
      },
    },
  },
  {
    name: "get_merchant_data",
    description: "Merchant expense totals for a month, biggest first.",
    parameters: {
      type: "object",
      properties: {
        mkey: { type: "string", description: "YYYY-MM month (default: current)" },
        top: { type: "integer", description: "Max merchants to return (1-50, default 10)" },
      },
    },
  },
  {
    name: "get_items_data",
    description: "Repeated expense-note groups (what gets bought often), by amount.",
    parameters: {
      type: "object",
      properties: {
        mkey: { type: "string", description: "YYYY-MM month (default: current)" },
        min_count: { type: "integer", description: "Minimum repeat count (default 2)" },
        top: { type: "integer", description: "Max groups (1-50, default 20)" },
      },
    },
  },
  {
    name: "get_budget_data",
    description: "Budgets for a month with spent-vs-limit status.",
    parameters: {
      type: "object",
      properties: {
        mkey: { type: "string", description: "YYYY-MM month (default: current)" },
      },
    },
  },
  {
    name: "get_goals_data",
    description: "All savings goals with target, current, remaining, monthly required and status.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_accounts_data",
    description: "Accounts with balances, previous-savings figures, and net worth (excludes savings/secondary, like the app).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_transactions",
    description:
      "Detailed labeled transactions, newest first. Always pass limit (max 100); use offset to page and check total_count before fetching more. Free-text notes are never included.",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["all", "expense", "income", "trans"], description: "Default all" },
        category_id: { type: "string", description: "Category id from the directory" },
        merchant_id: { type: "string", description: "Merchant id from the directory (__none for unassigned)" },
        account_id: { type: "string", description: "Account id from the directory" },
        mkey: { type: "string", description: "YYYY-MM month filter" },
        days: { type: "integer", description: "Last N days instead of a month (1-365)" },
        limit: { type: "integer", description: "Max rows (1-100, default 25)" },
        offset: { type: "integer", description: "Rows to skip (default 0)" },
      },
    },
  },
  {
    name: "detect_replenishment",
    description:
      "Repeat-purchase patterns (grocery history + expense corroboration): predicted next-buy dates, modal qty, price estimates, confidence tiers. Use for 'expected spends' questions.",
    parameters: {
      type: "object",
      properties: {
        due_within_days: { type: "integer", description: "Only items due within N days (default 35)" },
        min_evidence: { type: "string", enum: ["firm", "any"], description: "firm = 3+ purchases only (default any)" },
      },
    },
  },
];

function labelTxn(doc: Doc, t: Txn): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: t.id, date: t.date.slice(0, 10), dir: t.dir, amount: rs(t.amount),
  };
  if (t.dir === "trans") {
    base.from = t.from;
    base.to = t.to;
    base.label = trNames(doc, t as Extract<Txn, { dir: "trans" }>);
  } else {
    const c = catById(doc, t.categoryId);
    base.category_id = t.categoryId;
    base.category = c ? c.name : "Unknown";
    if (t.merchantId) {
      const m = merchById(doc, t.merchantId);
      base.merchant_id = t.merchantId;
      base.merchant = m ? m.name : "?";
    }
    base.account_id = t.accountId;
    const a = (doc.accounts || []).find((x) => x.id === t.accountId);
    base.account = a ? a.name : "?";
  }
  return base;
}

export function runTool(name: string, rawArgs: unknown, doc: Doc): unknown {
  const a = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const cur = monthKey(new Date());
  switch (name) {
    case "get_month_overview": {
      const mkey = a.mkey === undefined ? cur : checkMkey(a.mkey);
      const months = clampInt(a.months, 1, 1, 12);
      return {
        months: prevKeys(mkey, months).map((k) => {
          const st = monthStats(doc, k);
          const tal = savingsTally(doc, k, "all");
          const sumKey = (key: "need" | "want") =>
            bucketTxns(doc, key, k, "all").reduce((s, t) => s + t.amount, 0);
          return {
            mkey: k, spent: rs(st.spent), income: rs(st.inc), remaining: rs(st.remaining),
            split_50_30_20: {
              needs: rs(sumKey("need")), wants: rs(sumKey("want")), savings: tal.total,
            },
            savings_balance: tal.balance,
            savings_manual_moves: tal.moved, savings_tagged: tal.tagged,
          };
        }),
        top_categories: Object.entries(catSpend(doc, mkey))
          .sort((x, y) => y[1] - x[1])
          .slice(0, 5)
          .map(([id, amt]) => {
            const c = catById(doc, id);
            return { id, name: c ? c.name : "Unknown", amount: rs(amt) };
          }),
      };
    }
    case "get_category_data": {
      const mkey = a.mkey === undefined ? cur : checkMkey(a.mkey);
      const months = clampInt(a.months, 1, 1, 12);
      return {
        months: prevKeys(mkey, months).map((k) => ({
          mkey: k,
          entries: Object.entries(catSpend(doc, k))
            .sort((x, y) => y[1] - x[1])
            .map(([id, amt]) => {
              const c = catById(doc, id);
              return { id, name: c ? c.name : "Unknown", kind: c ? c.kind : "?", amount: rs(amt) };
            }),
        })),
      };
    }
    case "get_merchant_data": {
      const mkey = a.mkey === undefined ? cur : checkMkey(a.mkey);
      const top = clampInt(a.top, 10, 1, 50);
      return {
        mkey,
        entries: Object.entries(merchantSpend(doc, mkey))
          .sort((x, y) => y[1] - x[1])
          .slice(0, top)
          .map(([id, amt]) => {
            const m = id === "__none" ? null : merchById(doc, id);
            return { id, name: m ? m.name : "Unassigned", amount: rs(amt) };
          }),
      };
    }
    case "get_items_data": {
      const mkey = a.mkey === undefined ? cur : checkMkey(a.mkey);
      const min = clampInt(a.min_count, 2, 1, 50);
      const top = clampInt(a.top, 20, 1, 50);
      const byKey = new Map<string, { freq: Record<string, number>; count: number; amt: number }>();
      for (const t of doc.transactions || []) {
        if (t.dir !== "expense" || t.date.slice(0, 7) !== mkey) continue;
        const raw = ((t.note || "") as string).trim();
        if (!raw) continue;
        const key = raw.toLowerCase().replace(/\s+/g, " ");
        let g = byKey.get(key);
        if (!g) {
          g = { freq: {}, count: 0, amt: 0 };
          byKey.set(key, g);
        }
        g.freq[raw] = (g.freq[raw] || 0) + 1;
        g.count += 1;
        g.amt += t.amount;
      }
      return {
        mkey,
        entries: [...byKey.entries()]
          .filter(([, g]) => g.count >= min)
          .map(([key, g]) => ({
            key,
            display: Object.entries(g.freq).sort((x, y) => y[1] - x[1])[0][0],
            count: g.count,
            amount: rs(g.amt),
          }))
          .sort((x, y) => y.amount - x.amount)
          .slice(0, top),
      };
    }
    case "get_budget_data": {
      const mkey = a.mkey === undefined ? cur : checkMkey(a.mkey);
      return {
        mkey,
        budgets: budgetsFor(doc, mkey).map((b) => {
          const spent = isOverall(b) ? 0 : budgetSpent(doc, b, mkey);
          const ctx = budgetCtx(mkey, b.limit || 0, spent);
          return {
            id: b.id, name: b.name, period: b.period,
            categories: (b.categoryIds || []).map((id) => {
              const c = catById(doc, id);
              return c ? c.name : "?";
            }),
            limit: rs(b.limit || 0), spent: rs(spent), remaining: rs(ctx.remaining),
            status: ctx.status, expected_so_far: rs(ctx.expected),
          };
        }),
      };
    }
    case "get_goals_data": {
      return {
        p1_floor_monthly: rs(p1Floor(doc)),
        goals: (doc.goals || [])
          .filter((g) => !g.deleted)
          .map((g) => {
            const c = goalProgress(doc, g);
            const exp = goalExpected(doc, g);
            const cat = g.categoryId ? catById(doc, g.categoryId) : null;
            return {
              id: g.id, name: g.name, icon: g.icon || null, target: rs(c.target), current: rs(c.current),
              remaining: rs(c.remaining), pct: Math.round(c.pct * 10) / 10,
              monthly_required: rs(c.required), date: g.date || null,
              expected_date: exp.expectedKey, status: c.status,
              priority: g.priority ?? 2, paused: !!g.paused,
              category: cat ? cat.name : null, bucket_50_30_20: goalTag(doc, g),
              funded_via_transfers: rs(goalFunded(doc, g.id)),
              completed: !!g.completed,
            };
          }),
      };
    }
    case "get_accounts_data": {
      const accs = doc.accounts || [];
      return {
        net_worth: rs(
          accs.reduce((s, x) => s + (x.kind === "savings" || x.secondary ? 0 : accBalance(doc, x.id)), 0)
        ),
        accounts: accs.map((x) => ({
          id: x.id, name: x.name, kind: x.kind, secondary: !!x.secondary,
          balance: rs(accBalance(doc, x.id)),
          previous_savings: x.kind === "savings" && x.prev != null ? rs(x.prev) : null,
        })),
      };
    }
    case "get_transactions": {
      const dir = a.direction === undefined ? "all" : a.direction;
      if (!["all", "expense", "income", "trans"].includes(dir as string)) {
        throw new Error("direction must be all|expense|income|trans");
      }
      const limit = clampInt(a.limit, 25, 1, 100);
      const offset = clampInt(a.offset, 0, 0, 100000);
      let list = sortedTxs(doc);
      if (dir !== "all") list = list.filter((t) => t.dir === dir);
      if (typeof a.category_id === "string" && a.category_id) {
        list = list.filter((t) => t.dir !== "trans" && t.categoryId === a.category_id);
      }
      if (typeof a.merchant_id === "string" && a.merchant_id) {
        list = list.filter((t) => t.dir !== "trans" && (t.merchantId || "__none") === a.merchant_id);
      }
      if (typeof a.account_id === "string" && a.account_id) {
        const id = a.account_id as string;
        list = list.filter((t) => (t.dir === "trans" ? t.from === id || t.to === id : t.accountId === id));
      }
      if (a.days !== undefined) {
        const n = clampInt(a.days, 0, 1, 365);
        const d = new Date();
        d.setDate(d.getDate() - n);
        const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        list = list.filter((t) => t.date.slice(0, 10) >= iso);
      } else if (a.mkey !== undefined) {
        const k = checkMkey(a.mkey);
        list = list.filter((t) => t.date.slice(0, 7) === k);
      }
      return {
        total_count: list.length,
        returned: Math.min(limit, Math.max(0, list.length - offset)),
        transactions: list.slice(offset, offset + limit).map((t) => labelTxn(doc, t)),
      };
    }
    case "detect_replenishment": {
      const due = clampInt(a.due_within_days, 35, 1, 365);
      const minEv = a.min_evidence === "firm" ? "firm" : "any";
      const r = detectReplenishment(doc, { dueWithinDays: due, minEvidence: minEv as "firm" | "any" });
      return {
        as_of: r.asOf,
        candidates: r.candidates.map((c) => ({
          name: c.display, interval_days: c.intervalDays, last_bought: c.lastDate,
          next_due: c.nextDate, evidence_purchases: c.evidence, confidence: c.tier,
          qty: c.qty, est_price: c.price, on_list: c.onList, sources: c.sources,
        })),
      };
    }
    default:
      throw new Error("unknown tool: " + String(name));
  }
}
