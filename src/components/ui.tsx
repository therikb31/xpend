// Shared presentational components — ports of the legacy row/card/cell builders.
// Pure: doc + callbacks in, JSX out. No store access (pages pass what they need).

import React, { useState } from "react";
import type { CSSProperties } from "react";
import { useSwipe } from "../hooks/useSwipe";
import { useApp } from "../services/store";
import { budgetCtx, budgetSpent, isOverall, overallLimit, aggIdsRaw, aggSpentV, trNames, catById, goalCalc, budgetCats, budgetAccent } from "../data/finance";
import type { Account, Budget, Doc, Goal, Merchant, Txn } from "../types";
import { catEmoji, init, rupees } from "../lib/format";
import { ACC_ICONS, IC, MERCH_ICONS } from "../lib/icons";
import { PaceSvg } from "./charts";

const cssVar = (c: string): CSSProperties => ({ ["--c" as string]: c } as CSSProperties);

/* ---------------- feedback ---------------- */

export function Empty({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="empty">
      <div>{icon}</div>
      <div className="t">{title}</div>
      <div className="s">{sub}</div>
    </div>
  );
}

/** Down-trend icon, flipped when the trend is up (legacy inline-span trick). */
export function TrendIcon({ down }: { down: boolean }) {
  if (down) return <>{IC.downcir}</>;
  return (
    <span style={{ transform: "scaleY(-1)", display: "inline-flex" }}>{IC.downcir}</span>
  );
}

/* ---------------- avatars (accIconCell / merchantCell ports) ---------------- */

export function AccountAvatar({ a }: { a: Account }) {
  const [err, setErr] = useState(false);
  const rec = a.icon ? ACC_ICONS[a.icon] : undefined;
  if (!rec || err)
    return (
      <span className="ccircle" style={cssVar(a.color)}>
        {init(a.name)}
      </span>
    );
  return (
    <span className="ccircle pic" style={cssVar(a.color)}>
      <img
        className="acc-ico"
        src={rec.src}
        alt={rec.name}
        loading="lazy"
        onError={() => setErr(true)}
      />
    </span>
  );
}

export function MerchantLogoImg({ m }: { m: Merchant }) {
  const [err, setErr] = useState(false);
  const ls = m.logoScale ?? 100;
  if (err) return <span className="acc-ico no-img">{init(m.name)}</span>;
  if (m.iconUrl)
    return (
      <img
        className="acc-ico"
        style={cssVar(String(ls))}
        src={m.iconUrl}
        alt={m.name}
        loading="lazy"
        onError={() => setErr(true)}
      />
    );
  const rec = m.icon ? MERCH_ICONS[m.icon] : undefined;
  if (!rec) return null;
  return (
    <img
      className="acc-ico"
      src={rec.src}
      alt={rec.name}
      loading="lazy"
      onError={() => setErr(true)}
    />
  );
}

export function MerchantAvatar({ m }: { m: Merchant }) {
  const color = (m && m.color) || "#7C9AA6";
  const hasLogo = !!(m.iconUrl || (m.icon && MERCH_ICONS[m.icon]));
  if (hasLogo)
    return (
      <span className="ccircle pic" style={cssVar(color)}>
        <MerchantLogoImg m={m} />
      </span>
    );
  return (
    <span className="ccircle" style={cssVar(color)}>
      {init(m && m.name)}
    </span>
  );
}

/* ---------------- transaction rows (txRow / ovCard ports) ---------------- */

function noMerch(doc: Doc, t: Txn): boolean {
  return (
    t.dir === "expense" && !t.merchantId && doc.settings.highlightNoMerchant !== false
  );
}

export function TxnRow({ doc, t, onOpen }: { doc: Doc; t: Txn; onOpen: (id: string) => void }) {
  const hide = !!doc.settings.hideBalances;
  if (t.dir === "trans") {
    return (
      <button className="trow" onClick={() => onOpen(t.id)}>
        <span className="temoji">⇄</span>
        <span className="trow-body">
          <span className="tname">{t.note || trNames(doc, t)}</span>
        </span>
        <span className="tamt mute">{rupees(t.amount, hide)}</span>
      </button>
    );
  }
  const c = catById(doc, t.categoryId);
  const a = doc.accounts.find((x) => x.id === t.accountId);
  const sav = t.dir === "expense" && a && a.kind === "savings";
  return (
    <button className="trow" onClick={() => onOpen(t.id)}>
      <span className="temoji">{catEmoji(c)}</span>
      <span className="trow-body">
        <span className="tname">{t.note || c.name}</span>
      </span>
      <span
        className={
          "tamt " +
          (t.dir === "income" ? "inc " : sav ? "sav " : "") +
          (noMerch(doc, t) ? "nom" : "")
        }
      >
        {rupees(t.amount, hide)}
      </span>
    </button>
  );
}

