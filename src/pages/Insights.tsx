// Insights — merged Summary + Analytics: one tab with a Category/Merchant
// grouping slider. Shell (DonutHero + chips + sum cards) is shared; only the
// aggregation key and card component switch with `grp`.

import { useState } from "react";
import { DonutHero } from "../components/charts";
import type { DonutDetail } from "../components/charts";
import { CatSumCard, Empty, MerchSumCard, MerchantLogoImg, TrendIcon } from "../components/ui";
import { PAL, accById, catById, merchById, monthStats } from "../data/finance";
import { catEmoji, monthKey, parseMk, rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { ExpenseTxn } from "../types";
import type { CSSProperties } from "react";

export function InsightsPage() {
  const { state, openSheet, setFilter, go } = useApp();
  const doc = state.doc!;
  const mkey = state.mkey;
  const flt = state.flt;
  const hide = !!doc.settings.hideBalances;
  const [grp, setGrp] = useState<"cat" | "merch">("cat");

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
  const agg: Record<string, number> = {};
  for (const t of txs) {
    const k = grp === "cat" ? t.categoryId : t.merchantId || "__none";
    agg[k] = (agg[k] || 0) + t.amount;
  }
  const entries = Object.entries(agg).sort((a, b) => b[1] - a[1]);
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
  const details: Record<string, DonutDetail> = {};
  for (const [id, amt] of entries) {
    const p = total > 0 ? ((amt / total) * 100).toFixed(1) : "0.0";
    if (grp === "cat") {
      const c = catById(doc, id);
      details[id] = {
        title: (
          <>
            <span>{catEmoji(c)}</span> {c ? c.name : "Unknown"}
          </>
        ),
        amount: rupees(amt, hide),
        sub: <span className="dc-trend">{p}% of total</span>,
      };
    } else {
      const m = id === "__none" ? null : merchById(doc, id);
      details[id] = {
        title: (
          <>
            <span className="dc-sel-logo">{m ? <MerchantLogoImg m={m} /> : "🧾"}</span> {m ? m.name : "Unassigned"}
          </>
        ),
        amount: rupees(amt, hide),
        sub: <span className="dc-trend">{p}% of total</span>,
      };
    }
  }
  const openEntry = (id: string) => {
    if (grp === "cat") setFilter({ cat: id });
    else setFilter({ merch: id });
    go(grp === "cat" ? "category" : "merchant", state.view);
  };
  const countFor = (id: string) =>
    grp === "cat"
      ? txs.filter((t) => t.categoryId === id).length
      : txs.filter((t) => (t.merchantId || "__none") === id).length;

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
      <div className="chip-row center" style={{ marginTop: 0 }} role="tablist" aria-label="Group spending by">
        <button
          type="button"
          role="tab"
          aria-selected={grp === "cat"}
          className={"chip " + (grp === "cat" ? "on" : "")}
          onClick={() => setGrp("cat")}
        >
          Category
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={grp === "merch"}
          className={"chip " + (grp === "merch" ? "on" : "")}
          onClick={() => setGrp("merch")}
        >
          Merchant
        </button>
      </div>
      <DonutHero
        entries={entries}
        colors={colors}
        total={rupees(total, hide)}
        monthLabel={monthLabel}
        onMonth={() => openSheet({ name: "month" })}
        details={details}
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
          entries.map(([id, amt]) =>
            grp === "cat" ? (
              <CatSumCard
                key={id}
                doc={doc}
                cid={id}
                amt={amt}
                total={total}
                count={countFor(id)}
                color={colors[id]}
                onOpen={openEntry}
              />
            ) : (
              <MerchSumCard
                key={id}
                doc={doc}
                mid={id}
                amt={amt}
                total={total}
                count={countFor(id)}
                color={colors[id]}
                onOpen={openEntry}
              />
            )
          )
        ) : (
          <div className="card">
            <Empty
              icon={IC.empty}
              title="No spending yet"
              sub={
                grp === "cat"
                  ? "Tap + to add your first expense"
                  : "Tag a merchant when adding an expense"
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
