// Account sheets — ports of accAddSheet / accEditSheet / accIconSheet.
// Logo picking is internal step state (legacy used sheet swaps + App._acc*).

import { useState } from "react";
import type { CSSProperties } from "react";
import { AccountAvatar } from "../components/ui";
import { accById, cardBilling, generateCardBill } from "../data/finance";
import { init, parseRupeesToPaise, rupees, todayStr, uid } from "../lib/format";
import { ACC_ICONS, IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { AccountKind } from "../types";
import { Grab } from "./Sheet";

export function AccountsMoreSheet() {
  const { openSheet, closeSheet } = useApp();
  return (
    <>
      <Grab />
      <button className="sh-row" onClick={() => openSheet({ name: "transfer" })}>
        <span className="ccircle">⇄</span>
        <span className="rname">Move money</span>
        {IC.right}
      </button>
      <button className="sh-row" onClick={() => openSheet({ name: "account-add" })}>
        <span className="ccircle">{IC.plus}</span>
        <span className="rname">New account</span>
        {IC.right}
      </button>
      <button className="sh-row" onClick={() => openSheet({ name: "export" })}>
        <span className="ccircle">{IC.share}</span>
        <span className="rname">Export data</span>
        {IC.right}
      </button>
      <button className="sh-row" onClick={closeSheet} style={{ color: "var(--neg)" }}>
        <span className="ccircle">{IC.x}</span>
        <span className="rname">Close</span>
        {IC.right}
      </button>
    </>
  );
}

function IconGrid({
  cur,
  onPick,
  onClear,
}: {
  cur: string | null | undefined;
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  return (
    <>
      <Grab />
      <div className="sh-title">Account logo</div>
      <div className="search" style={{ marginBottom: 8 }}>
        {IC.search}
        <input type="text" placeholder="Search bank or card" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {(["Banks", "Cards"] as const).map((g, gi) => (
        <div key={g}>
          <div className="sec-label" style={{ marginTop: gi === 0 ? 0 : 12 }}>
            {g}
          </div>
          <div className="ai-grid">
            {Object.keys(ACC_ICONS)
              .filter((k) => ACC_ICONS[k].g === g)
              .filter((k) => {
                const i = ACC_ICONS[k];
                return (i.name + (i.alt ? " " + i.alt : "") + " " + i.g).toLowerCase().includes(query);
              })
              .map((k) => {
                const i = ACC_ICONS[k];
                return (
                  <button key={k} className={"ai-cell " + (cur === k ? "on" : "")} onClick={() => onPick(k)}>
                    <span className="ccircle pic" style={{ ["--c" as string]: "#fff" } as CSSProperties}>
                      <img className="acc-ico" src={i.src} alt={i.name} loading="lazy" />
                    </span>
                    <span className="ai-name">{i.name}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      <button className="set" style={{ marginTop: 16 }} onClick={onClear}>
        <span className="s-label">
          No logo<div className="s-sub">Show the account's initials instead</div>
        </span>
        {IC.x}
      </button>
    </>
  );
}

export function AccountAddSheet() {
  const { mutate, closeSheet, toast } = useApp();
  const [step, setStep] = useState<"main" | "icon">("main");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("cash");
  const [opening] = useState("");
  const [secondary, setSecondary] = useState(false);
  const [icon, setIcon] = useState<string | null>(null);
  // Credit card fields — only relevant when kind === "card"
  const [isCreditCard, setIsCreditCard] = useState(false);
  const [billGenDate, setBillGenDate] = useState("");
  const [dueOffset, setDueOffset] = useState("");
  const [creditLimit, setCreditLimit] = useState("");

  if (step === "icon") {
    return (
      <IconGrid
        cur={icon}
        onPick={(id) => {
          setIcon(id);
          setStep("main");
        }}
        onClear={() => {
          setIcon(null);
          setStep("main");
        }}
      />
    );
  }

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast("Enter a name");
      return;
    }
    const o = parseRupeesToPaise(opening || "0");
    const bgd = billGenDate ? parseInt(billGenDate, 10) : undefined;
    const off = dueOffset ? parseInt(dueOffset, 10) : undefined;
    const lim = creditLimit ? parseRupeesToPaise(creditLimit) : undefined;
    mutate((d) => {
      const acc = {
        id: "acc-u-" + uid(),
        name: n,
        kind,
        opening: o,
        color: "#7C9AA6",
        secondary: secondary === true,
        isCreditCard: kind === "card" ? isCreditCard : undefined,
        billGenerationDate: bgd,
        paymentDueOffset: off,
        creditLimit: lim,
        totalBilledAmount: 0,
        billedBalance: 0,
      } as (typeof d.accounts)[number];
      if (icon) acc.icon = icon;
      if (kind === "savings") acc.prev = o;
      d.accounts.push(acc);
    });
    closeSheet();
    toast("Account created");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">New account</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 4 }}>
        <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
        <button className="set" style={{ marginTop: 0 }} onClick={() => setStep("icon")}>
          <span className="csel" id="ai-prev">
            {icon ? (
              <AccountAvatar a={{ id: "tmp", name, kind: "cash", opening: 0, color: "#7C9AA6", icon }} />
            ) : (
              <span className="ccircle" style={{ ["--c" as string]: "#7C9AA6" } as CSSProperties}>
                {init(name || "") || "•"}
              </span>
            )}
          </span>
        </button>
      </div>
      <div className="chip-row" style={{ marginTop: 4 }}>
        {(["cash", "card", "savings", "goal"] as const).map((k) => (
          <button key={k} className={"chip " + (kind === k ? "on" : "")} onClick={() => setKind(k)}>
            {k === "cash" ? "Cash" : k === "card" ? "Card" : k === "savings" ? "Savings" : "Goal"}
          </button>
        ))}
      </div>
      {kind === "card" && (
        <>
          <div className="tsub" style={{ margin: "6px 2px 4px" }}>
            Credit card
          </div>
          <button className="set" style={{ marginTop: 4 }} onClick={() => setIsCreditCard((v) => !v)}>
            <span className="s-label">
              Mark as credit card<div className="s-sub">Enable billing cycle, due date, and credit limit tracking</div>
            </span>
            <span className={"switch " + (isCreditCard ? "on" : "")}></span>
          </button>
          {isCreditCard && (
            <>
              <div style={{ margin: "6px 2px 4px" }}>
                <label className="field note-field">
                  <span className="ficon">📅</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="note-inline"
                    placeholder="e.g. 5"
                    value={billGenDate}
                    onChange={(e) => setBillGenDate(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    maxLength={2}
                  />
                </label>
                <div className="tsub" style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                  Bill gen date (day)
                </div>
              </div>
              <div style={{ margin: "6px 2px 4px" }}>
                <label className="field note-field">
                  <span className="ficon">📆</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="note-inline"
                    placeholder="e.g. 20"
                    value={dueOffset}
                    onChange={(e) => setDueOffset(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    maxLength={2}
                  />
                </label>
                <div className="tsub" style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                  Due offset (days)
                </div>
              </div>
              <div style={{ margin: "6px 2px 4px" }}>
                <label className="field note-field">
                  <span className="ficon">💳</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="note-inline"
                    placeholder="0"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                  />
                </label>
                <div className="tsub" style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                  Credit limit (₹)
                </div>
              </div>
            </>
          )}
        </>
      )}
      {!isCreditCard && (
        <>
          <button className="set" style={{ marginTop: 14 }} onClick={() => setSecondary((v) => !v)}>
            <span className="s-label">
              Secondary account<div className="s-sub">Excluded from net worth (e.g. meal card)</div>
            </span>
            <span className={"switch " + (secondary ? "on" : "")}></span>
          </button>
        </>
      )}
      <button className="btn" style={{ marginTop: 16 }} onClick={save}>
        {IC.plus} Create account
      </button>
    </>
  );
}

export function AccountEditSheet({ id }: { id: string }) {
  const { state } = useApp();
  const doc = state.doc!;
  const a = accById(doc, id);
  if (!a) return null;

  return <AccountEditBody key={id} id={id} />;
}

export function MoveToBilledSheet({ accountId }: { accountId: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const a = accById(doc, accountId);
  if (!a || !a.isCreditCard) return null;

  const billing = cardBilling(doc, accountId);
  const unbilled = billing?.unbilled ?? 0;
  const hide = !!doc.settings.hideBalances;

  const [amount, setAmount] = useState(unbilled.toString());
  const [note, setNote] = useState("");

  const save = () => {
    const v = parseRupeesToPaise(amount);
    if (!isFinite(v) || v <= 0) {
      toast("Enter a valid amount");
      return;
    }
    if (v > unbilled) {
      toast(`Cannot move more than unbilled balance of ₹${rupees(unbilled, hide)}`);
      return;
    }
    mutate((d) => {
      generateCardBill(d, accountId, todayStr(), v);
      toast("Moved " + rupees(v, hide) + " to billed");
    });
    closeSheet();
    toast("Moved " + rupees(v, hide) + " to billed");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Move to billed</div>
      <div className="tsub">Available unbilled: {rupees(unbilled, hide)}</div>
      <label className="field note-field">
        <span className="ficon">₹</span>
        <input
          id="mb-amt"
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
          id="mb-note"
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
      <button className="btn ghost" onClick={closeSheet}>
        {IC.x} Cancel
      </button>
    </>
  );
}

function AccountEditBody({ id }: { id: string }) {
  const { state, mutate, closeSheet, openSheet, toast } = useApp();
  const doc = state.doc!;
  const a = accById(doc, id);
  const [step, setStep] = useState<"main" | "icon">("main");
  const [name, setName] = useState(a.name);
  const [kind, setKind] = useState<AccountKind>(a.kind || "cash");
  const [armed, setArmed] = useState(false);
  // Credit card fields
  const [isCreditCard, setIsCreditCard] = useState(!!a.isCreditCard);
  const [billGenDate, setBillGenDate] = useState(a.billGenerationDate ? String(a.billGenerationDate) : "");
  const [dueOffset, setDueOffset] = useState(a.paymentDueOffset ? String(a.paymentDueOffset) : "");
  const [creditLimit, setCreditLimit] = useState(a.creditLimit != null ? String(a.creditLimit / 100) : "");
  // Credit card billing state
  const isCC = a.isCreditCard;
  const billing = isCC ? cardBilling(doc, a.id) : null;

  if (step === "icon") {
    return (
      <IconGrid
        cur={a.icon}
        onPick={(icon) => {
          mutate((d) => {
            const t = d.accounts.find((x) => x.id === id);
            if (t) t.icon = icon;
          });
          setStep("main");
        }}
        onClear={() => {
          mutate((d) => {
            const t = d.accounts.find((x) => x.id === id);
            if (t) t.icon = null;
          });
          setStep("main");
        }}
      />
    );
  }

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast("Enter a name");
      return;
    }
    mutate((d) => {
      const t = d.accounts.find((x) => x.id === id);
      if (!t) return;
      t.name = n;
      t.kind = kind;
      t.isCreditCard = kind === "card" ? isCreditCard : undefined;
      t.billGenerationDate = kind === "card" && isCreditCard && billGenDate ? parseInt(billGenDate, 10) : undefined;
      t.paymentDueOffset = kind === "card" && isCreditCard && dueOffset ? parseInt(dueOffset, 10) : undefined;
      t.creditLimit = kind === "card" && isCreditCard && creditLimit ? parseRupeesToPaise(creditLimit) : undefined;
      if (t.kind === "savings" && t.prev == null) t.prev = t.opening || 0;
    });
    closeSheet();
    toast("Account saved");
  };

  const del = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    const first = doc.accounts.find((x) => x.id !== id);
    if (!first) {
      toast("Cannot delete the only account");
      return;
    }
    const delSav = a.kind === "savings";
    mutate((d) => {
      if (delSav) {
        d.transactions = d.transactions.filter(
          (t) => !(t.dir === "trans" && ((t.from === id && t.to === "__prev") || (t.from === "__prev" && t.to === id)))
        );
      }
      d.accounts = d.accounts.filter((x) => x.id !== id);
      d.transactions.forEach((t) => {
        if (t.dir === "trans") {
          if (t.from === id) t.from = first.id;
          if (t.to === id) t.to = first.id;
        } else if (t.accountId === id) {
          t.accountId = first.id;
        }
      });
    });
    closeSheet();
    toast("Account deleted");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Edit account</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 4 }}>
        <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="set" style={{ marginTop: 0 }} onClick={() => setStep("icon")}>
          <span className="csel" id="ai-prev">
            <AccountAvatar a={a} />
          </span>
        </button>
      </div>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Type
      </div>
      <div className="chip-row" style={{ marginTop: 0 }}>
        {(["cash", "card", "savings", "goal"] as const).map((k) => (
          <button key={k} className={"chip " + (kind === k ? "on" : "")} onClick={() => setKind(k)}>
            {k === "cash" ? "Cash" : k === "card" ? "Card" : k === "savings" ? "Savings" : "Goal"}
          </button>
        ))}
      </div>
      {kind === "card" && (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px" }}>
            Credit card
          </div>
          <button className="set" style={{ marginTop: 4 }} onClick={() => setIsCreditCard((v) => !v)}>
            <span className="s-label">
              Mark as credit card<div className="s-sub">Enable billing cycle, due date, and credit limit tracking</div>
            </span>
            <span className={"switch " + (isCreditCard ? "on" : "")}></span>
          </button>
          {isCreditCard && (
            <>
              <div style={{ margin: "6px 2px 4px" }}>
                <label className="field note-field">
                  <span className="ficon">📅</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="note-inline"
                    placeholder="e.g. 5"
                    value={billGenDate}
                    onChange={(e) => setBillGenDate(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    maxLength={2}
                  />
                </label>
                <div className="tsub" style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                  Bill gen date (day)
                </div>
              </div>
              <div style={{ margin: "6px 2px 4px" }}>
                <label className="field note-field">
                  <span className="ficon">📆</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="note-inline"
                    placeholder="e.g. 20"
                    value={dueOffset}
                    onChange={(e) => setDueOffset(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    maxLength={2}
                  />
                </label>
                <div className="tsub" style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                  Due offset (days)
                </div>
              </div>
              <div style={{ margin: "6px 2px 4px" }}>
                <label className="field note-field">
                  <span className="ficon">💳</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="note-inline"
                    placeholder="0"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                  />
                </label>
                <div className="tsub" style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                  Credit limit (₹)
                </div>
              </div>
            </>
          )}
          {isCreditCard && billing && (
            <>
              <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--neg)" }}>
                Billed: {rupees(billing.billed, !!doc.settings.hideBalances)}
              </div>
              <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
                Unbilled: {rupees(billing.unbilled, !!doc.settings.hideBalances)}
              </div>
              {(!billing || true) && (
                <button className="set" style={{ marginTop: 8 }} onClick={(e) => {
                  e.stopPropagation();
                  openSheet({ name: "move-to-billed", id2: id });
                }}>
                  <span className="s-label">
                    Move to billed<div className="s-sub">Shift amount from unbilled to billed</div>
                  </span>
                  {IC.right}
                </button>
              )}
            </>
          )}
        </>)}
      <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
        Balances come from transactions only.
      </div>
      {kind === "savings" && (
        <button className="set" style={{ marginTop: 8 }} onClick={() => openSheet({ name: "sav-move", id })}>
          <span className="s-label">
            Move between current &amp; previous
            <div className="s-sub">Shift money between the two savings buckets</div>
          </span>
          {IC.chev}
        </button>
      )}
      {!isCreditCard && (
        <button
          className="set"
          onClick={() =>
            mutate((d) => {
              const t = d.accounts.find((x) => x.id === id);
              if (t) t.secondary = !t.secondary;
            })
          }
        >
          <span className="s-label">
            Secondary account<div className="s-sub">Excluded from net worth (e.g. meal card)</div>
          </span>
          <span className={"switch " + (a.secondary ? "on" : "")}></span>
        </button>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button className="btn ghost" style={{ flex: 1 }} onClick={closeSheet}>
          Cancel
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={save}>
          {IC.check} Save
        </button>
      </div>
      <button
        className="btn ghost"
        style={{ width: "100%", marginTop: 12, color: "var(--neg)", borderColor: "rgba(192,91,77,.35)" }}
        onClick={del}
      >
        {IC.trash} {armed ? "Tap again to delete" : "Delete account"}
      </button>
      <div className="tsub" style={{ margin: "6px 2px 2px", color: "var(--muted)" }}>
        Transactions paid from this account move to your first account.
      </div>
    </>
  );
}
