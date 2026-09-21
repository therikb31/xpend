// Activity list — port of App.activity: search + filter chips + day groups.

import { Empty, TxnRow } from "../components/ui";
import { catName, trNames, sortedTxs } from "../data/finance";
import { parseD, rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { Txn } from "../types";
import type { CSSProperties } from "react";

export function ActivityPage() {
  const { state, openSheet, setFilter, go, back } = useApp();
  const doc = state.doc!;
  const flt = state.flt;
  const hide = !!doc.settings.hideBalances;

  let list = sortedTxs(doc);
  if (flt.dir !== "all") list = list.filter((t) => t.dir === flt.dir);
  if (flt.cat !== "all") list = list.filter((t) => t.dir !== "trans" && t.categoryId === flt.cat);
  if (flt.merch !== "all")
    list = list.filter((t) => t.dir !== "trans" && (t.merchantId || "__none") === flt.merch);
  if (flt.acc !== "all")
    list = list.filter((t) =>
      t.dir === "trans" ? t.from === flt.acc || t.to === flt.acc : t.accountId === flt.acc
    );
  if (flt.q)
    list = list.filter((t) => {
      const hay =
        (t.note || "") +
        " " +
        (t.dir === "trans" ? trNames(doc, t) : catName(doc, t.categoryId) || "") +
        " " +
        t.date;
      return hay.toLowerCase().includes(flt.q.toLowerCase());
    });

  const groups: Array<{ date: string; items: Txn[] }> = [];
  for (const t of list) {
    const g = groups[groups.length - 1];
    if (!g || g.date !== t.date) groups.push({ date: t.date, items: [t] });
    else g.items.push(t);
  }

  const cats = doc.categories;
  const openTxn = (id: string) => openSheet({ name: "txn", id });

  return (
    <div className="scr">
      <header className="scrhdr">
        <div className="hdr-left">
          <button className="cbtn small" onClick={back} aria-label="Back">
            {IC.left}
          </button>
          <div className="hdr-title">Activity</div>
        </div>
        <div className="hdr-left">
          <button className="cbtn small" onClick={() => openSheet({ name: "export" })} aria-label="Export data">
            {IC.dots}
          </button>
          <button className="cbtn small" onClick={() => go("settings", "overview")} aria-label="Settings">
            {IC.gear}
          </button>
        </div>
      </header>

      <div className="search">
        {IC.search}
        <input
          type="text"
          placeholder="Search transactions"
          value={flt.q}
          onChange={(e) => setFilter({ q: e.target.value })}
        />
      </div>

      <div className="chip-row">
        <button className={"chip " + (flt.dir === "all" ? "on" : "")} onClick={() => setFilter({ dir: "all" })}>
          All
        </button>
        <button
          className={"chip " + (flt.dir === "expense" ? "on" : "")}
          onClick={() => setFilter({ dir: "expense" })}
        >
          Expense
        </button>
        <button
          className={"chip " + (flt.dir === "income" ? "on" : "")}
          onClick={() => setFilter({ dir: "income" })}
        >
          Income
        </button>
        {cats
          .filter((c) => c.kind === "expense")
          .map((c) => (
            <button
              key={c.id}
              className={"chip " + (flt.cat === c.id ? "on" : "")}
              onClick={() => setFilter({ cat: c.id })}
            >
              <span className="dot" style={{ ["--c" as string]: c.color } as CSSProperties} />
              {c.name}
            </button>
          ))}
      </div>

      {groups.length ? (
        groups.map((g) => {
          const dayTotal = g.items.reduce(
            (s, t) => s + (t.dir === "income" ? t.amount : t.dir === "trans" ? 0 : -t.amount),
            0
          );
          const pd = parseD(g.date);
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
        <Empty icon={IC.empty} title="No transactions" sub="Nothing matches your filters yet" />
      )}
    </div>
  );
}
