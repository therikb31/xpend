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
  const hasSav = accs.some((a) => a.kind === "savings");
  const hasGoal = accs.some((a) => a.kind === "goal");
  const hasSec = accs.some((a) => a.secondary);
  const net = accs.reduce(
    (s, a) => s + (a.kind === "savings" || a.kind === "goal" || a.secondary ? 0 : accBalance(doc, a.id)),
    0
  );
  const openAcc = (a: Account) => openSheet({ name: "account-edit", id: a.id });

  return (
    <div className="scr">
      <header className="scrhdr">
        <div className="hdr-title">Accounts</div>
        <div className="hdr-left">
          <button className="cbtn small" onClick={() => openSheet({ name: "export" })} aria-label="Export data">
            {IC.dots}
          </button>
          <button className="btn mini" onClick={() => openSheet({ name: "transfer" })}>
            ⇄ Move
          </button>
          <button className="btn mini" onClick={() => openSheet({ name: "account-add" })}>
            {IC.plus} Add
          </button>
        </div>
      </header>
      <div className="card">
        <div className="card-title">Net worth</div>
        <div className="dc-main" style={{ fontSize: 38, margin: "2px 0 4px" }}>
          {rupees(net, hide)}
        </div>
        <div className="dc-sub2" style={{ color: "var(--muted)", fontSize: 13.5 }}>
          {accs.length} account{accs.length === 1 ? "" : "s"}
          {hasSav ? " · excluding savings" : ""}
          {hasGoal ? " · excluding goals" : ""}
          {hasSec ? " · excluding secondary" : ""}
        </div>
      </div>
      {accs.map((a) => {
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
              <>
                <div className="sav-line">
                  <span>Previous savings</span>
                  <b>{rupees(a.prev != null ? a.prev : bal, hide)}</b>
                </div>
                <button
                  className="sav-mv"
                  onClick={(e) => {
                    e.stopPropagation();
                    openSheet({ name: "sav-move", id: a.id });
                  }}
                >
                  ⇄ Move between current &amp; previous
                </button>
              </>
            ) : (
              <div className="tsub" style={{ textTransform: "capitalize" }}>
                {a.kind}
                {a.secondary ? " · secondary" : ""}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
