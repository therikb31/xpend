// Goal sheets — ports of goalSheet / goalDetailSheet / goalSrcSheet /
// srcEntrySheet / goalCompleteSheet. Sources/entry are internal step state.

import { useMemo, useState } from "react";
import { goalCalc, goalCurrent } from "../data/finance";
import { parseMk, parseRupeesToPaise, rupees, todayStr, uid } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { GoalSource } from "../types";
import { Grab } from "./Sheet";

const SRC_TYPES = [
  "Mutual Fund — Groww",
  "Savings Account — HDFC",
  "Savings Account — ICICI",
  "Recurring Deposit",
  "Fixed Deposit",
  "Cash",
  "Other",
];

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  "on-track": "On Track",
  "needs-attention": "Needs Attention",
  overdue: "Overdue",
};

function statusClass(status: string): string {
  return status === "on-track" ? "on" : status === "needs-attention" ? "warn" : status === "overdue" ? "err" : "ok";
}

export function GoalFormSheet({ id }: { id?: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  const existing = id ? doc.goals.find((x) => x.id === id) : undefined;

  const [step, setStep] = useState<"main" | "sources" | "entry">("main");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [name, setName] = useState(existing ? existing.name : "");
  const [target, setTarget] = useState(existing ? String(existing.target / 100) : "");
  const [date, setDate] = useState(existing ? existing.date || "" : "");
  const [curIn, setCurIn] = useState("");
  const [plan, setPlan] = useState(existing && existing.plan != null ? String(existing.plan / 100) : "");
  const [sources, setSources] = useState<GoalSource[]>(
    (existing ? existing.sources || [] : []).map((s) => ({ ...s }))
  );
  const [srcName, setSrcName] = useState("");
  const [srcAmt, setSrcAmt] = useState("");

  const calc = useMemo(() => {
    const t = parseRupeesToPaise(target || "");
    if (!t) return null;
    const planV = parseRupeesToPaise(plan || "");
    const srcTotal = sources.reduce((s, x) => s + (x.amount || 0), 0);
    const current = sources.length ? srcTotal : parseRupeesToPaise(curIn || "");
    const g = {
      id: "tmp", name: name.trim() || "This goal", target: t, date,
      current, plan: planV, sources, completed: false,
    };
    return goalCalc(g);
  }, [target, plan, sources, curIn, name, date]);

  const openEntry = (idx: number | null) => {
    setEditIdx(idx);
    if (idx != null && sources[idx]) {
      setSrcName(sources[idx].name);
      setSrcAmt(String(sources[idx].amount / 100));
    } else {
      setSrcName("");
      setSrcAmt("");
    }
    setStep("entry");
  };

  const saveEntry = () => {
    const n = srcName.trim();
    if (!n) {
      toast("Enter a source name");
      return;
    }
    const amt = parseRupeesToPaise(srcAmt || "");
    if (!isFinite(amt) || amt < 0) {
      toast("Enter an amount");
      return;
    }
    if (editIdx != null) {
      setSources((ss) =>
        ss.map((s, i) => (i === editIdx ? { ...s, name: n, amount: amt } : s))
      );
    } else {
      setSources((ss) => [...ss, { id: uid(), name: n, type: "", amount: amt }]);
    }
    setStep("sources");
  };

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast("Enter a goal name");
      return;
    }
    const t = parseRupeesToPaise(target || "");
    if (!isFinite(t) || t <= 0) {
      toast("Enter an estimated cost");
      return;
    }
    const curInV = parseRupeesToPaise(curIn || "");
    const planV = parseRupeesToPaise(plan || "");
    const srcs = sources.map((s) => ({
      id: s.id || uid(), name: s.name, type: s.type || "", amount: Math.round(s.amount || 0),
    }));
    let current: number;
    if (!srcs.length && curInV > 0) {
      current = curInV;
      srcs.push({ id: uid(), name: "Cash", type: "cash", amount: curInV });
    } else {
      current = srcs.reduce((s, x) => s + x.amount, 0);
    }
    const data = { name: n, target: t, date: (date || "").trim() || "", current, plan: planV, sources: srcs };
    mutate((d) => {
      if (id) {
        const g = d.goals.find((x) => x.id === id);
        if (g) Object.assign(g, data, { completed: false });
      } else {
        d.goals.push({ id: uid(), completed: false, createdAt: Date.now(), ...data });
      }
    });
    closeSheet();
    toast(id ? "Goal updated" : "Goal created");
  };

  if (step === "sources") {
    const total = sources.reduce((s, x) => s + (x.amount || 0), 0);
    return (
      <>
        <Grab />
        <div className="sh-title">Savings sources</div>
        <div className="tsub" style={{ margin: "0 2px 10px", color: "var(--muted)" }}>
          Total saved across sources: <b>{rupees(total, hide)}</b>
        </div>
        {sources.length ? (
          sources.map((s, i) => (
            <div key={s.id} className="slab">
              <span className="s-label">{s.name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <b>{rupees(s.amount || 0, hide)}</b>
                <button className="row-btn" onClick={() => openEntry(i)}>
                  {IC.pen}
                </button>
                <button
                  className="row-btn"
                  onClick={() => setSources((ss) => ss.filter((_, j) => j !== i))}
                >
                  {IC.x}
                </button>
              </span>
            </div>
          ))
        ) : (
          <div className="tsub" style={{ margin: "0 2px 8px", color: "var(--muted)" }}>
            No sources yet — add where this goal's money is kept.
          </div>
        )}
        <button className="set" style={{ marginTop: 8 }} onClick={() => openEntry(null)}>
          <span className="s-label">
            Add source<div className="s-sub">Mutual Fund, Savings Account, FD, RD, Cash…</div>
          </span>
          {IC.plus}
        </button>
        <button className="btn" style={{ marginTop: 16 }} onClick={() => setStep("main")}>
          {IC.check} Done
        </button>
      </>
    );
  }

  if (step === "entry") {
    return (
      <>
        <Grab />
        <div className="sh-title">{editIdx != null ? "Edit source" : "Add source"}</div>
        <div className="chip-row" style={{ marginTop: 0 }}>
          {SRC_TYPES.map((t) => (
            <button
              key={t}
              className={"chip " + (srcName === t ? "on" : "")}
              onClick={() => setSrcName(t)}
            >
              {t.split(" — ")[0]}
            </button>
          ))}
        </div>
        <div className="tsub" style={{ margin: "8px 2px 4px" }}>
          Source name
        </div>
        <input
          type="text"
          placeholder="e.g. Savings Account — HDFC"
          value={srcName}
          onChange={(e) => setSrcName(e.target.value)}
          style={{ marginTop: 0 }}
        />
        <div className="tsub" style={{ margin: "8px 2px 4px" }}>
          Amount saved (₹)
        </div>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={srcAmt}
          onChange={(e) => setSrcAmt(e.target.value)}
          style={{ marginTop: 0 }}
        />
        <button className="btn" style={{ marginTop: 16 }} onClick={saveEntry}>
          {IC.check} {editIdx != null ? "Save source" : "Add source"}
        </button>
      </>
    );
  }

  return (
    <>
      <Grab />
      <div className="sh-title">{id ? "Edit goal" : "Create goal"}</div>
      {calc && (
        <div className="goal-calc" id="goal-calc">
          <div className="goal-calc-hdr">
            {name.trim() || "This goal"} ·{" "}
            <span className={"pill " + statusClass(calc.status)}>{STATUS_LABEL[calc.status]}</span>
          </div>
          <div className="gc-grid">
            <div>
              <span className="gc-lbl">Saved</span>
              <span className="gc-val inc">{rupees(calc.current, hide)}</span>
            </div>
            <div>
              <span className="gc-lbl">Target</span>
              <span className="gc-val">{rupees(calc.target, hide)}</span>
            </div>
            <div>
              <span className="gc-lbl">Remaining</span>
              <span className="gc-val neg">{rupees(calc.remaining, hide)}</span>
            </div>
            <div>
              <span className="gc-lbl">Progress</span>
              <span className="gc-val">{Math.round(calc.pct)}%</span>
            </div>
          </div>
          {calc.months > 0 ? (
            <div className="gc-note">
              {calc.status === "on-track"
                ? "Saving " + rupees(calc.plan, hide) + "/mo will reach the goal on time."
                : calc.status === "needs-attention"
                  ? (
                    <>
                      Need <b>{rupees(calc.required, hide)}/mo</b> to reach the target by{" "}
                      {parseMk(date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                      {calc.plan > 0
                        ? calc.required > calc.plan
                          ? ` · currently saving ${rupees(calc.plan, hide)}/mo`
                          : ""
                        : ""}
                    </>
                  )
                  : calc.status === "completed"
                    ? "Target saved — ready to buy!"
                    : ""}
            </div>
          ) : calc.status === "overdue" ? (
            <div className="gc-note err">
              Target date has passed — needs <b>{rupees(calc.required, hide)}/mo</b> now.
            </div>
          ) : null}
          {calc.status === "completed" && (
            <div className="gc-note ok">All {rupees(calc.target, hide)} saved — you can make the purchase!</div>
          )}
        </div>
      )}
      <input type="text" placeholder="What are you saving for?" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="tsub" style={{ marginBottom: 2 }}>
        Estimated cost (₹)
      </div>
      <input
        type="text"
        inputMode="decimal"
        placeholder="e.g. 150000"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        style={{ marginTop: 0 }}
      />
      <div className="tsub" style={{ marginBottom: 2 }}>
        Expected expense date
      </div>
      <input type="month" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginTop: 0 }} />
      <div className="tsub" style={{ marginBottom: 2 }}>
        Current amount saved (₹)
      </div>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={curIn}
        onChange={(e) => setCurIn(e.target.value)}
        style={{ marginTop: 0 }}
      />
      <div className="tsub" style={{ marginBottom: 2 }}>
        Expected savings per month (₹)
      </div>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={plan}
        onChange={(e) => setPlan(e.target.value)}
        style={{ marginTop: 0 }}
      />
      <button className="set" style={{ marginTop: 14 }} onClick={() => setStep("sources")}>
        <span className="s-label">
          Savings source
          {sources.length ? (
            <div className="s-sub">
              {sources.length} source{sources.length === 1 ? "" : "s"} · {sources.map((s) => s.name).join(", ")}
            </div>
          ) : (
            <div className="s-sub">Where the money for this goal is kept</div>
          )}
        </span>
        <span className="csel">{sources.length ? IC.wallet : IC.plus}</span>
      </button>
      <button className="btn" style={{ marginTop: 16 }} onClick={save}>
        {IC.check} {id ? "Save goal" : "Create goal"}
      </button>
    </>
  );
}

