// Merchant drill-down — port of App.merchant (same shape as Category).

import { ApexBars, dailyValues } from "../components/charts";
import { Empty, MerchantLogoImg, OvCard, SwipeMk, TrendIcon } from "../components/ui";
import { accById, merchAccent, merchantSpend, sortedTxs } from "../data/finance";
import { dayLabel, monthKey, parseMk, rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { Txn } from "../types";
import type { CSSProperties, ReactNode } from "react";

export function MerchantPage() {
  const { state, openSheet, setFilter, go, back } = useApp();
  const doc = state.doc!;
  const mkey = state.mkey;
  const flt = state.flt;
  const hide = !!doc.settings.hideBalances;

  const mid = flt.merch === "__none" ? "__none" : flt.merch;
  const m = mid !== "__none" ? doc.merchants.find((x) => x.id === mid) : null;
  const mk = parseMk(mkey);
  const prev = new Date(mk);
  prev.setMonth(prev.getMonth() - 1);
  const prevKey = monthKey(prev);
  const mercKey = mid === "__none" ? "__none" : m ? m.id : "__none";
  const total = merchantSpend(doc, mkey)[mercKey] || 0;
  const prevTotal = merchantSpend(doc, prevKey)[mercKey] || 0;
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
    const d = Math.round(((prevTotal - total) / prevTotal) * 100);
    const du = d >= 0;
    delta = (
      <span className={"cat-delta" + (du ? "" : " neg")}>
        <TrendIcon down={du} /> {Math.abs(d)}% {du ? "from" : "up from"} {prevName}
      </span>
    );
  }

  let list = sortedTxs(doc).filter(
    (t) => t.dir === "expense" && t.date.slice(0, 7) === mkey && (t.merchantId || "__none") === mercKey
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
  const name = m ? m.name : "Unassigned";
  const openTxn = (id: string) => openSheet({ name: "txn", id });

  return (
    <div className="scr cat">
      <header className="scrhdr">
        <div className="hdr-left">
          <button className="cbtn small" onClick={back} aria-label="Back">
            {IC.left}
          </button>
        </div>
        <div className="hdr-left">
          <button className="cbtn small" onClick={() => openSheet({ name: "export" })} aria-label="Export data">
            {IC.dots}
          </button>
        </div>
      </header>
      <SwipeMk className="cat-metric" onTap={() => openSheet({ name: "month" })}>
        <span className="cat-title">
          {m ? <MerchantLogoImg m={m} /> : "🧾"} {name} {IC.chev}
        </span>
        <span className="cat-total">{rupees(total, hide)}</span>
        {delta}
      </SwipeMk>
      <div className="cat-chart" style={{ ["--c" as string]: merchAccent(doc, mkey, mercKey) } as CSSProperties}>
        <ApexBars daily={dailyValues(doc.transactions, mkey, null, mercKey)} mkey={mkey} hide={hide} />
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
      <div className="ov-groups">
        {groups.length ? (
          groups.map((g) => (
            <div key={g.date}>
              <div className="ov-dg">
                <span className="ov-dg-day">{dayLabel(g.date)}</span>
                <span className="ov-dg-amt">
                  {rupees(
                    g.items.reduce((s, t) => s + t.amount, 0),
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
          <Empty icon={IC.empty} title="No transactions" sub={`Nothing at ${name} for this month yet`} />
        )}
      </div>
    </div>
  );
}
