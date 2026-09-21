// Category drill-down — port of App.category.

import { BarChart, dailyValues } from "../components/charts";
import { Empty, SwipeMk, TrendIcon, TxnRow } from "../components/ui";
import { accById, catAccent, catById, catSpend, sortedTxs } from "../data/finance";
import { monthKey, parseD, parseMk, rupees, catEmoji } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { Txn } from "../types";
import type { CSSProperties, ReactNode } from "react";

export function CategoryPage() {
  const { state, openSheet, setFilter, go, back } = useApp();
  const doc = state.doc!;
  const mkey = state.mkey;
  const flt = state.flt;
  const hide = !!doc.settings.hideBalances;

  const c = catById(doc, flt.cat);
  const mk = parseMk(mkey);
  const prev = new Date(mk);
  prev.setMonth(prev.getMonth() - 1);
  const prevKey = monthKey(prev);
  const total = catSpend(doc, mkey)[flt.cat] || 0;
  const prevTotal = catSpend(doc, prevKey)[flt.cat] || 0;
  const prevName = parseMk(prevKey).toLocaleDateString("en-IN", { month: "short" });
  const monthName = mk.toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  let delta: ReactNode;
  if (total === 0) delta = <span className="cat-delta mute">No spending this month</span>;
  else if (prevTotal === 0)
    delta = (
      <span className="cat-delta mute">
        {IC.downcir} New this month
      </span>
    );
  else {
    const p = Math.round(((prevTotal - total) / prevTotal) * 100);
    const down = p >= 0;
    delta = (
      <span className={"cat-delta" + (down ? "" : " neg")}>
        <TrendIcon down={down} /> {Math.abs(p)}% {down ? "from" : "up from"} {prevName}
      </span>
    );
  }

  let list = sortedTxs(doc).filter(
    (t) => t.dir === "expense" && t.date.slice(0, 7) === mkey && t.categoryId === flt.cat
  );
  if (flt.acc !== "all") list = list.filter((t) => t.dir !== "trans" && t.accountId === flt.acc);
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
    <div className="scr cat">
      <div className="cat-top">
        <button className="cbtn" onClick={back} aria-label="Back">
          {IC.left}
        </button>
        <SwipeMk className="cat-metric" onTap={() => openSheet({ name: "month" })}>
          <span className="cat-title">
            {catEmoji(c)} {c.name} {IC.chev}
          </span>
          <span className="cat-total">{rupees(total, hide)}</span>
          {delta}
        </SwipeMk>
        <button className="cbtn" onClick={() => openSheet({ name: "export" })} aria-label="Export data">
          {IC.dots}
        </button>
      </div>
      <div className="cat-chart" style={{ ["--c" as string]: catAccent(doc, mkey, flt.cat) } as CSSProperties}>
        <BarChart daily={dailyValues(doc.transactions, mkey, flt.cat)} mkey={mkey} markMax hide={hide} />
      </div>
      <div className="ov-chips">
        <button className="ov-chip circ" onClick={() => go("activity", state.view)} aria-label="Search">
          {IC.search}
        </button>
        <button className="ov-chip" onClick={() => openSheet({ name: "month" })}>
          {monthName}
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
      <div className="cat-list">
        {groups.length ? (
          groups.map((g) => {
            const pd = parseD(g.date);
            const dayTotal = g.items.reduce((s, t) => s + t.amount, 0);
            return (
              <div key={g.date}>
                <div className="dg-head">
                  <span className="dg-day">
                    {pd.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span className="dg-total">{rupees(dayTotal, hide)}</span>
                </div>
                {g.items.map((t) => (
                  <TxnRow key={t.id} doc={doc} t={t} onOpen={openTxn} />
                ))}
              </div>
            );
          })
        ) : (
          <Empty icon={IC.empty} title="No transactions" sub={`Nothing in ${c.name} for this month yet`} />
        )}
      </div>
    </div>
  );
}
