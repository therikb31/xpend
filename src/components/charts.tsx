// Chart components — ports of App.chart/daily (bars), the summary/analytics
// donut heroes, and App.budPaceSvg (budget pace chart). Pure SVG, no libraries.

import { budgetDailyCum, budgetMonthCtx } from "../data/finance";
import { parseMk, rupees, shortAmt } from "../lib/format";
import { IC } from "../lib/icons";
import { useSwipe } from "../hooks/useSwipe";
import { useApp } from "../services/store";
import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Doc } from "../types";
import Chart from "react-apexcharts/core";
import "apexcharts/donut";
import "apexcharts/bar";
import type { ApexOptions } from "apexcharts";
import { ApexDonut } from "./ApexDonut";

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

/* ---------------- apex daily bars (linear/log toggle) ---------------- */

const BAR_HI = "#E8EDEF";
const BAR_RADIUS = 5;

type BarPaintedHandler = NonNullable<
  NonNullable<NonNullable<ApexOptions["chart"]>["events"]>["mounted"]
>;

/** Repaint hook: round bar tops after every paint (mount/update/animation). */
function handleBarPaint(chart: Parameters<BarPaintedHandler>[0]): void {
  const el = (chart as unknown as { el?: ParentNode | null }).el;
  roundBarTops(el || null);
}

/**
 * ApexCharts force-squares bar corners on Safari/WebKit (isSafari UA gate),
 * so borderRadius never renders on iPhone. Round the tops ourselves by
 * rewriting each bar path — identical output on every engine. Top corners
 * only; baseline stays square. Idempotent; re-run after mount/update/
 * animation end. Skips zero-height (gap) bars.
 */
function roundBarTops(root: ParentNode | null): void {
  if (!root || typeof (root as Document).querySelectorAll !== "function") return;
  const paths = (root as Document).querySelectorAll("path.apexcharts-bar-area");
  paths.forEach((p) => {
    const el = p as unknown as SVGGraphicsElement;
    if (typeof el.getBBox !== "function") return;
    let box: { x: number; y: number; width: number; height: number };
    try {
      box = el.getBBox();
    } catch {
      return;
    }
    const { x, y, width: w, height: h } = box;
    if (!(w > 0) || !(h > 0.5)) return;
    const r = Math.min(BAR_RADIUS, w / 2, h);
    const f = (n: number) => (Math.round(n * 100) / 100).toString();
    const d =
      `M ${f(x)} ${f(y + h)} L ${f(x)} ${f(y + r)} ` +
      `Q ${f(x)} ${f(y)} ${f(x + r)} ${f(y)} L ${f(x + w - r)} ${f(y)} ` +
      `Q ${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} L ${f(x + w)} ${f(y + h)} Z`;
    p.setAttribute("d", d);
  });
}