export function OvCard({ doc, t, onOpen }: { doc: Doc; t: Txn; onOpen: (id: string) => void }) {
  const hide = !!doc.settings.hideBalances;
  if (t.dir === "trans") {
    return (
      <button className="ov-card" onClick={() => onOpen(t.id)}>
        <span className="ov-ic">⇄</span>
        <span className="ov-cc">
          <span className="nm">{t.note || trNames(doc, t)}</span>
        </span>
        <span className="amt sm mute">{rupees(t.amount, hide)}</span>
      </button>
    );
  }
  const c = catById(doc, t.categoryId);
  const a = doc.accounts.find((x) => x.id === t.accountId);
  const sav = t.dir === "expense" && a && a.kind === "savings";
  return (
    <button className="ov-card" onClick={() => onOpen(t.id)}>
      <span className="ov-ic">{catEmoji(c)}</span>
      <span className="ov-cc">
        <span className="nm">{t.note || c.name}</span>
      </span>
      <span
        className={
          "amt sm " +
          (t.dir === "income" ? "inc" : sav ? "sav" : "") +
          (noMerch(doc, t) ? " nom" : "")
        }
      >
        {rupees(t.amount, hide)}
      </span>
    </button>
  );
}

/* ---------------- summary / analytics cards ---------------- */

export function CatSumCard({
  doc, cid, amt, total, count, color, onOpen,
}: {
  doc: Doc; cid: string; amt: number; total: number; count: number; color: string; onOpen: (id: string) => void;
}) {
  const hide = !!doc.settings.hideBalances;
  const c = catById(doc, cid);
  const p = total > 0 ? ((amt / total) * 100).toFixed(2) : "0.00";
  return (
    <button className="sum-card" onClick={() => onOpen(cid)}>
      <span className="sum-ic" style={cssVar(color)}>
        {catEmoji(c)}
      </span>
      <span className="sum-cc">
        <span className="nm">{c.name}</span>
        <span className="sum-count">{count}</span>
      </span>
      <span className="sums-right">
        <span className="sum-amt">{rupees(amt, hide)}</span>
        <span className="sum-pct">{p}%</span>
      </span>
    </button>
  );
}

export function MerchSumCard({
  doc, mid, amt, total, count, color, onOpen,
}: {
  doc: Doc; mid: string; amt: number; total: number; count: number; color: string; onOpen: (id: string) => void;
}) {
  const hide = !!doc.settings.hideBalances;
  const m = mid === "__none" ? null : doc.merchants.find((x) => x.id === mid);
  const p = total > 0 ? ((amt / total) * 100).toFixed(2) : "0.00";
  return (
    <button className="sum-card" onClick={() => onOpen(m ? m.id : "__none")}>
      <span className="sum-ic logo" style={cssVar(color)}>
        {m ? <MerchantLogoImg m={m} /> : "🧾"}
      </span>
      <span className="sum-cc">
        <span className="sum-name">
          <span className="nm">{m ? m.name : "Unassigned"}</span>
          <span className="sum-count">{count}</span>
        </span>
      </span>
      <span className="sums-right">
        <span className="sum-amt">{rupees(amt, hide)}</span>
        <span className="sum-pct">{p}%</span>
      </span>
    </button>
  );
}

/* ---------------- budget + goal rows ---------------- */

