// Accounts — port of App.accounts: net worth + account cards.

import { AccountAvatar } from "../components/ui";
import { accBalance, upcomingAutopayTotal } from "../data/finance";
import { rupees, monthKey } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { Account } from "../types";

export function AccountsPage() {
  const { state, openSheet, go, setIgrp } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;

  const accs = doc.accounts;
  const net = accs.reduce(
    (s, a) => s + (a.kind === "savings" || a.kind === "goal" || a.secondary ? 0 : accBalance(doc, a.id)),
    0
  );
  const currentMonth = monthKey(new Date());
  const autopayDeduction = upcomingAutopayTotal(doc, currentMonth, "all");
  const adjustedNet = net - autopayDeduction;
  const openAcc = (a: Account) => openSheet({ name: "account-edit", id: a.id });
  const cards = accs.filter((a) => a.kind === "card");
  const rest = accs.filter((a) => a.kind !== "card");
  const renderCard = (a: Account) => {
    const bal = accBalance(doc, a.id);
    return (
      <div key={a.id} className="card" onClick={() => openAcc(a)} role="button">
        <div className="bud-top">
          <AccountAvatar a={a} />
          <span className="bname-h">
            {a.name}
            {a.kind === "savings" && (
              <div className="tsub" style={{ textTransform: "capitalize" }}>
                Savings account
              </div>
            )}
            {a.kind === "goal" && (
              <div className="tsub" style={{ textTransform: "capitalize" }}>
                Goal account
              </div>
            )}
          </span>
          <span className="tamt">
            {rupees(bal, hide)}
            {a.kind === "savings" && (
              <div className="tsub" style={{ textAlign: "right" }}>
                Current savings
              </div>
            )}
          </span>
        </div>
        {a.kind === "savings" ? (
          <div className="sav-line">
            <span>Previous savings</span>
            <b>{rupees(a.prev != null ? a.prev : bal, hide)}</b>
          </div>
        ) : (
          <div className="tsub" style={{ textTransform: "capitalize" }}>
            {a.kind}
            {a.secondary ? " · secondary" : ""}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="scr">
      <header className="scrhdr">
        <div className="hdr-title">Accounts</div>
        <div className="hdr-left">
          <button className="cbtn small" onClick={() => openSheet({ name: "accounts-more" })} aria-label="More options">
            {IC.dots}
          </button>
        </div>
      </header>
      <div className="card">
        <div className="card-title">Net worth</div>
        <div className="dc-main" style={{ fontSize: 38, margin: "2px 0 4px" }}>
          {rupees(adjustedNet, hide)}
        </div>
      </div>
      {cards.length > 0 && (
        <>
          <div className="sec-label">Cards</div>
          {cards.map(renderCard)}
        </>
      )}
      <div className="sec-label">Autopay</div>
      <div className="card" role="button" onClick={() => { go("summary"); setIgrp("autopay"); }}>
        <div className="bud-top">
          <span className="acc-av">
            <span className="ccircle pic" style={{ ["--c" as string]: "#7C9AA6" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="acc-ico">
                <path d="M3 9.5 12 5l9 4.5" />
                <path d="M3 20h18M5 20v-9M9.5 20v-9M12 20v-9M14.5 20v-9M19 20v-9" />
              </svg>
            </span>
            <span className="acc-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <g transform="translate(0,0.75)">
                  <rect x="3" y="6" width="18" height="12.5" rx="3" />
                  <path d="M3 10h18" />
                  <circle cx="16" cy="14.8" r="1.1" />
                </g>
              </svg>
            </span>
          </span>
          <span className="bname-h">Autopay</span>
          <span className="tamt">-{rupees(autopayDeduction, hide)}</span>
        </div>
        <div className="tsub" style={{ textTransform: "capitalize" }}>
          Card · Autopay
        </div>
      </div>
      <div className="sec-label">Accounts</div>
      {rest.map(renderCard)}
    </div>
  );
}
