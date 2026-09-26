// Goal sheets — ports of goalSheet / goalDetailSheet / goalSrcSheet /
// srcEntrySheet / goalCompleteSheet. Sources/entry are internal step state.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  accBalance, allocateWaterfall, expenseCats, goalCalc, goalCurrent, goalExpected,
  goalProgress, liveGoals, p1Floor,
} from "../data/finance";
import { catEmoji, parseMk, parseRupeesToPaise, rupees, todayStr, uid } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { Doc, GoalSource, Txn } from "../types";
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
  const [priority, setPriority] = useState<1 | 2 | 3>(existing ? existing.priority ?? 2 : 2);
  const [categoryId, setCategoryId] = useState(existing ? existing.categoryId || "" : "");
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
    if (!categoryId) {
      toast("Pick a category for this goal");
      return;
    }
    if (priority === 1 && !(date || "").trim()) {
      toast("P1 goals need a target date");
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
    const data = {
      name: n, target: t, date: (date || "").trim() || "", current, plan: planV, sources: srcs,
      priority, categoryId,
    };
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
        <label className="field note-field" style={{ marginTop: 0 }}>
          <span className="ficon">🏦</span>
          <input
            className="note-inline"
            placeholder="e.g. Savings Account — HDFC"
            value={srcName}
            onChange={(e) => setSrcName(e.target.value)}
          />
        </label>
        <label className="field note-field" style={{ marginTop: 0 }}>
          <span className="ficon">₹</span>
          <input
            inputMode="decimal"
            className="note-inline"
            placeholder="Amount saved"
            value={srcAmt}
            onChange={(e) => setSrcAmt(e.target.value)}
          />
        </label>
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
      <label className="field note-field">
        <span className="ficon">🎯</span>
        <input
          className="note-inline"
          placeholder="What are you saving for?"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field note-field">
        <span className="ficon">₹</span>
        <input
          inputMode="decimal"
          className="note-inline"
          placeholder="Estimated cost"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <span className="f-val">Target</span>
      </label>
      <label className="field note-field">
        <span className="ficon">🗓️</span>
        <input
          type="month"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Expected expense date"
        />
        <span className="f-val">Date</span>
      </label>
      <label className="field note-field">
        <span className="ficon">₹</span>
        <input
          inputMode="decimal"
          className="note-inline"
          placeholder="Current saved"
          value={curIn}
          onChange={(e) => setCurIn(e.target.value)}
        />
        <span className="f-val">Saved</span>
      </label>
      <label className="field note-field">
        <span className="ficon">₹</span>
        <input
          inputMode="decimal"
          className="note-inline"
          placeholder="Savings per month"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
        />
        <span className="f-val">/mo</span>
      </label>
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
      <div className="tsub" style={{ margin: "14px 2px 6px" }}>
        Priority · P1 dates can't move
      </div>
      <div className="chip-row" style={{ marginTop: 0 }}>
        {([1, 2, 3] as const).map((p) => (
          <button
            key={p}
            type="button"
            className={"chip " + (priority === p ? "on" : "")}
            onClick={() => setPriority(p)}
          >
            P{p}
          </button>
        ))}
      </div>
      <div className="tsub" style={{ margin: "8px 2px 6px" }}>
        Category · drives 50-30-20
      </div>
      <div className="cat-grid" style={{ marginBottom: 4 }}>
        {expenseCats(doc).map((c) => (
          <button
            key={c.id}
            type="button"
            className={"cat-chip " + (categoryId === c.id ? "sel" : "")}
            style={{ ["--c" as string]: c.color } as CSSProperties}
            onClick={() => setCategoryId(c.id)}
          >
            <span className="cemoji">{catEmoji(c)}</span>
            <span className="cname">{c.name}</span>
          </button>
        ))}
      </div>
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
  if (!g || g.deleted) return null;
  const c = goalProgress(doc, g);
  const stL = STATUS_LABEL[c.status];
  const stC = statusClass(c.status);
  const srcTotal = goalCurrent(g);
  const monthsLeft = c.saveMonths > 0 ? c.saveMonths : g.date ? "past due" : "no date";
  const dateTxt = g.date
    ? parseMk(g.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : "—";

  const del = () => {
    if (c.current > 0) {
      openSheet({ name: "goal-delete", id: g.id });
      return;
    }
    if (!armed) {
      setArmed(true);
      return;
    }
    mutate((d) => {
      const t = d.goals.find((x) => x.id === id);
      if (t) t.deleted = true;
    });
    closeSheet();
    toast("Goal deleted");
  };

  const togglePause = () => {
    if ((g.priority ?? 2) === 1) {
      toast("P1 goals can't be paused");
      return;
    }
    mutate((d) => {
      const t = d.goals.find((x) => x.id === id);
      if (t) t.paused = !t.paused;
    });
    toast(g.paused ? "Goal resumed" : "Goal paused");
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
      <div className="slab">
        <span className="s-label">
          Priority
          <div className="s-sub">
            {(g.priority ?? 2) === 1 ? "Fixed date — can't pause or extend" : "Flexible · can pause"}
          </div>
        </span>
        <span className="pill">P{g.priority ?? 2}</span>
      </div>
      <div className="slab">
        <span className="s-label">
          Category
          <div className="s-sub">Drives 50-30-20 for this goal's funding</div>
        </span>
        <span>{(() => {
          const cat = g.categoryId ? (doc.categories || []).find((x) => x.id === g.categoryId) : null;
          return cat ? `${cat.emoji || ""} ${cat.name}`.trim() : "Uncategorized · counts as Savings";
        })()}</span>
      </div>
      {(() => {
        const exp = goalExpected(doc, g);
        if (!exp.expectedKey) return null;
        const lbl = new Date(
          parseInt(exp.expectedKey.slice(0, 4), 10),
          parseInt(exp.expectedKey.slice(5, 7), 10) - 1,
          1
        ).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
        return (
          <div className="slab">
            <span className="s-label">
              Expected completion
              <div className="s-sub">At the current allocation rate</div>
            </span>
            <span>{lbl}</span>
          </div>
        );
      })()}
      {!g.completed && (g.priority ?? 2) !== 1 && (
        <button className="set" style={{ marginTop: 8 }} onClick={togglePause}>
          <span className="s-label">
            {g.paused ? "Resume goal" : "Pause goal"}
            <div className="s-sub">
              {g.paused ? "Rejoins the waterfall" : "Skipped by funding until resumed"}
            </div>
          </span>
          <span className={"switch " + (g.paused ? "" : "on")} />
        </button>
      )}
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
      {!g.completed && (
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button className="btn ghost" style={{ flex: 1 }} onClick={() => openSheet({ name: "goal-fund" })}>
            Fund
          </button>
          <button
            className="btn ghost"
            style={{ flex: 1 }}
            onClick={() => openSheet({ name: "goal-move", id: g.id })}
          >
            Move
          </button>
        </div>
      )}
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

function goalAccs(doc: Doc) {
  return (doc.accounts || []).filter((a) => a.kind === "goal");
}

function bankAccs(doc: Doc) {
  return (doc.accounts || []).filter((a) => a.kind !== "goal");
}

function gname(doc: Doc, id: string): string {
  return (doc.goals || []).find((g) => g.id === id)?.name || "Unknown goal";
}

/* Fund goals — waterfall a deposit across live goals. Writes one transfer
   per goal (bank → goal account, goalId set) so every leg shows up under
   the goal's category in 50-30-20. */
export function GoalFundSheet() {
  const { state, mutate, closeSheet, toast, openSheet } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  const banks = bankAccs(doc);
  const gaccs = goalAccs(doc);
  const [fromId, setFromId] = useState(banks[0] ? banks[0].id : "");
  const [toId, setToId] = useState(gaccs[0] ? gaccs[0].id : "");
  const [amount, setAmount] = useState("");
  const v = parseRupeesToPaise(amount || "");
  const wf = v > 0 ? allocateWaterfall(doc, v) : null;

  const confirm = () => {
    if (!fromId || !toId) {
      toast("Pick source and goal accounts");
      return;
    }
    if (!wf || !wf.allocs.length) {
      toast("Nothing to allocate — add an unpaused goal first");
      return;
    }
    const day = todayStr();
    const now = Date.now();
    mutate((d) => {
      for (const a of wf!.allocs) {
        const g = (d.goals || []).find((x) => x.id === a.goalId);
        if (!g) continue;
        const t: Txn = {
          id: uid(), date: day, dir: "trans", amount: a.amount,
          from: fromId, to: toId, goalId: a.goalId,
          note: g.name || "", createdAt: now,
        };
        d.transactions.push(t);
      }
    });
    closeSheet();
    toast(
      `Funded ${rupees(v, hide)} across ${wf.allocs.length} goal${wf.allocs.length === 1 ? "" : "s"}` +
        (wf.leftover > 0 ? ` · ${rupees(wf.leftover, hide)} left over` : "") +
        (wf.shortfalls.length ? ` · ${wf.shortfalls.length} short` : "")
    );
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Fund goals</div>
      {wf && wf.p1Required > 0 && (
        <div className={"tsub " + (wf.p1Covered ? "" : "warn")} style={{ margin: "0 2px 8px" }}>
          P1 needs {rupees(wf.p1Required, hide)}/mo — {wf.p1Covered ? "covered" : "SHORT"}
        </div>
      )}
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        From account
      </div>
      <select className="unit-select" value={fromId} onChange={(e) => setFromId(e.target.value)} aria-label="Source account">
        {banks.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        To goal account
      </div>
      {gaccs.length ? (
        <select className="unit-select" value={toId} onChange={(e) => setToId(e.target.value)} aria-label="Goal account">
          {gaccs.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {rupees(accBalance(doc, a.id), hide)}
            </option>
          ))}
        </select>
      ) : (
        <button className="btn ghost" onClick={() => openSheet({ name: "account-add" })}>
          {IC.plus} New goal account
        </button>
      )}
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Amount (₹)
      </div>
      <input
        inputMode="decimal"
        placeholder="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ marginTop: 0 }}
        aria-label="Funding amount"
      />
      {!!wf && wf.allocs.length > 0 && (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px" }}>
            Waterfall preview
          </div>
          {wf.allocs.map((a) => {
            const g = (doc.goals || []).find((x) => x.id === a.goalId);
            const short = wf.shortfalls.find((s) => s.goalId === a.goalId);
            return (
              <div key={a.goalId} className="slab">
                <span className="s-label">
                  {gname(doc, a.goalId)} <span className="pill">P{g ? g.priority ?? 2 : 2}</span>
                  {short ? <div className="s-sub gc-note warn">Short by {rupees(short.missing, hide)}</div> : null}
                </span>
                <b>{rupees(a.amount, hide)}</b>
              </div>
            );
          })}
          {wf.leftover > 0 && (
            <div className="tsub" style={{ margin: "4px 2px", color: "var(--muted)" }}>
              {rupees(wf.leftover, hide)} stays unallocated
            </div>
          )}
        </>
      )}
      <button className="btn" style={{ marginTop: 16 }} onClick={confirm}>
        {IC.check} Confirm funding
      </button>
    </>
  );
}

/* Move money between goals (or top up one goal from any account).
   One transfer; progress follows automatically via funding legs. */
export function GoalMoveSheet({ fromId, toId }: { fromId?: string; toId?: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  const live = liveGoals(doc);
  const gaccs = goalAccs(doc);
  const allAccs = doc.accounts || [];
  const [fGoal, setFGoal] = useState(fromId || "");
  const [tGoal, setTGoal] = useState(toId || live.find((g) => g.id !== fromId)?.id || "");
  const [fAcc, setFAcc] = useState(gaccs[0] ? gaccs[0].id : allAccs[0] ? allAccs[0].id : "");
  const [tAcc, setTAcc] = useState(gaccs[0] ? gaccs[0].id : allAccs[0] ? allAccs[0].id : "");
  const [amount, setAmount] = useState("");
  const v = parseRupeesToPaise(amount || "");

  const confirm = () => {
    if (!fGoal || !tGoal) {
      toast("Pick both goals");
      return;
    }
    if (fGoal === tGoal) {
      toast("Pick two different goals");
      return;
    }
    if (!fAcc || !tAcc) {
      toast("Pick both accounts");
      return;
    }
    if (!isFinite(v) || v <= 0) {
      toast("Enter an amount");
      return;
    }
    const sg = (doc.goals || []).find((x) => x.id === fGoal);
    const dg = (doc.goals || []).find((x) => x.id === tGoal);
    if (!sg || !dg) return;
    mutate((d) => {
      const t: Txn = {
        id: uid(), date: todayStr(), dir: "trans", amount: v,
        from: fAcc, to: tAcc, goalId: tGoal, fromGoalId: fGoal,
        note: `${sg.name} → ${dg.name}`, createdAt: Date.now(),
      };
      d.transactions.push(t);
    });
    closeSheet();
    toast(`Moved ${rupees(v, hide)} · ${sg.name} → ${dg.name}`);
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Move between goals</div>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        From goal
      </div>
      <select className="unit-select" value={fGoal} onChange={(e) => setFGoal(e.target.value)} aria-label="Source goal">
        <option value="">Pick a goal</option>
        {live.map((g) => (
          <option key={g.id} value={g.id}>
            P{g.priority ?? 2} · {g.name}
          </option>
        ))}
      </select>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        To goal
      </div>
      <select className="unit-select" value={tGoal} onChange={(e) => setTGoal(e.target.value)} aria-label="Destination goal">
        <option value="">Pick a goal</option>
        {live.map((g) => (
          <option key={g.id} value={g.id}>
            P{g.priority ?? 2} · {g.name}
          </option>
        ))}
      </select>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        From account
      </div>
      <select className="unit-select" value={fAcc} onChange={(e) => setFAcc(e.target.value)} aria-label="Source account">
        {allAccs.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {rupees(accBalance(doc, a.id), hide)}
          </option>
        ))}
      </select>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        To account
      </div>
      <select className="unit-select" value={tAcc} onChange={(e) => setTAcc(e.target.value)} aria-label="Destination account">
        {allAccs.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {rupees(accBalance(doc, a.id), hide)}
          </option>
        ))}
      </select>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Amount (₹)
      </div>
      <input
        inputMode="decimal"
        placeholder="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ marginTop: 0 }}
        aria-label="Move amount"
      />
      <button className="btn" style={{ marginTop: 16 }} onClick={confirm}>
        {IC.check} Confirm move
      </button>
    </>
  );
}

