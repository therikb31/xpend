// Insights — Category/Merchant/Items tabs sharing one shell (ApexDonut +
// chips + sum cards). Items groups expense notes (normalized) with a
// persisted frequency threshold; tap drills to a pre-searched Activity.

import { useState } from "react";
import { DonutHero } from "../components/charts";
import type { DonutDetail } from "../components/charts";
import { CatSumCard, Empty, ItemSumCard, MerchSumCard, MerchantLogoImg, TrendIcon } from "../components/ui";
import { NW_META, PAL, accById, bucketTxns, catById, merchById, monthStats, savingsBalance } from "../data/finance";
import type { NwKey } from "../data/finance";
import { catEmoji, fallbackEmoji, monthKey, parseMk, rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { ExpenseTxn } from "../types";
import type { CSSProperties } from "react";

const MIN_OPTS = [1, 2, 3, 5];
const DONUT_TOP = 10;

interface NwBucket {
  key: NwKey;
  count: number;
  amt: number;
}

interface ItemGroup {
  key: string;
  display: string;
  count: number;
  amt: number;
}

export function InsightsPage() {
  const { state, openSheet, setFilter, go, mutate } = useApp();
  const doc = state.doc!;
  const mkey = state.mkey;
  const flt = state.flt;
  const hide = !!doc.settings.hideBalances;
  const [grp, setGrp] = useState<"cat" | "merch" | "item" | "nws">("cat");
  const minCount = doc.settings.itemMinCount ?? 2;

  const mk = parseMk(mkey);
  const prev = new Date(mk);
  prev.setMonth(prev.getMonth() - 1);
  const prevKey = monthKey(prev);
  const prevSt = monthStats(doc, prevKey);
  const cur = new Date();
  const monthLabel =
    mk.getFullYear() === cur.getFullYear() && mk.getMonth() === cur.getMonth()
      ? "This month"
      : mk.toLocaleDateString("en-IN", { month: "long" });

  const txs = doc.transactions.filter(
    (t): t is ExpenseTxn =>
      t.dir === "expense" && t.date.slice(0, 7) === mkey && (flt.acc === "all" || t.accountId === flt.acc)
  );

  // Item groups (note text, normalized). Display = most-frequent raw form.
  let itemGroups: ItemGroup[] = [];
  if (grp === "item") {
    const byKey = new Map<string, { freq: Record<string, number>; count: number; amt: number }>();
    for (const t of txs) {
      const raw = (t.note || "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase().replace(/\s+/g, " ");
      let g = byKey.get(key);
      if (!g) {
        g = { freq: {}, count: 0, amt: 0 };
        byKey.set(key, g);
      }
      g.freq[raw] = (g.freq[raw] || 0) + 1;
      g.count += 1;
      g.amt += t.amount;
    }
    itemGroups = [...byKey.entries()]
      .filter(([, g]) => g.count >= minCount)
      .map(([key, g]) => ({
        key,
        display: Object.entries(g.freq).sort((a, b) => b[1] - a[1])[0][0],
        count: g.count,
        amt: g.amt,
      }))
      .sort((a, b) => b.amt - a.amt);
  }

  // Needs / wants / savings buckets (50-30-20). Expenses by category tag;
  // savings also counts transfers INTO savings accounts that month
  // (gross in; month-scoped like siblings, account filter not applied).
  let nwBuckets: NwBucket[] = [];
  let nwPrev = 0;
  if (grp === "nws") {
    const flow = (Object.keys(NW_META) as NwKey[])
      .filter((k) => k !== "saving")
      .map((k) => {
        const list = bucketTxns(doc, k, mkey, flt.acc);
        return { key: k, count: list.length, amt: list.reduce((s, t) => s + t.amount, 0) };
      });
    // Savings = account balances + saving-tagged expenses (transfers excluded).
    const savAccs = (doc.accounts || []).filter((a) => a.kind === "savings");
    const savTx = bucketTxns(doc, "saving", mkey, flt.acc);
    nwBuckets = [
      ...flow,
      {
        key: "saving" as NwKey,
        count: savAccs.length + savTx.length,
        amt: savingsBalance(doc) + savTx.reduce((s, t) => s + t.amount, 0),
      },
    ].filter((b) => b.amt > 0);
    nwPrev = (doc.accounts || [])
      .filter((a) => a.kind === "savings")
      .reduce((s, a) => s + (a.prev || 0), 0);
  }

  const agg: Record<string, number> = {};
  if (grp === "nws") {
    for (const b of nwBuckets) agg[b.key] = b.amt;
  } else if (grp !== "item") {
    for (const t of txs) {
      const k = grp === "cat" ? t.categoryId : t.merchantId || "__none";
      agg[k] = (agg[k] || 0) + t.amount;
    }
  } else {
    // Donut: top N items + Other bucket (totals stay exact).
    const top = itemGroups.slice(0, DONUT_TOP);
    for (const g of top) agg[g.key] = g.amt;
    const rest = itemGroups.slice(DONUT_TOP).reduce((s, g) => s + g.amt, 0);
    if (rest > 0) agg.__other = rest;
  }
  const entries = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, e) => s + e[1], 0);
  const pct = prevSt.spent > 0 ? Math.round(((prevSt.spent - total) / prevSt.spent) * 100) : null;
  const down = pct != null && pct >= 0;
  const prevName = parseMk(prevKey).toLocaleDateString("en-IN", { month: "short" });
  const colors: Record<string, string> = {};
  if (grp === "nws") {
    for (const b of nwBuckets) colors[b.key] = NW_META[b.key].color;
  } else if (grp === "item") {
    // Every group needs a color for its card, not just donut entries.
    itemGroups.forEach((g, i) => {
      colors[g.key] = PAL[i % PAL.length];
    });
    if (agg.__other) colors.__other = PAL[itemGroups.length % PAL.length];
  } else {
    entries.forEach((e, i) => {
      colors[e[0]] = PAL[i % PAL.length];
    });
  }

  const acc = flt.acc !== "all" ? accById(doc, flt.acc) : null;
  const accTxt = acc ? (acc.name.length > 11 ? acc.name.slice(0, 11) + "…" : acc.name) : "All accounts";
  // Donut center is an overview figure: whole rupees, no paise (fits the hole).
  const shortTotal = (p: number) => rupees(Math.round(p / 100) * 100, hide);
  const details: Record<string, DonutDetail> = {};
  for (const [id, amt] of entries) {
    const p = total > 0 ? ((amt / total) * 100).toFixed(1) : "0.0";
    if (grp === "cat") {
      const c = catById(doc, id);
      details[id] = {
        title: (
          <>
            <span>{catEmoji(c)}</span> {c ? c.name : "Unknown"}
          </>
        ),
        amount: shortTotal(amt),
        sub: <span className="dc-trend">{p}% of total</span>,
      };
    } else if (grp === "merch") {
      const m = id === "__none" ? null : merchById(doc, id);
      details[id] = {
        title: (
          <>
            <span className="dc-sel-logo">{m ? <MerchantLogoImg m={m} /> : "🧾"}</span> {m ? m.name : "Unassigned"}
          </>
        ),
        amount: shortTotal(amt),
        sub: <span className="dc-trend">{p}% of total</span>,
      };
    } else if (id === "__other") {
      details[id] = {
        title: <>Other items</>,
        amount: shortTotal(amt),
        sub: <span className="dc-trend">{p}% of total</span>,
      };
    } else if (grp === "nws") {
      const meta = NW_META[id as NwKey];
      details[id] = {
        title: (
          <>
            <span>{meta.emoji}</span> {meta.name}
          </>
        ),
        amount: shortTotal(amt),
        sub: <span className="dc-trend">{p}% of total</span>,
      };
    } else {
      const g = itemGroups.find((x) => x.key === id);
      details[id] = {
        title: (
          <>
            <span className="dc-sel-logo">{fallbackEmoji({ id, name: g ? g.display : id })}</span>{" "}
            {g ? g.display : id} · {g ? g.count : 0}×
          </>
        ),
        amount: shortTotal(amt),
        sub: <span className="dc-trend">{p}% of total</span>,
      };
    }
  }
  const openEntry = (id: string) => {
    if (grp === "cat") {
      setFilter({ cat: id });
      go("category", state.view);
    } else if (grp === "merch") {
      setFilter({ merch: id });
      go("merchant", state.view);
    } else if (grp === "item" && id !== "__other") {
      // Substring match ("Milk" also finds "Milkshake") — accepted v1.
      const g = itemGroups.find((x) => x.key === id);
      setFilter({ q: g ? g.display : id });
      go("activity", state.view);
    } else if (grp === "nws" && (id === "need" || id === "want" || id === "saving")) {
      setFilter({ bucket: id });
      go("bucket", state.view);
    }
  };
  const countFor = (id: string) =>
    grp === "cat"
      ? txs.filter((t) => t.categoryId === id).length
      : txs.filter((t) => (t.merchantId || "__none") === id).length;

  const emptySub =
    grp === "cat"
      ? "Tap + to add your first expense"
      : grp === "merch"
        ? "Tag a merchant when adding an expense"
        : grp === "nws"
          ? "Tag categories in Settings → Manage → Categories"
          : txs.some((t) => (t.note || "").trim())
            ? "Nothing repeats " + minCount + "+ times — lower the filter"
            : "Add notes to expenses to track items";
  const listBody =
    grp === "nws"
      ? (Object.keys(NW_META) as NwKey[]).map((k) => {
          const meta = NW_META[k];
          const found = nwBuckets.find((x) => x.key === k);
          return (
            <ItemSumCard
              key={k}
              name={meta.name}
              count={found ? found.count : 0}
              amt={found ? found.amt : 0}
              total={total}
              color={meta.color}
              hide={hide}
              icon={<span>{meta.emoji}</span>}
              onOpen={openEntry}
              id={k}
            />
          );
        })
      : grp === "item"
      ? itemGroups.map((g) => (
          <ItemSumCard
            key={g.key}
            name={g.display}
            count={g.count}
            amt={g.amt}
            total={total}
            color={colors[g.key]}
            hide={hide}
            onOpen={openEntry}
            id={g.key}
          />
        ))
      : entries.map(([id, amt]) =>
          grp === "cat" ? (
            <CatSumCard
              key={id}
              doc={doc}
              cid={id}
              amt={amt}
              total={total}
              count={countFor(id)}
              color={colors[id]}
              onOpen={openEntry}
            />
          ) : (
            <MerchSumCard
              key={id}
              doc={doc}
              mid={id}
              amt={amt}
              total={total}
              count={countFor(id)}
              color={colors[id]}
              onOpen={openEntry}
            />
          )
        );
  const hasRows = grp === "item" ? itemGroups.length > 0 : entries.length > 0;

  return (
    <div className="scr sum">
      <div className="ov-top">
        <button className="ov-gear" onClick={() => go("settings", "overview")} aria-label="Settings">
          {IC.gear}
        </button>
        <button className="ov-gear" onClick={() => openSheet({ name: "export" })} aria-label="Export data">
          {IC.dots}
        </button>
      </div>
      <div className="chip-row center" style={{ marginTop: 0 }} role="tablist" aria-label="Group spending by">
        <button
          type="button"
          role="tab"
          aria-selected={grp === "cat"}
          className={"chip " + (grp === "cat" ? "on" : "")}
          onClick={() => setGrp("cat")}
        >
          Category
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={grp === "merch"}
          className={"chip " + (grp === "merch" ? "on" : "")}
          onClick={() => setGrp("merch")}
        >
          Merchant
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={grp === "item"}
          className={"chip " + (grp === "item" ? "on" : "")}
          onClick={() => setGrp("item")}
        >
          Items
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={grp === "nws"}
          className={"chip " + (grp === "nws" ? "on" : "")}
          onClick={() => setGrp("nws")}
        >
          50-30-20
        </button>
      </div>
      {grp === "item" && (
        <div className="chip-row center" style={{ marginTop: 0 }} aria-label="Minimum times bought">
          {MIN_OPTS.map((n) => (
            <button
              key={n}
              type="button"
              className={"chip " + (minCount === n ? "on" : "")}
              onClick={() => mutate((d) => void (d.settings.itemMinCount = n))}
            >
              {n}+ times
            </button>
          ))}
        </div>
      )}
      <DonutHero
        entries={entries}
        colors={colors}
        total={shortTotal(total)}
        monthLabel={monthLabel}
        onMonth={() => openSheet({ name: "month" })}
        details={details}
        trend={
          pct == null ? (
            <span className="dc-trend mute">
              {IC.downcir} No earlier data
            </span>
          ) : (
            <span className={"dc-trend" + (down ? "" : " up")}>
              <TrendIcon down={down} /> {Math.abs(pct)}% {down ? "from" : "up from"} {prevName}
            </span>
          )
        }
      />
      <div className="ov-chips">
        <button
          className={"ov-chip " + (flt.dir === "expense" ? "on" : "")}
          onClick={() => setFilter({ dir: flt.dir === "expense" ? "all" : "expense" })}
        >
          Expenses
        </button>
        <button className="ov-chip" onClick={() => openSheet({ name: "month" })}>
          Monthly
        </button>
        <button
          className={"ov-chip " + (acc ? "on" : "")}
          onClick={() => openSheet({ name: "account-filter" })}
        >
          {acc && <span className="dot" style={{ ["--c" as string]: acc.color } as CSSProperties} />}
          {accTxt}
        </button>
        <button
          className="ov-chip"
          onClick={() => setFilter({ dir: "all", acc: "all", merch: "all" })}
        >
          All
        </button>
      </div>
      <div className="sum-list">
        {hasRows ? (
          listBody
        ) : (
          <div className="card">
            <Empty
              icon={IC.empty}
              title={grp === "item" ? "No repeated items" : grp === "nws" ? "No categorized spending" : "No spending yet"}
              sub={emptySub}
            />
          </div>
        )}
      </div>
      {grp === "nws" && nwPrev > 0 && (
        <div className="tsub" style={{ textAlign: "center", padding: "4px 12px 8px", color: "var(--muted)" }}>
          Saved before this month · {shortTotal(nwPrev)}
        </div>
      )}
    </div>
  );
}
