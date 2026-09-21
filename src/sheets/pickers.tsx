// Picker sheets — ports of mkeySheet / dpSheet / catSheet / accSheet /
// merchSheet / accFilterSheet / trAccSheet. (Transfer account picking is a
// step inside TransferSheet; TransferAccSheet is kept for completeness.)

import { useState } from "react";
import type { CSSProperties } from "react";
import { AccountAvatar, MerchantAvatar } from "../components/ui";
import { accBalance, merchantCount } from "../data/finance";
import { monthKey, pad, parseD, parseMk, rupees, todayStr } from "../lib/format";
import { catEmoji } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import { Grab } from "./Sheet";

/* ---------------- month picker (mk-open) ---------------- */

export function MonthSheet() {
  const { state, setMkey, closeSheet } = useApp();
  const mk = parseMk(state.mkey);
  const atCur = state.mkey === monthKey(new Date());
  const budgetV = state.view === "budget";
  const months: string[] = [];
  const d = new Date(mk.getFullYear(), mk.getMonth() - 5, 1);
  for (let i = 0; i < (budgetV ? 11 : 6); i++) {
    months.push(monthKey(d));
    d.setMonth(d.getMonth() + 1);
  }
  const prev = () => {
    const x = parseMk(state.mkey);
    x.setMonth(x.getMonth() - 1);
    setMkey(monthKey(x));
  };
  const next = () => {
    const x = parseMk(state.mkey);
    x.setMonth(x.getMonth() + 1);
    const k = monthKey(x);
    if (k > monthKey(new Date()) && state.view !== "budget") return;
    setMkey(k);
  };
  return (
    <>
      <Grab />
      <div className="dp-head">
        <button className="cbtn small" onClick={prev} aria-label="Previous month">
          {IC.left}
        </button>
        <div className="dp-title">{mk.toLocaleDateString("en-IN", { year: "numeric" })}</div>
        {budgetV || !atCur ? (
          <button className="cbtn small" onClick={next} aria-label="Next month">
            {IC.right}
          </button>
        ) : (
          <span className="cbtn small" style={{ opacity: 0.3 }} aria-hidden="true">
            {IC.right}
          </span>
        )}
      </div>
      <div className="mk-grid">
        {months.map((k) => {
          const pd = parseMk(k);
          return (
            <button
              key={k}
              className={"mk-cell " + (k === state.mkey ? "on" : "")}
              onClick={() => {
                setMkey(k);
                closeSheet();
              }}
            >
              <span className="mk-n">{pd.toLocaleDateString("en-IN", { month: "short" })}</span>
              <span className="mk-y">{pd.getFullYear()}</span>
            </button>
          );
        })}
      </div>
      <button
        className="btn ghost"
        style={{ marginTop: 14 }}
        onClick={() => {
          setMkey(monthKey(new Date()));
          closeSheet();
        }}
      >
        This month
      </button>
    </>
  );
}

/* ---------------- date picker (dp-open, Monday-first) ---------------- */

export function DateSheet() {
  const { state, setAdd, closeSheet } = useApp();
  const initD = parseD(state.add.date);
  const [cur, setCur] = useState({ y: initD.getFullYear(), m: initD.getMonth() });
  const d = new Date(cur.y, cur.m, 1);
  const title = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const first = (d.getDay() + 6) % 7;
  const dim = new Date(cur.y, cur.m + 1, 0).getDate();
  const today = todayStr();
  const sel = state.add.date;
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < first; i++) cells.push(<i key={"b" + i}></i>);
  for (let day = 1; day <= dim; day++) {
    const key = cur.y + "-" + pad(cur.m + 1) + "-" + pad(day);
    const cls = "cal-day" + (key === sel ? " sel" : "") + (key === today ? " today" : "");
    cells.push(
      <button
        key={key}
        type="button"
        className={cls}
        onClick={() => {
          setAdd({ date: key });
          closeSheet();
        }}
      >
        {day}
      </button>
    );
  }
  const step = (dm: number) =>
    setCur((c) => {
      let m = c.m + dm;
      let y = c.y;
      if (m < 0) {
        m = 11;
        y--;
      }
      if (m > 11) {
        m = 0;
        y++;
      }
      return { y, m };
    });
  return (
    <>
      <Grab />
      <div className="dp-head">
        <div className="dp-title">{title}</div>
        <button
          className="cbtn small"
          title="Today"
          onClick={() => {
            const n = new Date();
            setCur({ y: n.getFullYear(), m: n.getMonth() });
          }}
        >
          {IC.right}
        </button>
        <button className="cbtn small" title="Previous month" onClick={() => step(-1)}>
          {IC.left}
        </button>
        <button className="cbtn small" title="Next month" onClick={() => step(1)}>
          {IC.right}
        </button>
      </div>
      <div className="cal-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
          <span key={w} className="wd">
            {w}
          </span>
        ))}
        {cells}
      </div>
    </>
  );
}