export function GoalDetailSheet({ id }: { id: string }) {
  const { state, mutate, closeSheet, openSheet, toast } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  const [armed, setArmed] = useState(false);
  const g = doc.goals.find((x) => x.id === id);
  if (!g) return null;
  const c = goalCalc(g);
  const stL = STATUS_LABEL[c.status];
  const stC = statusClass(c.status);
  const srcTotal = goalCurrent(g);
  const monthsLeft = c.saveMonths > 0 ? c.saveMonths : g.date ? "past due" : "no date";
  const dateTxt = g.date
    ? parseMk(g.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : "—";

  const del = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    mutate((d) => void (d.goals = d.goals.filter((x) => x.id !== id)));
    closeSheet();
    toast("Goal deleted");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">{g.name}</div>
      <div className="gd-status">
        <span className={"pill " + stC}>{stL}</span>
      </div>
      <div className="gd-progress">
        <i style={{ width: Math.min(100, c.pct) + "%" }}></i>
      </div>
      <div className="gc-grid">
        <div>
          <span className="gc-lbl">Saved</span>
          <span className="gc-val inc">{rupees(c.current, hide)}</span>
        </div>
        <div>
          <span className="gc-lbl">Target</span>
          <span className="gc-val">{rupees(c.target, hide)}</span>
        </div>
        <div>
          <span className="gc-lbl">Remaining</span>
          <span className="gc-val neg">{rupees(c.remaining, hide)}</span>
        </div>
        <div>
          <span className="gc-lbl">Progress</span>
          <span className="gc-val">{Math.round(c.pct)}%</span>
        </div>
      </div>
      {!g.completed && (
        <div className="gd-note">
          {c.status === "on-track"
            ? "Saving " + rupees(c.plan, hide) + "/mo" + (g.date ? " · on track for " + dateTxt : "")
            : c.status === "needs-attention"
              ? (
                <>
                  Needs <b>{rupees(c.required, hide)}/mo</b> to hit the target
                  {g.date ? ` by ${dateTxt}` : ""}
                  {c.plan > 0 ? ` · saving ${rupees(c.plan, hide)}/mo` : ""}
                </>
              )
              : c.status === "overdue"
                ? (
                  <>
                    Target date ({dateTxt}) has passed — needs <b>{rupees(c.required, hide)}/mo</b> now.
                  </>
                )
                : "Target saved — ready to buy!"}
        </div>
      )}
      <div className="sec-label" style={{ marginTop: 16 }}>
        Goal
      </div>
      <div className="slab">
        <span className="s-label">
          Estimated cost
          <div className="s-sub">
            {g.actualAmount
              ? `Actual: ${rupees(g.actualAmount, hide)} · ${
                g.actualAmount <= g.target
                  ? "under by " + rupees(g.target - g.actualAmount, hide)
                  : "over by " + rupees(g.actualAmount - g.target, hide)
              }`
              : ""}
          </div>
        </span>
        <span>{rupees(c.target, hide)}</span>
      </div>
      <div className="slab">
        <span className="s-label">
          Expected date
          <div className="s-sub">
            {monthsLeft === "past due" ? "Past due" : monthsLeft === "no date" ? "No date set" : monthsLeft + " month" + (monthsLeft === 1 ? "" : "s") + " left to save"}
          </div>
        </span>
        <span>{dateTxt}</span>
      </div>
      <div className="slab">
        <span className="s-label">
          Monthly savings plan
          <div className="s-sub">
            {c.plan > 0
              ? "Estimated completion: " +
                (c.estDate ? c.estDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—")
              : "No monthly plan set"}
          </div>
        </span>
        <span>{rupees(c.plan, hide)}/mo</span>
      </div>
      <div className="sec-label" style={{ marginTop: 16 }}>
        Savings Sources {srcTotal ? `· ${rupees(srcTotal, hide)}` : "· no source yet"}
      </div>
      {g.sources && g.sources.length ? (
        g.sources.map((s) => (
          <div key={s.id} className="slab">
            <span className="s-label">{s.name}</span>
            <span>{rupees(s.amount || 0, hide)}</span>
          </div>
        ))
      ) : (
        <div className="tsub" style={{ margin: "0 2px 4px", color: "var(--muted)" }}>
          No savings source allocated yet.
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => openSheet({ name: "goal-form", id: g.id })}>
          Edit
        </button>
        {!g.completed && (
          <button className="btn" style={{ flex: 1 }} onClick={() => openSheet({ name: "goal-complete", id: g.id })}>
            {IC.check} Purchased
          </button>
        )}
      </div>
      {g.completed && (
        <div className="gd-note ok">
          Recorded as an expense{g.actualTxId ? " · tap the Activity tab to see it" : ""}
        </div>
      )}
      <button
        className="btn ghost"
        style={{ width: "100%", marginTop: 12, color: "var(--neg)", borderColor: "rgba(192,91,77,.35)" }}
        onClick={del}
      >
        {IC.trash} {armed ? "Tap again to delete" : "Delete goal"}
      </button>
    </>
  );
}

export function GoalCompleteSheet({ id }: { id: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const g = doc.goals.find((x) => x.id === id);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  if (!g) return null;

  const save = () => {
    const amtInput = amount.trim();
    const amt = amtInput ? parseRupeesToPaise(amtInput) : g.target;
    if (!isFinite(amt) || amt <= 0) {
      toast("Enter a valid purchase amount");
      return;
    }
    mutate((d) => {
      const t = d.goals.find((x) => x.id === id);
      if (!t) return;
      t.actualAmount = amt;
      t.actualDate = date;
      t.completed = true;
      t.completedAt = date;
      const acc = d.accounts.find((x) => x.id !== "__prev" && x.kind !== "card") || d.accounts[0];
      if (acc) {
        let catId = "cat-other";
        const match = d.categories.find(
          (x) => x.kind === "expense" && g.name && g.name.toLowerCase() === x.name.toLowerCase()
        );
        if (match) catId = match.id;
        const txn = {
          id: uid(), date, dir: "expense" as const, amount: amt,
          categoryId: catId, accountId: acc.id, note: (g.name || "") + " (goal)", createdAt: Date.now(),
        };
        d.transactions.push(txn);
        t.actualTxId = txn.id;
        t.actualCatId = catId;
      }
    });
    closeSheet();
    toast("Goal completed");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Purchased {g.name}?</div>
      <div className="tsub" style={{ margin: "0 2px 4px", color: "var(--muted)" }}>
        Record what you actually spent. The goal moves to your completed history.
      </div>
      <div className="tsub" style={{ marginBottom: 2 }}>
        Purchase amount (₹)
      </div>
      <input
        type="text"
        inputMode="decimal"
        placeholder={String(g.target / 100)}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ marginTop: 0 }}
      />
      <div className="tsub" style={{ marginBottom: 2 }}>
        Purchase date
      </div>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginTop: 0 }} />
      <button className="btn" style={{ marginTop: 16 }} onClick={save}>
        {IC.check} Mark purchased
      </button>
    </>
  );
}
