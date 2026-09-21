// Money-movement sheets — ports of App.trSheet/trAccSheet/savMoveSheet.
// From/to account picking is internal step state (legacy used sheet swaps).

import { useState } from "react";
import type { CSSProperties } from "react";
import { AccountAvatar } from "../components/ui";
import { accBalance, savSync } from "../data/finance";
import { accById } from "../data/finance";
import { parseRupeesToPaise, rupees, todayStr, uid } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { Txn } from "../types";
import { Grab } from "./Sheet";

export function TransferSheet() {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  const accs = doc.accounts;

  const [step, setStep] = useState<"main" | "from" | "to">("main");
  const [from, setFrom] = useState(accs[0] ? accs[0].id : "");
  const [to, setTo] = useState(accs[1] ? accs[1].id : accs[0] ? accs[0].id : "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  if (step !== "main") {
    const which = step;
    const cur = which === "from" ? from : to;
    const set = which === "from" ? setFrom : setTo;
    return (
      <>
        <Grab />
        <div className="sh-title">{which === "from" ? "From" : "To"} account</div>
        {accs.map((a) => (
          <button
            key={a.id}
            className={"sh-row " + (cur === a.id ? "sel" : "")}
            onClick={() => {
              set(a.id);
              setStep("main");
            }}
          >
            <AccountAvatar a={a} />
            <span className="rname">{a.name}</span>
            <span className="rbal">{rupees(accBalance(doc, a.id), hide)}</span>
            {cur === a.id ? IC.check : IC.right}
          </button>
        ))}
      </>
    );
  }

  const fromAcc = accById(doc, from);
  const toAcc = accById(doc, to);
  const save = () => {
    const v = parseRupeesToPaise(amount || "0");
    if (!isFinite(v) || v <= 0) {
      toast("Enter an amount");
      return;
    }
    if (!from || !to || from === to) {
      toast("Choose two different accounts");
      return;
    }
    const t: Txn = {
      id: uid(), date: todayStr(), dir: "trans", amount: v,
      from, to, note: (note || "").trim(), createdAt: Date.now(),
    };
    mutate((d) => {
      d.transactions.push(t);
      savSync(d, null, t);
    });
    closeSheet();
    toast("Moved " + rupees(v, hide));
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Move money</div>
      <button className="field" onClick={() => setStep("from")}>
        <span className="ficon">💳</span>
        <span className="f-name">{fromAcc.name}</span>
        <span className="f-val">From</span>
        {IC.right}
      </button>
      <button className="field" onClick={() => setStep("to")}>
        <span className="ficon">💵</span>
        <span className="f-name">{toAcc.name}</span>
        <span className="f-val">To</span>
        {IC.right}
      </button>
      <label className="field note-field">
        <span className="ficon">₹</span>
        <input
          id="tr-amt"
          className="note-inline"
          inputMode="decimal"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <label className="field note-field">
        <span className="ficon">{IC.note}</span>
        <input
          id="tr-note"
          className="note-inline"
          maxLength={120}
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button className="btn" onClick={save}>
        {IC.check} Move
      </button>
    </>
  );
}

export function SavMoveSheet({ id }: { id: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;
  const [amount, setAmount] = useState("");

  const a = accById(doc, id);
  if (!a) return null;

  const move = (toPrev: boolean) => {
    const v = parseRupeesToPaise(amount || "");
    if (!isFinite(v) || v <= 0) {
      toast("Enter an amount");
      return;
    }
    const t: Txn = {
      id: uid(), date: todayStr(), dir: "trans", amount: v,
      from: toPrev ? id : "__prev", to: toPrev ? "__prev" : id,
      note: "", createdAt: Date.now(),
    };
    mutate((d) => {
      d.transactions.push(t);
      savSync(d, null, t);
    });
    closeSheet();
    toast(toPrev ? "Moved " + rupees(v, hide) + " to Previous" : "Released " + rupees(v, hide) + " to Current");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Move savings · {a.name}</div>
      <div className="txn-row">
        <span className="ccircle lg" style={{ ["--c" as string]: "#5BB98C" } as CSSProperties}>
          ⇄
        </span>
        <span className="txn-meta">
          <span className="txn-name">Current</span>
          <span className="txn-sub">{rupees(accBalance(doc, id), hide)}</span>
        </span>
        <span className="txn-amt">{rupees(a.prev != null ? a.prev : 0, hide)}</span>
      </div>
      <label className="field note-field">
        <span className="ficon">₹</span>
        <input
          id="sm-amt"
          className="note-inline"
          inputMode="decimal"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <button className="btn" onClick={() => move(true)}>
        → Move to Previous savings
      </button>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => move(false)}>
        ← Release to Current savings
      </button>
    </>
  );
}
