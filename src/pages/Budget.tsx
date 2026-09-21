// Budget — port of App.budget + App.budgetCard.

import { PaceSvg } from "../components/charts";
import { BudgetCard, Empty, SwipeMk, TrendIcon } from "../components/ui";
import {
  aggIdsRaw,
  aggSpentV,
  budgetCtx,
  budgetSpent,
  budgetsFor,
  isOverall,
  monthStats,
  overallLimit,
} from "../data/finance";
import { monthKey, parseMk, rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";

export function BudgetPage() {
  const { state, openSheet } = useApp();
  const doc = state.doc!;
  const mkey = state.mkey;
  const hide = !!doc.settings.hideBalances;

  const budgets = budgetsFor(doc, mkey);
  const mk = parseMk(mkey);
  const prev = new Date(mk);
  prev.setMonth(prev.getMonth() - 1);
  const prevKey = monthKey(prev);
  const st = monthStats(doc, mkey);
  const prevSt = monthStats(doc, prevKey);
  const pct = prevSt.spent > 0 ? Math.round(((prevSt.spent - st.spent) / prevSt.spent) * 100) : null;
  const down = pct != null && pct >= 0;
  const monthName = mk.toLocaleDateString("en-IN", { month: "long" });
  const prevName = parseMk(prevKey).toLocaleDateString("en-IN", { month: "short" });

  const aggLimit = overallLimit(doc, mkey);
  const aggIds = aggIdsRaw(doc, mkey);
  const aggSpent = aggSpentV(doc, mkey);
  const agg = budgetCtx(mkey, aggLimit, aggSpent);
  const unbudgeted = Math.max(0, st.spent - aggSpent);
  const stOf = (b: (typeof budgets)[number]) => {
    const all = isOverall(b);
    const bk = b.mkey || mkey;
    return budgetCtx(
      bk,
      all ? overallLimit(doc, bk) : b.limit || 0,
      all ? aggSpentV(doc, bk) : budgetSpent(doc, b, mkey)
    ).status;
  };
  const onN = budgets.filter((b) => stOf(b) === "on").length;
  const aheadN = budgets.filter((b) => stOf(b) === "ahead").length;
  const overN = budgets.filter((b) => stOf(b) === "over").length;
  const stL = agg.status === "over" ? "Over" : agg.status === "ahead" ? "Ahead — slow down" : "On pace";
  const stC = agg.status === "over" ? "err" : agg.status === "ahead" ? "warn" : "on";

  return (
    <div className="scr">
      <header className="scrhdr">
        <div className="hdr-title">Budget</div>
        <div className="hdr-left">
          <button className="cbtn small" onClick={() => openSheet({ name: "export" })} aria-label="Export data">
            {IC.dots}
          </button>
          <button className="btn mini" onClick={() => openSheet({ name: "budget-form" })}>
            {IC.plus} Set budget
          </button>
        </div>
      </header>
      <SwipeMk className="ov-sum" onTap={() => openSheet({ name: "month" })}>
        <span className="ov-mon">
          {monthName} {IC.chev}
        </span>
        <span className="ov-total">{rupees(st.spent, hide)}</span>
        {pct == null ? (
          <span className="ov-delta" style={{ color: "var(--muted)" }}>
            {IC.downcir} No earlier data
          </span>
        ) : (
          <span className="ov-delta" style={down ? undefined : { color: "var(--neg)" }}>
            <TrendIcon down={down} /> {Math.abs(pct)}% {down ? "from" : "up from"} {prevName}
          </span>
        )}
      </SwipeMk>
      {budgets.length ? (
        <>
          <div className="card">
            <div className="card-title">Overview</div>
            <div className="metrics-grid">
              <div className="metric">
                <span className="metric-val">{rupees(aggLimit, hide)}</span>
                <span className="metric-lbl">Total Budget</span>
              </div>
              <div className="metric">
                <span className="metric-val">{rupees(aggSpent, hide)}</span>
                <span className="metric-lbl">Spent</span>
              </div>
              <div className="metric">
                <span className={"metric-val " + (agg.remaining === 0 ? "neg" : "")}>
                  {rupees(agg.remaining, hide)}
                </span>
                <span className="metric-lbl">Remaining</span>
              </div>
              <div className="metric">
                <span className="metric-val">
                  {agg.status === "over" ? "₹0" : agg.safeDaily > 0 ? rupees(agg.safeDaily, hide) + "/day" : "—"}
                </span>
                <span className="metric-lbl">Safe pace</span>
              </div>
            </div>
            <div className="status-pills" style={{ marginTop: 14 }}>
              <span className="pill on">{onN} On Pace</span>
              <span className={"pill " + (aheadN ? "warn" : "")}>{aheadN} Ahead of pace</span>
              <span className={"pill " + (overN ? "err" : "")}>{overN} Over</span>
              <span className={"pill " + (unbudgeted > 0 ? "warn" : "")}>
                {unbudgeted > 0 ? rupees(unbudgeted, hide) : "₹0"} Unbudgeted
              </span>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Keeping it linear</div>
            <PaceSvg doc={doc} mkey={mkey} ids={aggIds} limit={aggLimit} accent="#52E5A5" w={300} h={100} />
            <div className="bud-pace-row">
              <span className={"pill " + stC}>{stL}</span>
              <span className="bud-pace-txt">
                {agg.status === "over"
                  ? "Over by " + rupees(agg.overage, hide) + " · safe pace is ₹0"
                  : "Spend ≤ " +
                    rupees(agg.safeDaily, hide) +
                    "/day for " +
                    (agg.daysLeft > 0 ? agg.daysLeft : "no") +
                    " more day" +
                    (agg.daysLeft === 1 ? "" : "s") +
                    " to stay on budget"}
              </span>
            </div>
            <div className="bud-chax">
              <span>1</span>
              <span>{Math.ceil(agg.daysInMonth / 2)}</span>
              <span>{agg.daysInMonth}</span>
            </div>
          </div>
          <div className="sec-label">Budgets</div>
          {budgets.map((b) => (
            <BudgetCard
              key={b.id}
              doc={doc}
              b={b}
              mkey={mkey}
              onOpen={(id) => openSheet({ name: "budget-detail", id })}
            />
          ))}
          {unbudgeted > 0 && (
            <div className="bud-strip">
              {rupees(unbudgeted, hide)} spent outside budgets this month
            </div>
          )}
        </>
      ) : (
        <div className="card" style={{ borderRadius: 24 }}>
          <Empty
            icon={<div>{IC.trend}</div>}
            title="No budgets yet"
            sub="Tap Set budget to cap your spending per category"
          />
        </div>
      )}
    </div>
  );
}