/* ---------------- category picker (cat-open) ---------------- */

export function CategorySheet() {
  const { state, setAdd, closeSheet } = useApp();
  const doc = state.doc!;
  const groups = ["expense", "income"]
    .map((kind) => doc.categories.filter((c) => c.kind === kind))
    .filter((g) => g.length);
  return (
    <>
      <Grab />
      <div className="sh-title">Category</div>
      {groups.map((g, gi) => (
        <div key={gi} className="cat-grid" style={{ marginBottom: 16 }}>
          {g.map((c) => (
            <button
              key={c.id}
              className={"cat-chip " + (state.add.categoryId === c.id ? "sel" : "")}
              style={{ ["--c" as string]: c.color } as CSSProperties}
              onClick={() => {
                setAdd({ categoryId: c.id });
                closeSheet();
              }}
            >
              <span className="cemoji">{catEmoji(c)}</span>
              <span className="cname">{c.name}</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

/* ---------------- account picker for the add screen ---------------- */

export function AccountSheet() {
  const { state, setAdd, closeSheet, openSheet } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  return (
    <>
      <Grab />
      <div className="sh-title">Account</div>
      {doc.accounts.map((a) => (
        <button
          key={a.id}
          className={"sh-row " + (state.add.accountId === a.id ? "sel" : "")}
          onClick={() => {
            setAdd({ accountId: a.id });
            closeSheet();
          }}
        >
          <AccountAvatar a={a} />
          <span className="rname">{a.name}</span>
          <span className="rbal">{rupees(accBalance(doc, a.id), hide)}</span>
          {IC.right}
        </button>
      ))}
      <button className="btn ghost" style={{ marginTop: 14 }} onClick={() => openSheet({ name: "account-add" })}>
        {IC.plus} New account
      </button>
    </>
  );
}

/* ---------------- merchant picker for the add screen ---------------- */

export function MerchantSheet() {
  const { state, setAdd, closeSheet, openSheet } = useApp();
  const doc = state.doc!;
  const cnt = merchantCount(doc);
  const mts = (doc.merchants || [])
    .slice()
    .sort((a, b) => (cnt[b.id] || 0) - (cnt[a.id] || 0));
  return (
    <>
      <Grab />
      <div className="sh-title">Merchant</div>
      <button
        className={"sh-row " + (state.add.merchantId ? "" : "sel")}
        onClick={() => {
          setAdd({ merchantId: "" });
          closeSheet();
        }}
      >
        <span className="ccircle" style={{ ["--c" as string]: "#2B3339" } as CSSProperties}>
          {IC.x}
        </span>
        <span className="rname">None</span>
        {state.add.merchantId ? null : IC.check}
      </button>
      {mts.map((m) => (
        <button
          key={m.id}
          className={"sh-row " + (state.add.merchantId === m.id ? "sel" : "")}
          onClick={() => {
            setAdd({ merchantId: m.id });
            closeSheet();
          }}
        >
          <MerchantAvatar m={m} />
          <span className="rname">{m.name}</span>
          {state.add.merchantId === m.id ? IC.check : IC.right}
        </button>
      ))}
      <button
        className="btn ghost"
        style={{ marginTop: 14 }}
        onClick={() => openSheet({ name: "merchant-edit" })}
      >
        {IC.plus} New merchant
      </button>
    </>
  );
}

/* ---------------- account filter (acc-fopen) ---------------- */

export function AccountFilterSheet() {
  const { state, setFilter, closeSheet } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  return (
    <>
      <Grab />
      <div className="sh-title">Account</div>
      <button
        className={"sh-row " + (state.flt.acc === "all" ? "sel" : "")}
        onClick={() => {
          setFilter({ acc: "all" });
          closeSheet();
        }}
      >
        <span className="ccircle" style={{ ["--c" as string]: "#F5F5F5" } as CSSProperties}>
          A
        </span>
        <span className="rname">All accounts</span>
        {state.flt.acc === "all" ? IC.check : IC.right}
      </button>
      {doc.accounts.map((a) => (
        <button
          key={a.id}
          className={"sh-row " + (state.flt.acc === a.id ? "sel" : "")}
          onClick={() => {
            setFilter({ acc: a.id });
            closeSheet();
          }}
        >
          <AccountAvatar a={a} />
          <span className="rname">{a.name}</span>
          <span className="rbal">{rupees(accBalance(doc, a.id), hide)}</span>
          {state.flt.acc === a.id ? IC.check : IC.right}
        </button>
      ))}
    </>
  );
}