/* What-if simulator — recompute expected dates under a hypothetical
   monthly rate. Pure preview, writes nothing. */
export function GoalWhatIfSheet() {
  const { state } = useApp();
  const doc = state.doc!;
  const [rate, setRate] = useState("");
  const v = parseRupeesToPaise(rate || "");
  const live = liveGoals(doc).slice().sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2));
  const fmtKey = (k: string | null) =>
    k
      ? new Date(parseInt(k.slice(0, 4), 10), parseInt(k.slice(5, 7), 10) - 1, 1).toLocaleDateString("en-IN", {
          month: "short",
          year: "numeric",
        })
      : "—";
  return (
    <>
      <Grab />
      <div className="sh-title">What-if simulator</div>
      <div className="tsub" style={{ margin: "0 2px 8px", color: "var(--muted)" }}>
        If every goal received this much per month, when would each land?
      </div>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Monthly rate per goal (₹)
      </div>
      <input
        inputMode="decimal"
        placeholder="e.g. 5000"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        style={{ marginTop: 0 }}
        aria-label="Hypothetical monthly rate"
      />
      {v > 0 ? (
        live.map((g) => {
          const exp = goalExpected(doc, g, v);
          const tgt = g.date
            ? new Date(parseInt(g.date.slice(0, 4), 10), parseInt(g.date.slice(5, 7), 10) - 1, 1).toLocaleDateString(
                "en-IN",
                { month: "short", year: "numeric" }
              )
            : "No date";
          const ok = exp.expectedKey && g.date ? exp.expectedKey <= g.date : null;
          return (
            <div key={g.id} className="slab">
              <span className="s-label">
                {g.name} <span className="pill">P{g.priority ?? 2}</span>
                <div className="s-sub">Target {tgt}</div>
              </span>
              <span className={"pill " + (ok == null ? "" : ok ? "ok" : "warn")}>{fmtKey(exp.expectedKey)}</span>
            </div>
          );
        })
      ) : (
        <div className="tsub" style={{ margin: "0 2px 8px", color: "var(--muted)" }}>
          Enter a rate to preview dates.
        </div>
      )}
    </>
  );
}

