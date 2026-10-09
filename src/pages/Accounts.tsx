// Accounts — port of App.accounts: net worth + account cards.

import { AccountAvatar } from "../components/ui";
import { accBalance } from "../data/finance";
import { rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { Account } from "../types";

export function AccountsPage() {
  const { state, openSheet } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;

  const accs = doc.accounts;
  const net = accs.reduce(
    (s, a) => s + (a.kind === "savings" || a.kind === "goal" || a.secondary ? 0 : accBalance(doc, a.id)),
    0
  );
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
          {rupees(net, hide)}
        </div>
      </div>
      {cards.length > 0 && (
        <>
          <div className="sec-label">Cards</div>
          {cards.map(renderCard)}
        </>
      )}
      <div className="sec-label">Accounts</div>
      {rest.map(renderCard)}
    </div>
  );
}
