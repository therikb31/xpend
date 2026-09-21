// Summary — port of App.summary: category donut + breakdown cards.

import { DonutHero } from "../components/charts";
import { CatSumCard, Empty, TrendIcon } from "../components/ui";
import { PAL, accById, monthStats } from "../data/finance";
import { monthKey, parseMk, rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { ExpenseTxn } from "../types";
import type { CSSProperties } from "react";

export function SummaryPage() {
  const { state, openSheet, setFilter, go } = useApp();
  const doc = state.doc!;
  const mkey = state.mkey;
  const flt = state.flt;
  const hide = !!doc.settings.hideBalances;

  const mk = parseMk(mkey);
  const prev = new Date(mk);
  prev.setMonth(prev.getMonth() - 1);
  const prevKey = monthKey(prev);
  const prevSt = monthStats(doc, prevKey);
  const cur = new Date();
  const monthLabel =
    mk.getFullYear() === cur.getFullYear() && mk.getMonth() === cur.getMonth()
      ? "This month"
      : mk.toLocaleDateString("en-IN", { month: "long" });

  const txs = doc.transactions.filter(
    (t): t is ExpenseTxn =>
      t.dir === "expense" && t.date.slice(0, 7) === mkey && (flt.acc === "all" || t.accountId === flt.acc)
  );
  const catMap: Record<string, number> = {};
  for (const t of txs) catMap[t.categoryId] = (catMap[t.categoryId] || 0) + t.amount;
  const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, e) => s + e[1], 0);
  const pct = prevSt.spent > 0 ? Math.round(((prevSt.spent - total) / prevSt.spent) * 100) : null;
  const down = pct != null && pct >= 0;
  const prevName = parseMk(prevKey).toLocaleDateString("en-IN", { month: "short" });
  const colors: Record<string, string> = {};
  entries.forEach((e, i) => {
    colors[e[0]] = PAL[i % PAL.length];
  });

  const acc = flt.acc !== "all" ? accById(doc, flt.acc) : null;
  const accTxt = acc ? (acc.name.length > 11 ? acc.name.slice(0, 11) + "…" : acc.name) : "All accounts";
  const openCat = (id: string) => {
    setFilter({ cat: id });
    go("category", state.view);
  };

  return (
    <div className="scr sum">
      <div className="ov-top">
        <button className="ov-gear" onClick={() => go("settings", "overview")} aria-label="Settings">
          {IC.gear}
        </button>
        <button className="ov-gear" onClick={() => openSheet({ name: "export" })} aria-label="Export data">
          {IC.dots}
        </button>
      </div>
      <DonutHero
        entries={entries}
        colors={colors}
        total={rupees(total, hide)}
        monthLabel={monthLabel}
        onMonth={() => openSheet({ name: "month" })}
        trend={
          pct == null ? (
            <span className="dc-trend mute">
              {IC.downcir} No earlier data
            </span>
          ) : (
            <span className={"dc-trend" + (down ? "" : " up")}>
              <TrendIcon down={down} /> {Math.abs(pct)}% {down ? "from" : "up from"} {prevName}
            </span>
          )
        }
      />
      <div className="ov-chips">
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
      <div className="sum-list">
        {entries.length ? (
          entries.map(([cid, amt]) => (
            <CatSumCard
              key={cid}
              doc={doc}
              cid={cid}
              amt={amt}
              total={total}
              count={txs.filter((t) => t.categoryId === cid).length}
              color={colors[cid]}
              onOpen={openCat}
            />
          ))
        ) : (
          <div className="card">
            <Empty icon={IC.empty} title="No spending yet" sub="Tap + to add your first expense" />
          </div>
        )}
      </div>
    </div>
  );
}
