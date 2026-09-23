// Transaction detail sheet — port of App.txnSheet (transfer + expense variants).

import { useState } from "react";
import type { CSSProperties } from "react";
import { catById, accById, savSync, trNames } from "../data/finance";
import { catEmoji, parseD, rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import { Grab } from "./Sheet";

export function TxnSheet({ id }: { id: string }) {
  const { state, mutate, closeSheet, startEdit, toast } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  const [armed, setArmed] = useState(false);

  const t = doc.transactions.find((x) => x.id === id);
  if (!t) return null;

  const commitDelete = () => {
    mutate((d) => {
      const gone = d.transactions.find((x) => x.id === id);
      d.transactions = d.transactions.filter((x) => x.id !== id);
      if (gone) savSync(d, gone, null);
    });
    closeSheet();
    toast("Deleted");
  };

  if (t.dir === "trans") {
    const pd = parseD(t.date);
    return (
      <>
        <Grab />
        <div className="txn-row">
          <span className="ccircle lg" style={{ ["--c" as string]: "#31C4F3" } as CSSProperties}>
            ⇄
          </span>
          <span className="txn-meta">
            <span className="txn-name">Transfer</span>
            <span className="txn-sub">
              {trNames(doc, t)} · {pd.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
          </span>
          <span className="txn-amt">{rupees(t.amount, hide)}</span>
        </div>
        <button
          className="sh-row"
          onClick={() => (armed ? commitDelete() : setArmed(true))}
          style={{ color: "var(--neg)" }}
        >
          <span className="ccircle" style={{ ["--c" as string]: "rgba(192,91,77,.16)" } as CSSProperties}>
            {IC.trash}
          </span>
          <span className="rname">{armed ? "Tap again to delete" : "Delete"}</span>
          {IC.right}
        </button>
      </>
    );
  }

  const c = catById(doc, t.categoryId);
  const a = accById(doc, t.accountId);
  const pd = parseD(t.date);
  return (
    <>
      <Grab />
      <div className="txn-row">
        <span className="ccircle lg" style={{ ["--c" as string]: c.color } as CSSProperties}>
          {catEmoji(c)}
        </span>
        <span className="txn-meta">
          <span className="txn-name">{t.note || c.name}</span>
          <span className="txn-sub">
            {c.name} · {a ? a.name : ""} ·{" "}
            {pd.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        </span>
        <span className={"txn-amt " + (t.dir === "income" ? "inc" : "")}>{rupees(t.amount, hide)}</span>
      </div>
      <button
        className="sh-row"
        onClick={() => startEdit(t)}
      >
        <span className="ccircle" style={{ ["--c" as string]: "#2B3339" } as CSSProperties}>
          {IC.pen}
        </span>
        <span className="rname">Edit</span>
        {IC.right}
      </button>
      <button
        className="sh-row"
        onClick={() => (armed ? commitDelete() : setArmed(true))}
        style={{ color: "var(--neg)" }}
      >
        <span className="ccircle" style={{ ["--c" as string]: "rgba(192,91,77,.16)" } as CSSProperties}>
          {IC.trash}
        </span>
        <span className="rname">{armed ? "Tap again to delete" : "Delete"}</span>
        {IC.right}
      </button>
    </>
  );
}