export function BudgetCard({ doc, b, mkey, onOpen }: { doc: Doc; b: Budget; mkey: string; onOpen: (id: string) => void }) {
  const hide = !!doc.settings.hideBalances;
  const cats = budgetCats(doc, b);
  const all = isOverall(b);
  let limit = b.limit || 0;
  let spent = budgetSpent(doc, b, mkey);
  let ids: string[] | null = all ? null : b.categoryIds;
  if (all) {
    limit = overallLimit(doc, b.mkey || mkey);
    ids = aggIdsRaw(doc, b.mkey || mkey);
    spent = aggSpentV(doc, b.mkey || mkey);
  }
  const c = budgetCtx(b.mkey || mkey, limit, spent);
  const accent = all ? "#52E5A5" : budgetAccent(doc, b);
  const pct = Math.round(c.pct * 100);
  const stL = c.status === "over" ? "Over" : c.status === "ahead" ? "Ahead — slow down" : "On pace";
  const stC = c.status === "over" ? "err" : c.status === "ahead" ? "warn" : "on";
  const names = all ? "All expenses" : cats.length ? cats.map((x) => x.name).join(" · ") : "Categories removed";
  const icon = all ? IC.trend : catEmoji(cats[0]);
  const chipTxt = c.status === "over" ? "Over by " + rupees(c.overage, hide) : c.status === "ahead" ? "Ahead — slow down" : "On pace";
  const paceTxt = c.status === "over" ? "safe pace is ₹0" : "≤ " + rupees(c.safeDaily, hide) + "/day for " + (c.daysLeft > 0 ? c.daysLeft : "no") + " more day" + (c.daysLeft === 1 ? "" : "s");
  const chipC = c.status === "over" ? "err" : c.status === "ahead" ? "warn" : "ok";
  const barBg = c.pct >= 1 ? "#FF5A5A" : c.status === "ahead" || c.pct >= 0.8 ? "#FF9F43" : "#52E5A5";
  return (
    <div className="card goal-row" onClick={() => onOpen(b.id)} role="button">
      <div className="goal-head">
        <span className="ccircle" style={cssVar(accent)}>
          {icon}
        </span>
        <span className="goal-name">{b.name}</span>
        <span className={"pill " + stC}>{stL}</span>
      </div>
      <div className="goal-pbar">
        <div className="goal-pbar-track">
          <i style={{ width: Math.min(100, c.pct * 100) + "%", background: barBg }}></i>
        </div>
        <span className="goal-pct">{pct}%</span>
      </div>
      <div className="goal-fig">
        <span className="goal-saved">{rupees(c.spent, hide)}</span>
        <span className="goal-of">
          of {rupees(limit, hide)} spent · {pct}%
        </span>
      </div>
      <PaceSvg doc={doc} mkey={b.mkey || mkey} ids={ids} limit={limit} accent={accent} w={240} h={56} />
      <div className="goal-foot">
        <span className="gchip">{names}</span>
        <span className={"gchip " + chipC}>{chipTxt}</span>
        <span className="gchip">{paceTxt}</span>
      </div>
    </div>
  );
}

const GOAL_STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  "on-track": "On Track",
  "needs-attention": "Needs Attention",
  overdue: "Overdue",
};

export function GoalRow({ doc, g, color, onOpen }: { doc: Doc; g: Goal; color: string; onOpen: (id: string) => void }) {
  const hide = !!doc.settings.hideBalances;
  const c = goalCalc(g);
  const st = c.status;
  const stL = GOAL_STATUS_LABEL[st];
  const stC = st === "on-track" ? "on" : st === "needs-attention" ? "warn" : st === "overdue" ? "err" : "ok";
  const chipC = st === "completed" || st === "on-track" ? "ok" : st === "overdue" ? "err" : "warn";
  const dateLbl = g.date
    ? new Date(parseInt(g.date.slice(0, 4), 10), parseInt(g.date.slice(5, 7), 10) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : "No date";
  return (
    <div className="card goal-row" onClick={() => onOpen(g.id)} role="button">
      <div className="goal-head">
        <span className="ccircle" style={cssVar(color)}>
          {init(g.name)}
        </span>
        <span className="goal-name">{g.name}</span>
        <span className={"pill " + stC}>{stL}</span>
      </div>
      <div className={"goal-pbar " + (st === "overdue" ? "err" : "")}>
        <div className="goal-pbar-track">
          <i style={{ width: Math.min(100, c.pct) + "%" }}></i>
        </div>
        <span className="goal-pct">{Math.round(c.pct)}%</span>
      </div>
      <div className="goal-fig">
        <span className="goal-saved">{rupees(c.current, hide)}</span>
        <span className="goal-of">of {rupees(c.target, hide)} saved</span>
      </div>
      <div className="goal-foot">
        {g.completed ? (
          <span className="gchip ok">
            {IC.check} Purchased · {rupees(g.actualAmount || 0, hide)}
          </span>
        ) : (
          <>
            <span className="gchip">
              {IC.cal} {dateLbl}
            </span>
            <span className={"gchip " + chipC}>
              {IC.trend} {rupees(c.required, hide)}/mo
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- swipeable month hero (port of .swipe-mk) ---------------- */

export function SwipeMk({
  className,
  onTap,
  children,
}: {
  className?: string;
  onTap?: () => void;
  children: React.ReactNode;
}) {
  const { shiftMonth } = useApp();
  const { handlers, tapped } = useSwipe(
    () => shiftMonth(-1),
    () => shiftMonth(1)
  );
  return (
    <div
      className={"swipe-mk " + (className ?? "")}
      {...handlers}
      onClick={() => {
        if (!tapped() && onTap) onTap();
      }}
    >
      {children}
    </div>
  );
}