/* Delete cascade — redistribute a funded goal's progress through the same
   waterfall as fresh money (capped at the source account balance), then
   tombstone the goal so history keeps resolving. */
export function GoalDeleteSheet({ id }: { id: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  const g = (doc.goals || []).find((x) => x.id === id);
  const gaccs = goalAccs(doc);
  const banks = bankAccs(doc);
  const [srcAcc, setSrcAcc] = useState(gaccs[0] ? gaccs[0].id : "");
  const [dstAcc, setDstAcc] = useState(gaccs[0] ? gaccs[0].id : "");
  const [bankId, setBankId] = useState(banks[0] ? banks[0].id : "");
  if (!g) return null;
  const total = goalProgress(doc, g).current;
  const cap = srcAcc ? Math.max(0, accBalance(doc, srcAcc)) : 0;
  const movable = Math.min(total, cap);
  const others = liveGoals(doc).filter((x) => x.id !== id);
  const wf = movable > 0 && others.length ? allocateWaterfall(doc, movable, id) : null;
  const stuck = total - movable;
  const floorBefore = p1Floor(doc);
  const floorAfter = Math.max(0, floorBefore - (goalProgress(doc, g).required || 0));

  const confirm = () => {
    const day = todayStr();
    const now = Date.now();
    mutate((d) => {
      if (wf) {
        for (const a of wf.allocs) {
          const dg = (d.goals || []).find((x) => x.id === a.goalId);
          if (!dg) continue;
          const t: Txn = {
            id: uid(), date: day, dir: "trans", amount: a.amount,
            from: srcAcc, to: dstAcc || srcAcc, goalId: a.goalId, fromGoalId: id,
            note: `← ${g.name}`, createdAt: now,
          };
          d.transactions.push(t);
        }
      }
      const t = d.goals.find((x) => x.id === id);
      if (t) t.deleted = true;
    });
    closeSheet();
    toast(
      wf && wf.allocs.length
        ? `Redistributed ${rupees(movable, hide)} across ${wf.allocs.length} goals`
        : "Goal deleted"
    );
  };

  const moveBack = () => {
    if (!bankId || total <= 0) {
      toast(total <= 0 ? "Nothing to move" : "Pick a bank account");
      return;
    }
    const movableBack = srcAcc ? Math.min(total, Math.max(0, accBalance(doc, srcAcc))) : 0;
    if (movableBack <= 0) {
      toast("Source account holds nothing to move");
      return;
    }
    mutate((d) => {
      const t: Txn = {
        id: uid(), date: todayStr(), dir: "trans", amount: movableBack,
        from: srcAcc, to: bankId, fromGoalId: id,
        note: `← ${g.name} (closed)`, createdAt: Date.now(),
      };
      d.transactions.push(t);
      const dg = d.goals.find((x) => x.id === id);
      if (dg) dg.deleted = true;
    });
    closeSheet();
    toast(`Moved ${rupees(movableBack, hide)} back to bank`);
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Delete {g.name}?</div>
      {(g.priority ?? 2) === 1 && (
        <div className="tsub warn" style={{ margin: "0 2px 8px" }}>
          P1 goal — floor drops from {rupees(floorBefore, hide)}/mo to {rupees(floorAfter, hide)}/mo.
        </div>
      )}
      <div className="tsub" style={{ margin: "0 2px 8px", color: "var(--muted)" }}>
        {rupees(total, hide)} allocated redistributes through the waterfall.
      </div>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        From goal account
      </div>
      <select className="unit-select" value={srcAcc} onChange={(e) => setSrcAcc(e.target.value)} aria-label="Source goal account">
        {gaccs.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {rupees(accBalance(doc, a.id), hide)}
          </option>
        ))}
      </select>
      {!!wf && wf.allocs.length > 0 && (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px" }}>
            To goal account
          </div>
          <select className="unit-select" value={dstAcc} onChange={(e) => setDstAcc(e.target.value)} aria-label="Destination goal account">
            {gaccs.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {rupees(accBalance(doc, a.id), hide)}
              </option>
            ))}
          </select>
          {wf.allocs.map((a) => (
            <div key={a.goalId} className="slab">
              <span className="s-label">{gname(doc, a.goalId)}</span>
              <b>{rupees(a.amount, hide)}</b>
            </div>
          ))}
          {wf.leftover > 0 && (
            <div className="tsub" style={{ margin: "4px 2px", color: "var(--muted)" }}>
              {rupees(wf.leftover, hide)} stays unallocated
            </div>
          )}
        </>
      )}
      {stuck > 0 && (
        <div className="tsub" style={{ margin: "4px 2px", color: "var(--muted)" }}>
          {rupees(stuck, hide)} has no txn backing — stays unallocated in the account.
        </div>
      )}
      {!others.length && (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px" }}>
            No goals left — move it back to bank instead
          </div>
          <select className="unit-select" value={bankId} onChange={(e) => setBankId(e.target.value)} aria-label="Bank account">
            {banks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={moveBack}>
            Move {rupees(Math.min(total, cap), hide)} to bank &amp; delete
          </button>
        </>
      )}
      <button className="btn" style={{ marginTop: 16 }} onClick={confirm}>
        {IC.check} {others.length ? "Redistribute & delete" : "Delete goal"}
      </button>
    </>
  );
}

export function GoalCompleteSheet({ id }: { id: string }) {  const { state, mutate, closeSheet, toast } = useApp();
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
        const preferred =
          g.categoryId && d.categories.some((x) => x.id === g.categoryId && x.kind === "expense")
            ? g.categoryId
            : null;
        const match = d.categories.find(
          (x) => x.kind === "expense" && g.name && g.name.toLowerCase() === x.name.toLowerCase()
        );
        if (preferred) catId = preferred;
        else if (match) catId = match.id;
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
