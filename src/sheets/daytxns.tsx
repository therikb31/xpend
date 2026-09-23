// Day transactions sheet — opened by tapping a bar-chart day. Shows that
// day's expenses scoped like the originating page (overview: all; category:
// +category; merchant: +merchant; account filter respected everywhere).
// Scrolls internally (sheet max-height), scrim/Escape/swipe dismiss.

import { Empty, TxnRow } from "../components/ui";
import { catName, sortedTxs } from "../data/finance";
import { dayLabel, rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { ExpenseTxn, Txn } from "../types";
import { Grab } from "./Sheet";

function scopeOf(view: string, flt: { cat: string; merch: string; acc: string }, t: ExpenseTxn): boolean {
  if (t.dir !== "expense") return false;
  if (view === "category" && t.categoryId !== flt.cat) return false;
  if (view === "merchant" && (t.merchantId || "__none") !== flt.merch) return false;
  if (flt.acc !== "all" && t.accountId !== flt.acc) return false;
  return true;
}

export function DayTxnsSheet({ date }: { date: string }) {
  const { state, openSheet } = useApp();
  const doc = state.doc!;
  const flt = state.flt;
  const hide = !!doc.settings.hideBalances;
  const view = state.view;

  const list = sortedTxs(doc).filter(
    (t: Txn): t is ExpenseTxn => t.date === date && t.dir !== "trans" && scopeOf(view, flt, t)
  );
  const total = list.reduce((s, t) => s + t.amount, 0);
  const openTxn = (id: string) => openSheet({ name: "txn", id });

  return (
    <>
      <Grab />
      <div className="sh-title">{dayLabel(date)}</div>
      <div className="tsub" style={{ margin: "0 2px 10px", color: "var(--muted)" }}>
        {list.length ? (
          <>
            {list.length} expense{list.length === 1 ? "" : "s"} · <b>{rupees(total, hide)}</b>
            {view === "category" && catName(doc, flt.cat) ? " · " + catName(doc, flt.cat) : ""}
          </>
        ) : (
          "No spending this day"
        )}
      </div>
      {list.length ? (
        list.map((t) => <TxnRow key={t.id} doc={doc} t={t} onOpen={openTxn} />)
      ) : (
        <Empty icon={IC.empty} title="Nothing here" sub="No expenses match this day" />
      )}
    </>
  );
}
