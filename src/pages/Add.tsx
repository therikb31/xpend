// Add-expense screen — port of App.addScreen + key/note handlers.
// Full-screen overlay modal; the shell hides BottomNav while view === "add".

import { useMemo } from "react";
import type { ReactNode } from "react";
import { accById, catById, merchById, sortedTxs } from "../data/finance";
import { catEmoji, dayLabel } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";

function highlight(s: string, q: string): ReactNode {
  const i = s.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || !q) return s;
  return (
    <>
      {s.slice(0, i)}
      <b>{s.slice(i, i + q.length)}</b>
      {s.slice(i + q.length)}
    </>
  );
}

export function AddPage() {
  const { state, openSheet, closeAdd, keyInput, saveAdd, setAdd, toast } = useApp();
  const doc = state.doc!;
  const a = state.add;

  const c = catById(doc, a.categoryId);
  const ac = accById(doc, a.accountId);
  const m = a.merchantId ? merchById(doc, a.merchantId) : undefined;
  const amtStr = a.amount || "0";
  const last = sortedTxs(doc)[0];

  const repeatLastFill = () => {
    const t = sortedTxs(doc)[0];
    if (!t) {
      toast("No previous transaction");
      return;
    }
    if (t.dir === "trans") {
      toast("Last was a transfer");
      return;
    }
    setAdd({
      amount: String(t.amount / 100).replace(/\.0+$/, ""),
      dir: t.dir,
      categoryId: t.categoryId,
      accountId: t.accountId,
      merchantId: t.merchantId || "",
    });
    toast("Repeated last " + (t.name || catById(doc, t.categoryId).name));
  };

  // Note autocomplete: last-used notes matching the current input (max 4).
  const picks = useMemo(() => {
    const v = (a.note || "").trim();
    if (!v) return [];
    const used: string[] = [];
    const seen = new Set<string>();
    for (let i = doc.transactions.length - 1; i >= 0; i--) {
      const t = doc.transactions[i];
      const n = (t.note || t.name || "").trim();
      if (!n || seen.has(n.toLowerCase())) continue;
      seen.add(n.toLowerCase());
      used.push(n);
    }
    const q = v.toLowerCase();
    return used
      .filter((n) => {
        const nl = n.toLowerCase();
        return nl.startsWith(q) || nl.includes(q);
      })
      .sort((x, y) => x.toLowerCase().indexOf(q) - y.toLowerCase().indexOf(q))
      .slice(0, 4);
  }, [a.note, doc.transactions]);

  return (
    <div className="scr pad-nav" style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <header className="add-top">
        <div className="add-top-col">
          <button
            className={"cbtn starbtn " + (last ? "" : "disabled")}
            onClick={repeatLastFill}
            aria-label="Repeat last"
          >
            {IC.refresh}
            <span className="star-badge">{IC.star}</span>
          </button>
          <button className="cbtn" onClick={() => openSheet({ name: "shortcuts" })} aria-label="Shortcuts">
            {IC.star}
          </button>
        </div>
        <div className="seg">
          <button
            className={a.dir === "expense" ? "on" : ""}
            onClick={() => setAdd({ dir: "expense" })}
          >
            Expense
          </button>
          <button className={a.dir === "income" ? "on" : ""} onClick={() => setAdd({ dir: "income" })}>
            Income
          </button>
        </div>
        <div className="add-top-col">
          <button className="cbtn" onClick={() => openSheet({ name: "more" })} aria-label="More">
            {IC.dots}
          </button>
          <button className="cbtn" onClick={closeAdd} aria-label="Close">
            {IC.x}
          </button>
        </div>
      </header>

      <div className="add-amount">
        <span className="cur">₹</span>
        <span className={"num " + (amtStr.length > 6 ? "small" : "")}>{amtStr}</span>
        <button className="close-cap" onClick={() => keyInput("del")} aria-label="Delete">
          {IC.del}
        </button>
      </div>

      <div className="add-fields">
        <button className="field" onClick={() => openSheet({ name: "category" })}>
          <span className="ficon">{catEmoji(c)}</span>
          <span className="f-name">{c.name}</span>
          <span className="f-val">Category</span>
          {IC.right}
        </button>
        <button className="field" onClick={() => openSheet({ name: "account" })}>
          <span className="ficon">💵</span>
          <span className="f-name">{ac.name}</span>
          <span className="f-val">Account</span>
          {IC.right}
        </button>
        <button className="field" onClick={() => openSheet({ name: "merchant" })}>
          <span className="ficon">🏷️</span>
          <span className={"f-name " + (m ? "" : "mute")}>{m ? m.name : "None"}</span>
          <span className="f-val">Merchant</span>
          {IC.right}
        </button>
        <button className="field" onClick={() => openSheet({ name: "date" })}>
          <span className="ficon">🗓️</span>
          <span className="f-name">{dayLabel(a.date)}</span>
          <span className="f-val">Date</span>
          {IC.right}
        </button>
        <label className="field note-field">
          <span className="ficon">{IC.note}</span>
          <input
            id="note-inline"
            className="note-inline"
            maxLength={120}
            placeholder="Add a note"
            value={a.note}
            onChange={(e) => setAdd({ note: e.target.value })}
          />
        </label>
      </div>
      {picks.length > 0 && (
        <div id="note-sug" className="note-sug show">
          {picks.map((n) => (
            <button key={n} className="note-sug-item" onClick={() => setAdd({ note: n })}>
              {highlight(n, a.note.trim())}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }}></div>
      <div className="keypad">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0"].map((k) => (
          <button key={k} className="kbtn" onClick={() => keyInput(k)}>
            {k}
          </button>
        ))}
        <button className="kbtn tick" onClick={saveAdd} aria-label={"Add " + a.dir}>
          {IC.check}
        </button>
      </div>
    </div>
  );
}
