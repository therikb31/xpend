// Bucket drill-down — 50-30-20 Needs/Wants/Savings from Insights.
// Needs/Wants mirror CategoryPage: month scope + account chip + day groups.
// Savings is balance-based (not transactional): it lists the savings
// accounts with their current balances; moves never count as flow.

import { AccountAvatar, Empty, OvCard, SwipeMk, TrendIcon } from "../components/ui";
import { NW_META, accBalance, accById, bucketTxns, savingsTally } from "../data/finance";
import type { NwKey } from "../data/finance";
import { dayLabel, monthKey, parseMk, rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { Txn } from "../types";
import type { ReactNode } from "react";

function isBucketKey(k: string): k is NwKey {
  return k === "need" || k === "want" || k === "saving";
}

export function BucketPage() {
  const { state, openSheet, setFilter, go, back } = useApp();
  const doc = state.doc!;
  const mkey = state.mkey;
  const flt = state.flt;
  const hide = !!doc.settings.hideBalances;

  const mk = parseMk(mkey);
  const prev = new Date(mk);
  prev.setMonth(prev.getMonth() - 1);
  const prevKey = monthKey(prev);
  const monthName = mk.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  const prevName = parseMk(prevKey).toLocaleDateString("en-IN", { month: "short" });

  if (!isBucketKey(flt.bucket)) {
    return (
      <div className="scr cat">
        <header className="scrhdr">
          <div className="hdr-left">
            <button className="cbtn small" onClick={back} aria-label="Back">
              {IC.left}
            </button>
          </div>
        </header>
        <Empty icon={IC.empty} title="Unknown bucket" sub="Go back and tap a Needs, Wants, or Savings card" />
      </div>
    );
  }
  const key: NwKey = flt.bucket;
  const meta = NW_META[key];
  const isSaving = key === "saving";
  const isCurMonth = mkey === monthKey(new Date());

  const tal = savingsTally(doc, mkey, flt.acc);
  const talPrev = savingsTally(doc, prevKey, flt.acc);
  const savList =
    isSaving && flt.acc !== "all" ? tal.savAccs.filter((a) => a.id === flt.acc) : tal.savAccs;

  const list = bucketTxns(doc, key, mkey, flt.acc);
  const txTotal = list.reduce((s, t) => s + t.amount, 0);
  const total = isSaving ? tal.total : txTotal;
  const prevTotal = isSaving
    ? talPrev.total
    : bucketTxns(doc, key, prevKey, flt.acc).reduce((s, t) => s + t.amount, 0);

  // Savings "saved" movements: transfers in + manual moves to Previous +
  // tagged expenses (merge the desc-sorted lists back into date order).
  const byNewest = (a: Txn, b: Txn) =>
    a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1;
  const savedList = isSaving
    ? [...tal.inTxns, ...tal.movedTxns, ...tal.taggedTxns].sort(byNewest)
    : [];
  const outList = isSaving ? tal.outTxns : [];

  let delta: ReactNode;
  if (isSaving && isCurMonth)
    delta = (
      <span className="cat-delta mute">{savList.length ? "Current savings" : "No savings accounts yet"}</span>
    );
  else if (total === 0) delta = <span className="cat-delta mute">Nothing this month</span>;
  else if (prevTotal === 0)
    delta = (
      <span className="cat-delta mute">
        {IC.downcir} New this month
      </span>
    );
  else {
    const p = Math.round(((prevTotal - total) / prevTotal) * 100);
    const down = p >= 0;
    delta = (
      <span className={"cat-delta" + (down ? "" : " neg")}>
        <TrendIcon down={down} /> {Math.abs(p)}% {down ? "from" : "up from"} {prevName}
      </span>
    );
  }

  const groupTxns = (items: Txn[]) => {
    const g: Array<{ date: string; items: Txn[] }> = [];
    for (const t of items) {
      const last = g[g.length - 1];
      if (!last || last.date !== t.date) g.push({ date: t.date, items: [t] });
      else last.items.push(t);
    }
    return g;
  };
  const groups = groupTxns(list);
  const savedGroups = groupTxns(savedList);
  const outGroups = groupTxns(outList);
  const txnGroups = (gs: Array<{ date: string; items: Txn[] }>) =>
    gs.map((g) => (
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
    ));

  const acc = flt.acc !== "all" ? accById(doc, flt.acc) : null;
  const accTxt = acc ? (acc.name.length > 11 ? acc.name.slice(0, 11) + "…" : acc.name) : "All accounts";
  const openTxn = (id: string) => openSheet({ name: "txn", id });
  const ruleTxt = "Rule " + (key === "saving" ? "≥ " : "≤ ") + meta.rule + "% of income";

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
      <SwipeMk className="cat-metric" onTap={isSaving ? undefined : () => openSheet({ name: "month" })}>
        <span className="cat-title">
          {meta.emoji} {meta.name} {isSaving ? null : IC.chev}
        </span>
        <span className="cat-total">{rupees(total, hide)}</span>
        {delta}
        <span className="cat-delta mute">{ruleTxt}</span>
      </SwipeMk>
      <div className="ov-chips">
        <button className="ov-chip circ" onClick={() => go("activity", state.view)} aria-label="Search">
          {IC.search}
        </button>
        {isSaving ? null : (
          <button className="ov-chip" onClick={() => openSheet({ name: "month" })}>
            {monthName}
          </button>
        )}
        <button
          className={"ov-chip " + (acc ? "on" : "")}
          onClick={() => openSheet({ name: "account-filter" })}
        >
          {accTxt}
        </button>
        <button
          className="ov-chip"
          onClick={() => setFilter({ dir: "all", acc: "all", merch: "all", bucket: "all" })}
        >
          All
        </button>
      </div>
      <div className="ov-groups">
        {isSaving && isCurMonth && (
          savList.length ? (
            savList.map((a) => (
              <div
                key={a.id}
                className="card"
                onClick={() => openSheet({ name: "account-edit", id: a.id })}
                role="button"
              >
                <div className="bud-top">
                  <AccountAvatar a={a} />
                  <span className="bname-h">
                    {a.name}
                    <div className="tsub" style={{ textTransform: "capitalize" }}>
                      Savings account
                    </div>
                  </span>
                  <span className="tamt">
                    {rupees(accBalance(doc, a.id), hide)}
                    <div className="tsub" style={{ textAlign: "right" }}>
                      Current savings
                    </div>
                  </span>
                </div>
              </div>
            ))
          ) : (
            <Empty icon={IC.empty} title="No savings accounts" sub="Add one from Accounts → Add → Savings" />
          )
        )}
        {isSaving && !isCurMonth && total > 0 && (
          <div className="tsub" style={{ padding: "2px 18px 6px" }}>
            Balance at end of {monthName} · {rupees(tal.balance, hide)}
          </div>
        )}
        {isSaving && savedGroups.length > 0 && (
          <div className="tsub" style={{ padding: "6px 18px 0" }}>
            Saved this month
          </div>
        )}
        {isSaving ? txnGroups(savedGroups) : null}
        {isSaving && outGroups.length > 0 && (
          <div className="tsub" style={{ padding: "6px 18px 0" }}>
            Moved out
          </div>
        )}
        {isSaving ? txnGroups(outGroups) : null}
        {isSaving && total === 0 && savList.length === 0 ? (
          <Empty
            icon={IC.empty}
            title={isCurMonth ? "No savings accounts" : "No savings"}
            sub={
              isCurMonth
                ? "Add one from Accounts → Add → Savings"
                : `Nothing saved in ${monthName} yet`
            }
          />
        ) : null}
        {!isSaving ? (
          groups.length ? (
            txnGroups(groups)
          ) : (
            <Empty icon={IC.empty} title="No transactions" sub={`Nothing in ${meta.name} for this month yet`} />
          )
        ) : null}
      </div>
    </div>
  );
}