export function ApexBars({
  daily,
  mkey,
  hide,
  onDaySelect,
}: {
  daily: number[];
  mkey: string;
  hide?: boolean;
  onDaySelect?: (dayIndex: number) => void;
}) {
  const { state } = useApp();
  const doc = state.doc!;
  const mode = doc.settings.chartScale ?? 1; // 0 linear, 1 cube-root, 2 log
  const log = mode === 2;
  const cbrt = mode === 1;
  const mk = parseMk(mkey);
  // Ref-mirrored so Apex event options keep a stable identity (no update
  // churn) while always calling the latest handler (correct month scope).
  const selectRef = useRef(onDaySelect);
  selectRef.current = onDaySelect;
  const { series, colors } = useMemo(() => {
    // Cube root compresses skew yet keeps zero at zero (no gaps needed);
    // log keeps natives + nulls (Apex transforms the axis itself).
    // All bars share the highlight fill — no recency/peak split.
    const series: Array<number | null> = daily.map((v) =>
      v > 0 ? (cbrt ? Math.cbrt(v) : v) : log ? null : 0
    );
    const colors = daily.map(() => BAR_HI);
    return { series, colors };
  }, [daily, log, cbrt]);
  const options = useMemo<ApexOptions>(
    () => ({
      chart: {
        type: "bar",
        background: "transparent",
        foreColor: "#8A9199",
        toolbar: { show: false },
        animations: { enabled: true, speed: 350 },
        fontFamily: "inherit",
        events: {
          mounted: handleBarPaint,
          updated: handleBarPaint,
          animationEnd: handleBarPaint,
          dataPointSelection: (_e, _ctx, config?: { dataPointIndex?: number }) => {
            const fn = selectRef.current;
            if (fn && config && typeof config.dataPointIndex === "number")
              fn(config.dataPointIndex);
          },
        },
      },
      plotOptions: {
        // Radius left at 0: Apex disables it on Safari anyway; roundBarTops
        // above draws identical tops on every engine instead.
        bar: { borderRadius: 0, columnWidth: "65%", distributed: true },
      },
      colors,
      dataLabels: { enabled: false },
      tooltip: {
        enabled: true,
        theme: "dark",
        x: {
          formatter: (_v, opts?: { dataPointIndex?: number }) => {
            const day = (opts && opts.dataPointIndex != null ? opts.dataPointIndex : 0) + 1;
            const wd = new Date(mk.getFullYear(), mk.getMonth(), day).toLocaleDateString("en-IN", {
              weekday: "short",
            });
            const suffix =
              day % 10 === 1 && day % 100 !== 11
                ? "st"
                : day % 10 === 2 && day % 100 !== 12
                  ? "nd"
                  : day % 10 === 3 && day % 100 !== 13
                    ? "rd"
                    : "th";
            return day + suffix + ", " + wd;
          },
        },
        y: {
          // Cube-root mode stores transformed values: cube back for truth.
          formatter: (v) => {
            const raw = cbrt ? Math.pow(Number(v) || 0, 3) : Number(v) || 0;
            return rupees(Math.round(raw), !!hide);
          },
          title: { formatter: () => "" },
        },
      },
      grid: { show: false },
      xaxis: {
        categories: daily.map((_, i) => String(i + 1)),
        tickAmount: 5,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { rotate: 0, style: { fontSize: "11px" } },
      },
      yaxis: log
        ? {
            logarithmic: true,
            logBase: 10,
            min: 1,
            tickAmount: 3,
            labels: {
              formatter: (v: number) => shortAmt(Math.round(Number(v) || 0), !!hide),
              style: { fontSize: "11px" },
            },
          }
        : {
            min: 0,
            tickAmount: 3,
            labels: {
              // Cube-root ticks live in transformed space: map back to rupees.
              formatter: (v: number) =>
                shortAmt(Math.round(cbrt ? Math.pow(Number(v) || 0, 3) : Number(v) || 0), !!hide),
              style: { fontSize: "11px" },
            },
          },
      states: {
        hover: { filter: { type: "none" } },
        active: { filter: { type: "none" } },
      },
    }),
    [daily.length, colors, hide, log, cbrt]
  );
  return (
    <div className="apex-bars">
      <Chart
        key={"bars-" + mode}
        options={options}
        series={[{ data: series }]}
        type="bar"
        width="100%"
        height={212}
      />
    </div>
  );
}

/* ---------------- donut hero (insights: apex rounded donut) ---------------- */

export interface DonutDetail {
  title: ReactNode;
  amount: ReactNode;
  sub?: ReactNode;
}

export function DonutHero({
  entries,
  colors,
  total,
  totalLabel,
  monthLabel,
  trend,
  onMonth,
  details,
}: {
  entries: Array<[string, number]>;
  colors: Record<string, string>;
  total: ReactNode;
  totalLabel?: ReactNode;
  monthLabel: string;
  trend: ReactNode;
  onMonth: () => void;
  details?: Record<string, DonutDetail>;
}) {
  const { shiftMonth } = useApp();
  const { handlers, tapped } = useSwipe(
    () => shiftMonth(-1),
    () => shiftMonth(1)
  );
  const [sel, setSel] = useState<string | null>(null);
  const ids = entries.map(([k]) => k);
  // Selection follows the data: drop it when its entry disappears.
  const selId = sel != null && ids.includes(sel) ? sel : null;
  const selDetail = selId && details ? details[selId] : null;
  return (
    <div className="sum-chart">
      <div className="donut-wrap big">
        <ApexDonut
          series={entries.map(([, amt]) => amt)}
          labels={ids}
          colors={ids.map((k) => colors[k])}
          onSelect={(idx) => {
            const id = ids[idx];
            if (id == null) return;
            setSel((prev) => (prev === id ? null : id));
          }}
        />
        <div
          className="donut-center swipe-mk"
          {...handlers}
          onClick={() => {
            if (selId) setSel(null);
          }}
        >
          {selDetail ? (
            <>
              <div className="dc-sel">{selDetail.title}</div>
              <div className="dc-main">{selDetail.amount}</div>
              {selDetail.sub}
            </>
          ) : (
            <>
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
            </>
          )}
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
