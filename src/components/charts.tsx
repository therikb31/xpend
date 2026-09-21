// Chart components — ports of App.chart/daily (bars), the summary/analytics
// donut heroes, and App.budPaceSvg (budget pace chart). Pure SVG, no libraries.

import { budgetDailyCum, budgetMonthCtx } from "../data/finance";
import { parseMk, shortAmt } from "../lib/format";
import { IC } from "../lib/icons";
import { useSwipe } from "../hooks/useSwipe";
import { useApp } from "../services/store";
import type { ReactNode } from "react";
import type { Doc } from "../types";

/* ---------------- daily bar chart (overview / category / merchant) ---------------- */

export function dailyValues(
  txs: Array<{ dir: string; date: string; amount: number; categoryId?: string; merchantId?: string }>,
  mkey: string,
  cid?: string | null,
  mid?: string | null
): number[] {
  const dim = new Date(parseMk(mkey).getFullYear(), parseMk(mkey).getMonth() + 1, 0).getDate();
  const arr = new Array<number>(dim).fill(0);
  for (const t of txs) {
    if (t.dir !== "expense" || t.date.slice(0, 7) !== mkey) continue;
    if (cid && t.categoryId !== cid) continue;
    if (mid && (t.merchantId || "__none") !== mid) continue;
    const day = parseInt(t.date.slice(8, 10), 10) || 1;
    arr[day - 1] += t.amount;
  }
  return arr;
}

export function BarChart({
  daily,
  mkey,
  markMax,
  hide,
}: {
  daily: number[];
  mkey: string;
  markMax?: boolean;
  hide?: boolean;
}) {
  const arr = daily;
  const mx = Math.max.apply(null, arr.length ? arr : [0]) || 100;
  const yv = Math.max(100, Math.ceil(mx / 0.88 / 50) * 50);
  const hi = new Set(arr.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0).slice(-6));
  if (markMax && mx > 0) {
    arr.forEach((v, i) => {
      if (v === mx) hi.add(i);
    });
    const t = new Date();
    if (
      t.getFullYear() === parseMk(mkey).getFullYear() &&
      t.getMonth() === parseMk(mkey).getMonth() &&
      arr[t.getDate() - 1] > 0
    )
      hi.add(t.getDate() - 1);
  }
  const bars = arr.map((v, i) => {
    const h = v > 0 ? Math.round((v / yv) * 100) : 3;
    return (
      <span key={i} className={"bar" + (hi.has(i) ? " on" : "")} style={{ height: Math.max(h, 3) + "%" }}></span>
    );
  });
  const dim = arr.length;
  const pct = mx > 0 ? 88 : 8;
  return (
    <div className="ov-chart">
      <div className="chart-plot">
        <div className="bars">{bars}</div>
        <span className="dash" style={{ bottom: pct + "%" }}></span>
        <span className="ref-label" style={{ bottom: pct + "%" }}>
          {shortAmt(mx, hide)}
        </span>
        <div className="yax">
          <span style={{ top: 0 }}>{shortAmt(yv, hide)}</span>
          <span className="mid" style={{ top: "calc(50% - 8px)" }}>
            {shortAmt(Math.round(yv / 2), hide)}
          </span>
          <span style={{ bottom: 0 }}>0</span>
        </div>
        <div className="xax">
          <span>1</span>
          <span>8</span>
          <span>16</span>
          <span>23</span>
          <span>{dim}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- donut hero (summary / analytics) ---------------- */

export function DonutHero({
  entries,
  colors,
  total,
  totalLabel,
  monthLabel,
  trend,
  onMonth,
}: {
  entries: Array<[string, number]>;
  colors: Record<string, string>;
  total: ReactNode;
  totalLabel?: ReactNode;
  monthLabel: string;
  trend: ReactNode;
  onMonth: () => void;
}) {
  const { shiftMonth } = useApp();
  const { handlers, tapped } = useSwipe(
    () => shiftMonth(-1),
    () => shiftMonth(1)
  );
  const totalAmt = entries.reduce((s, e) => s + e[1], 0);
  const R = 110;
  const W = 20;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = entries.map(([k, amt]) => {
    const seg = totalAmt > 0 ? (amt / totalAmt) * C : 0;
    const el = (
      <circle
        key={k}
        cx="150"
        cy="150"
        r={R}
        fill="none"
        stroke={colors[k]}
        strokeWidth={W}
        strokeLinecap="round"
        strokeDasharray={`${seg.toFixed(2)} ${(C - seg).toFixed(2)}`}
        strokeDashoffset={(-acc).toFixed(2)}
        transform="rotate(-90 150 150)"
      />
    );
    acc += seg;
    return el;
  });
  return (
    <div className="sum-chart">
      <div className="donut-wrap big">
        <svg viewBox="0 0 300 300" className="donut-svg">
          <g transform="rotate(-90 150 150)">{arcs}</g>
        </svg>
        <div className="donut-center swipe-mk" {...handlers}>
          <button
            className="dc-month"
            onClick={() => {
              if (!tapped()) onMonth();
            }}
            aria-label="Select month"
          >
            {monthLabel} {IC.chev}
          </button>
          <div className="dc-main">{total}</div>
          {totalLabel}
          {trend}
        </div>
      </div>
    </div>
  );
}

/* ---------------- budget pace sparkline ---------------- */

export function PaceSvg({
  doc,
  mkey,
  ids,
  limit,
  accent,
  w,
  h,
}: {
  doc: Doc;
  mkey: string;
  ids: string[] | null;
  limit: number;
  accent: string;
  w: number;
  h: number;
}) {
  const ctx = budgetMonthCtx(mkey);
  const cum = budgetDailyCum(doc, mkey, ids);
  const days = Math.max(ctx.daysInMonth, 1);
  const maxV = Math.max(limit || 0, cum.length ? Math.max.apply(null, cum) : 0, 1);
  const P = 6;
  const x = (d: number) => P + (d / days) * (w - 2 * P);
  const y = (v: number) => h - P - (v / maxV) * (h - 2 * P);
  const pts = cum.map((v, i) => x(i + 1).toFixed(1) + "," + y(v).toFixed(1)).join(" ");
  const diag = "M" + P.toFixed(1) + "," + y(0).toFixed(1) + " L" + (w - P).toFixed(1) + "," + y(limit || 0).toFixed(1);
  const today =
    ctx.isCur && ctx.elapsed >= 1 ? (
      <circle cx={+x(ctx.elapsed).toFixed(1)} cy={+y(cum[ctx.elapsed - 1] || 0).toFixed(1)} r="2.6" fill="#D6DADD" />
    ) : null;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="bud-spark" role="img" aria-label="Pace chart">
      <line x1={P} y1={y(limit || 0)} x2={w - P} y2={y(limit || 0)} stroke="#3A4147" strokeWidth="1.1" strokeDasharray="4 3" />
      <path d={diag} stroke="#3A4147" strokeWidth="1" strokeDasharray="2 3" fill="none" opacity=".6" />
      <polyline points={pts} fill="none" stroke={accent} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {today}
    </svg>
  );
}
