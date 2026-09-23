// Overview dashboard — port of App.overview (the default view; the Activity
// tab renders this). Month hero + bar chart + filter chips + day groups.

import { ApexBars, dailyValues } from "../components/charts";
import { Empty, OvCard, SwipeMk, TrendIcon } from "../components/ui";
import {
  accById,
  monthStats,
  sortedTxs,
} from "../data/finance";
import { APP_VER, dayLabel, dstr, monthKey, parseMk, rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { Txn } from "../types";
import type { CSSProperties } from "react";

export function OverviewPage() {
  const { state, openSheet, setFilter, go } = useApp();
  const doc = state.doc!;
  const mkey = state.mkey;
  const flt = state.flt;
  const hide = !!doc.settings.hideBalances;

  const st = monthStats(doc, mkey);
  const mk = parseMk(mkey);
  const prev = new Date(mk);
  prev.setMonth(prev.getMonth() - 1);
  const prevKey = monthKey(prev);
  const prevSt = monthStats(doc, prevKey);
  const pct = prevSt.spent > 0 ? Math.round(((prevSt.spent - st.spent) / prevSt.spent) * 100) : null;
  const down = pct != null && pct >= 0;
  const monthName = mk.toLocaleDateString("en-IN", { month: "long" });
  const prevName = parseMk(prevKey).toLocaleDateString("en-IN", { month: "short" });

  let list = sortedTxs(doc);
  if (flt.dir !== "all") list = list.filter((t) => t.dir === flt.dir);
  if (flt.acc !== "all")
    list = list.filter((t) =>
      t.dir === "trans" ? t.from === flt.acc || t.to === flt.acc : t.accountId === flt.acc
    );

  const groups: Array<{ date: string; items: Txn[] }> = [];
  for (const t of list) {
    const g = groups[groups.length - 1];
    if (!g || g.date !== t.date) groups.push({ date: t.date, items: [t] });
    else g.items.push(t);
  }

  const acc = flt.acc !== "all" ? accById(doc, flt.acc) : null;
  const accTxt = acc ? (acc.name.length > 11 ? acc.name.slice(0, 11) + "…" : acc.name) : "All accounts";
  const openTxn = (id: string) => openSheet({ name: "txn", id });

  return (
    <div className="scr ov">
      <div className="ov-top">
        <button className="ov-gear" onClick={() => go("settings", "overview")} aria-label="Settings">
          {IC.gear}
        </button>
        <span className="app-ver-top">Xpend v0.{APP_VER}</span>
        <button className="ov-gear" onClick={() => openSheet({ name: "export" })} aria-label="Export data">
          {IC.dots}
        </button>
      </div>
      <SwipeMk className="ov-sum" onTap={() => openSheet({ name: "month" })}>
        <span className="ov-mon">
          {monthName} {IC.chev}
        </span>
        <span className="ov-total">{rupees(st.spent, hide)}</span>
        {pct == null ? (
          <span className="ov-delta" style={{ color: "var(--muted)" }}>
            {IC.downcir} No earlier data
          </span>
        ) : (
          <span className="ov-delta" style={down ? undefined : { color: "var(--neg)" }}>
            <TrendIcon down={down} /> {Math.abs(pct)}% {down ? "from" : "up from"} {prevName}
          </span>
        )}
      </SwipeMk>
      <ApexBars
        daily={dailyValues(doc.transactions, mkey)}
        mkey={mkey}
        hide={hide}
        onDaySelect={(i) => {
          const d = new Date(mk.getFullYear(), mk.getMonth(), i + 1);
          openSheet({ name: "day-txns", id: dstr(d) });
        }}
      />
      <div className="ov-chips">
        <button className="ov-chip circ" onClick={() => go("activity", state.view)} aria-label="Search">
          {IC.search}
        </button>
        <button
          className={"ov-chip " + (flt.dir === "expense" ? "on" : "")}
          onClick={() => setFilter({ dir: flt.dir === "expense" ? "all" : "expense" })}
        >
          Expenses
        </button>
        <button className="ov-chip" onClick={() => openSheet({ name: "month" })}>
          Monthly
        </button>
        <button
          className={"ov-chip " + (acc ? "on" : "")}
          onClick={() => openSheet({ name: "account-filter" })}
        >
          {acc && <span className="dot" style={{ ["--c" as string]: acc.color } as CSSProperties} />}
          {accTxt}
        </button>
        <button
          className="ov-chip"
          onClick={() => setFilter({ dir: "all", acc: "all", merch: "all" })}
        >
          All
        </button>
      </div>
      <div className="ov-groups">
        {groups.length ? (
          groups.map((g, i) => (
            <div key={g.date}>
              {(i === 0 || groups[i - 1].date.slice(0, 7) !== g.date.slice(0, 7)) && (
                <div className="ov-mh">
                  {parseMk(g.date.slice(0, 7)).toLocaleDateString("en-IN", {
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              )}
              <div className="ov-dg">
                <span className="ov-dg-day">{dayLabel(g.date)}</span>
                <span className="ov-dg-amt">
                  {rupees(
                    g.items.reduce((s, t) => s + (t.dir === "expense" ? t.amount : 0), 0),
                    hide
                  )}
                </span>
              </div>
              <div className="ov-day">
                {g.items.map((t) => (
                  <OvCard key={t.id} doc={doc} t={t} onOpen={openTxn} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="card" style={{ borderRadius: 24 }}>
            <Empty icon={IC.empty} title="No transactions yet" sub="Tap + below to add your first expense" />
          </div>
        )}
      </div>
    </div>
  );
}
