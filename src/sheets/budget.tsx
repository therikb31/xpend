// Budget sheets — ports of budgetSheet (+updateBudgetCalc) and budgetDetailSheet.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  aggSpentV,
  budgetCats,
  budgetCtx,
  budStClass,
  budStLabel,
  expenseCats,
  isOverall,
  monthShort,
  overallLimit,
  budgetMonthChips,
  budBarColor,
} from "../data/finance";
import { parseMk, parseRupeesToPaise, rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { Doc } from "../types";
import { Grab } from "./Sheet";

export function BudgetFormSheet({ id }: { id?: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  const existing = id ? doc.budgets.find((x) => x.id === id) : undefined;

  const [name, setName] = useState(existing ? existing.name : "");
  const [limit, setLimit] = useState(existing ? String((existing.limit || 0) / 100) : "");
  const [cats, setCats] = useState<string[]>(existing ? (existing.categoryIds || []).slice() : []);
  const [mk, setMk] = useState(existing ? existing.mkey || state.mkey : state.mkey);

  const mmName = parseMk(mk).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const calc = useMemo(() => {
    const nm = name.trim() || "This budget";
    if (cats.length === 0) {
      const lim = overallLimit(doc, mk);
      const spent = aggSpentV(doc, mk);
      const c = budgetCtx(mk, lim, spent);
      return { mode: "overall" as const, title: nm, limit: lim, spent, ctx: c };
    }
    const lim = parseRupeesToPaise(limit || "");
    if (!lim) return null;
    let spent = 0;
    for (const t of doc.transactions) {
      if (t.dir !== "expense" || t.date.slice(0, 7) !== mk) continue;
      if (cats.length && !cats.includes(t.categoryId)) continue;
      spent += t.amount;
    }
    return { mode: "cats" as const, title: nm, limit: lim, spent, ctx: budgetCtx(mk, lim, spent) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, limit, cats, mk, doc.transactions, doc.budgets]);

  const toggleCat = (cid: string) =>
    setCats((cs) => (cs.includes(cid) ? cs.filter((x) => x !== cid) : [...cs, cid]));

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast("Enter a budget name");
      return;
    }
    let lim = 0;
    if (cats.length) {
      lim = parseRupeesToPaise(limit || "");
      if (!isFinite(lim) || lim <= 0) {
        toast("Enter a monthly limit");
        return;
      }
    }
    const same = doc.budgets.filter((b) => b.id !== id && (b.mkey || state.mkey) === mk);
    if (same.some((b) => b.name.trim().toLowerCase() === n.toLowerCase())) {
      toast("A budget named " + n + " already exists");
      return;
    }
    if (cats.length) {
      for (const b of same) {
        const bc = b.categoryIds || [];
        if (!bc.length) continue;
        for (const cid of cats) {
          if (bc.includes(cid)) {
            toast("Already in " + b.name);
            return;
          }
        }
      }
    }
    mutate((d) => {
      const data = { name: n, limit: lim, categoryIds: cats, period: "monthly" as const, mkey: mk };
      if (id) {
        const b = d.budgets.find((x) => x.id === id);
        if (b) Object.assign(b, data);
      } else {
        d.budgets.push({ id: "bud-" + Date.now().toString(36), createdAt: Date.now(), ...data });
      }
    });
    closeSheet();
    toast(id ? "Budget updated" : "Budget created");
  };

  const monthChips = budgetMonthChips(mk);
  const expCats = expenseCats(doc);

  return (
    <>
      <Grab />
      <div className="sh-title">{id ? "Edit budget" : "Set budget"}</div>
      {calc && (
        <div className="goal-calc" id="budget-calc">
          {calc.mode === "overall" ? (
            <>
              <div className="goal-calc-hdr">
                {calc.title} · <span className={"pill " + budStClass(calc.ctx.status)}>
                  {calc.ctx.status === "over" ? "Over" : calc.ctx.status === "ahead" ? "Ahead of pace — slow down" : "On pace"}
                </span>
              </div>
              <div className="gc-grid">
                <div>
                  <span className="gc-lbl">Auto cap</span>
                  <span className="gc-val">{rupees(calc.limit, hide)}</span>
                </div>
                <div>
                  <span className="gc-lbl">Current spend</span>
                  <span className="gc-val">{rupees(calc.spent, hide)}</span>
                </div>
                <div>
                  <span className="gc-lbl">Remaining</span>
                  <span className={"gc-val " + (calc.ctx.status === "over" ? "neg" : "")}>
                    {rupees(calc.ctx.remaining, hide)}
                  </span>
                </div>
                <div>
                  <span className="gc-lbl">Progress</span>
                  <span className="gc-val">{Math.round(calc.ctx.pct * 100)}%</span>
                </div>
              </div>
              <div className="gc-note">
                Auto cap from category budgets in {mmName} — adjust those to change it.
              </div>
            </>
          ) : (
            <>
              <div className="goal-calc-hdr">
                {calc.title} · <span className={"pill " + budStClass(calc.ctx.status)}>
                  {calc.ctx.status === "over" ? "Over" : calc.ctx.status === "ahead" ? "Ahead of pace — slow down" : "On pace"}
                </span>
              </div>
              <div className="gc-grid">
                <div>
                  <span className="gc-lbl">Current spend</span>
                  <span className="gc-val">{rupees(calc.spent, hide)}</span>
                </div>
                <div>
                  <span className="gc-lbl">Limit</span>
                  <span className="gc-val">{rupees(calc.limit, hide)}</span>
                </div>
                <div>
                  <span className="gc-lbl">Remaining</span>
                  <span className={"gc-val " + (calc.ctx.remaining === 0 || calc.ctx.status === "over" ? "neg" : "")}>
                    {rupees(calc.ctx.remaining, hide)}
                  </span>
                </div>
                <div>
                  <span className="gc-lbl">Progress</span>
                  <span className="gc-val">{Math.round(calc.ctx.pct * 100)}%</span>
                </div>
              </div>
              {calc.ctx.status === "over" ? (
                <div className="gc-note err">
                  Over by <b>{rupees(calc.ctx.overage, hide)}</b> — trim spending to get back on budget.
                </div>
              ) : calc.ctx.elapsed === 0 ? (
                <div className="gc-note">
                  Planned for <b>{mmName}</b> — nothing spent yet. Safe pace{" "}
                  <b>{rupees(calc.ctx.safeDaily, hide)}/day</b> keeps you on budget.
                </div>
              ) : calc.ctx.status === "ahead" ? (
                <div className="gc-note warn">
                  Ahead of the linear pace — safe pace is <b>{rupees(calc.ctx.safeDaily, hide)}/day</b>.
                </div>
              ) : (
                <div className="gc-note">
                  On pace — {rupees(calc.spent, hide)} of {rupees(calc.ctx.expected, hide)} expected by day{" "}
                  {calc.ctx.elapsed} · safe pace <b>{rupees(calc.ctx.safeDaily, hide)}/day</b>.
                </div>
              )}
            </>
          )}
        </div>
      )}
      <input type="text" placeholder="What is this budget for?" value={name} onChange={(e) => setName(e.target.value)} />
      {cats.length === 0 ? (
        <div className="tsub" style={{ background: "rgba(255,255,255,.05)", padding: "10px 12px", borderRadius: 12, marginTop: 8 }}>
          Overall cap auto-calculates as the sum of your category budgets.
        </div>
      ) : (
        <>
          <div className="tsub" style={{ marginBottom: 2 }}>
            Monthly limit (₹)
          </div>
          <input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 30000"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            style={{ marginTop: 0 }}
          />
        </>
      )}
      <div className="tsub" style={{ margin: "6px 2px 2px" }}>
        Month
      </div>
      <div className="chip-row">
        {monthChips.map((k) => (
          <button key={k} className={"chip " + (k === mk ? "on" : "")} onClick={() => setMk(k)}>
            <span
              className="dot"
              style={{ ["--c" as string]: k === new Date().toISOString().slice(0, 7) ? "#52E5A5" : "#3A4147" } as CSSProperties}
            />
            {monthShort(k)}
          </button>
        ))}
      </div>
      <div className="tsub" style={{ margin: "6px 2px 2px" }}>
        Categories
      </div>
      <div className="chip-row">
        <button className={"chip " + (cats.length === 0 ? "on" : "")} onClick={() => setCats([])}>
          <span className="dot" style={{ ["--c" as string]: "#52E5A5" } as CSSProperties} />
          All expenses
        </button>
        {expCats.map((c) => (
          <button
            key={c.id}
            className={"chip " + (cats.includes(c.id) ? "on" : "")}
            onClick={() => toggleCat(c.id)}
          >
            <span className="dot" style={{ ["--c" as string]: c.color } as CSSProperties} />
            {c.name}
          </button>
        ))}
      </div>
      <button className="btn" style={{ marginTop: 16 }} onClick={save}>
        {IC.check} {id ? "Save budget" : "Set budget"}
      </button>
    </>
  );
}

export function BudgetDetailSheet({ id }: { id: string }) {
  const { state, mutate, closeSheet, openSheet, toast } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  const [armed, setArmed] = useState(false);
  const b = doc.budgets.find((x) => x.id === id);
  if (!b) return null;

  const cats = budgetCats(doc, b);
  const all = isOverall(b);
  const bk = b.mkey || state.mkey;
  const limit = all ? overallLimit(doc, bk) : b.limit || 0;
  const spent = all ? aggSpentV(doc, bk) : spentOf(doc, b.id, state.mkey);
  const c = budgetCtx(bk, limit, spent);
  const stL = budStLabel(c.status);
  const stC = budStClass(c.status);
  const names = all
    ? "Auto cap — sum of your category budgets"
    : cats.length
      ? cats.map((x) => x.name).join(" · ")
      : "Categories removed";
  const bMonthName = parseMk(bk).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const del = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    mutate((d) => void (d.budgets = d.budgets.filter((x) => x.id !== id)));
    closeSheet();
    toast("Budget deleted");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">{b.name}</div>
      <div className="gd-status">
        <span className={"pill " + stC}>{stL}</span>
      </div>
      <div className="gd-progress">
        <i style={{ width: Math.min(100, c.pct * 100) + "%", background: budBarColor(c) }}></i>
      </div>
      <div className="gc-grid">
        <div>
          <span className="gc-lbl">Spent</span>
          <span className="gc-val">{rupees(c.spent, hide)}</span>
        </div>
        <div>
          <span className="gc-lbl">Limit</span>
          <span className="gc-val">{rupees(limit, hide)}</span>
        </div>
        <div>
          <span className="gc-lbl">Remaining</span>
          <span className={"gc-val " + (c.status === "over" ? "neg" : "")}>{rupees(c.remaining, hide)}</span>
        </div>
        <div>
          <span className="gc-lbl">Safe pace</span>
          <span className="gc-val">{c.status === "over" ? "₹0" : rupees(c.safeDaily, hide) + "/d"}</span>
        </div>
      </div>
      {c.status === "over" ? (
        <div className="gd-note">
          Over by <b>{rupees(c.overage, hide)}</b> this month.
        </div>
      ) : c.status === "ahead" ? (
        <div className="gd-note">
          Ahead of the linear pace — spent {rupees(c.spent, hide)} of {rupees(c.expected, hide)} expected by
          now. Safe pace is <b>{rupees(c.safeDaily, hide)}/day</b>.
        </div>
      ) : (
        <div className="gd-note">
          On pace — spent {rupees(c.spent, hide)} of {rupees(c.expected, hide)} expected by now.
        </div>
      )}
      <div className="sec-label" style={{ marginTop: 16 }}>
        Budget
      </div>
      <div className="slab">
        <span className="s-label">
          Month<div className="s-sub">Applies only to this month</div>
        </span>
        <span>{bMonthName}</span>
      </div>
      <div className="slab">
        <span className="s-label">
          Categories<div className="s-sub">{names}</div>
        </span>
        <span>{all ? "All" : cats.length + " cat" + (cats.length === 1 ? "" : "s")}</span>
      </div>
      <div className="slab">
        <span className="s-label">
          Period<div className="s-sub">One month — does not repeat</div>
        </span>
        <span>Monthly</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => openSheet({ name: "budget-form", id: b.id })}>
          Edit
        </button>
      </div>
      <button
        className="btn ghost"
        style={{ width: "100%", marginTop: 12, color: "var(--neg)", borderColor: "rgba(192,91,77,.35)" }}
        onClick={del}
      >
        {IC.trash} {armed ? "Tap again to delete" : "Delete budget"}
      </button>
    </>
  );
}

function spentOf(doc: Doc, id: string, mkey: string): number {
  const b = doc.budgets.find((x) => x.id === id)!;
  let s = 0;
  const key = b.mkey || mkey;
  for (const t of doc.transactions) {
    if (t.dir !== "expense" || t.date.slice(0, 7) !== key) continue;
    if (b.categoryIds && b.categoryIds.length && !b.categoryIds.includes(t.categoryId)) continue;
    s += t.amount;
  }
  return s;
}
