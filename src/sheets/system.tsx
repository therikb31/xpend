// System sheets — ports of expSheet (+exp-copy) / gbSetupSheet / gbUnlockSheet /
// gbRestoreSheet / moreSheet / pwa-help.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { expData, expLabel, insightLabel, insightsExport } from "../data/finance";
import type { InsightGroup } from "../data/finance";
import { C } from "../lib/crypto";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import { Gist, gistCfg } from "../services/gist";
import { Grab } from "./Sheet";
import { CalGrid } from "./pickers";
import { dayLabel } from "../lib/format";
import type { AutopayConfig } from "../types";

/* Module-level date picker config (set by AutopaySheet before opening) */
interface DatePickerConfig {
  field: "startDate" | "endDate";
  value: string;
  onPick: (key: string) => void;
  title: string;
}

let datePickerConfig: DatePickerConfig | null = null;

export function setDatePickerConfig(cfg: DatePickerConfig) {
  datePickerConfig = cfg;
}

export function getDatePickerConfig(): DatePickerConfig | null {
  return datePickerConfig;
}

export function clearDatePickerConfig() {
  datePickerConfig = null;
}

/* ---------------- export JSON dump ---------------- */

function useCopy() {
  const { closeSheet, toast } = useApp();
  return (txt: string, what: string) => {
    const done = () => {
      closeSheet();
      toast("Copied " + what + " JSON");
    };
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch {
        toast("Copy failed");
      }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(fallback);
    } else fallback();
  };
}

function kbOf(env: Record<string, unknown>): string {
  return (new TextEncoder().encode(JSON.stringify(env)).length / 1024).toFixed(1) + " KB";
}

export function ExportSheet() {
  const { state } = useApp();
  const doc = state.doc!;
  const copy = useCopy();
  if (state.view === "summary") {
    return <InsightsExportSheet />;
  }
  const env = useMemo(
    () => expData(doc, state.view, state.mkey, state.flt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, state.view, state.mkey, state.flt]
  );
  const label = expLabel(state.view);
  const size = (new TextEncoder().encode(JSON.stringify(env)).length / 1024).toFixed(1) + " KB";
  const dta = (env.data || {}) as { transactions?: unknown[]; entries?: unknown[]; budgets?: unknown[]; goals?: unknown[]; accounts?: unknown[] };
  let count: number;
  if (state.view === "overview" || state.view === "activity" || state.view === "category" || state.view === "merchant")
    count = (dta.transactions || []).length;
  else if (state.view === "budget") count = (dta.budgets || []).length;
  else if (state.view === "goals") count = (dta.goals || []).length;
  else if (state.view === "accounts") count = (dta.accounts || []).length;
  else count = dta.transactions ? dta.transactions.length : 0;

  const onCopy = () => copy(JSON.stringify(env, null, 2), label);

  return (
    <>
      <Grab />
      <div className="sh-title">Export {label}</div>
      <div className="tsub" style={{ margin: "0 2px 14px", color: "var(--muted)" }}>
        Copies a JSON snapshot of everything shown on this screen — names, emojis, totals, counts
        and percentages resolved. Month: {String(env.monthLabel)} · {count} items · {size}.
      </div>
      <button className="sh-row" onClick={onCopy}>
        <span className="ccircle" style={{ ["--c" as string]: "rgba(82,229,165,.16)" } as CSSProperties}>
          {IC.share}
        </span>
        <span className="rname">Copy {label} JSON</span>
        {IC.right}
      </button>
    </>
  );
}

/* Insights export — one copy row per analytics tab, current tab first. */
const INSIGHT_GROUPS: InsightGroup[] = ["cat", "merch", "item", "nws", "autopay"];

function InsightsExportSheet() {
  const { state } = useApp();
  const doc = state.doc!;
  const copy = useCopy();
  const cur = (state.igrp || "cat") as InsightGroup;
  const ordered = [...INSIGHT_GROUPS].sort((a, b) =>
    a === cur ? -1 : b === cur ? 1 : 0
  );
  const payloads = useMemo(() => {
    const out = {} as Record<InsightGroup, Record<string, unknown>>;
    for (const g of INSIGHT_GROUPS) out[g] = insightsExport(doc, g, state.mkey, state.flt);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, state.mkey, state.flt]);
  const entriesOf = (g: InsightGroup): unknown[] =>
    ((payloads[g].data || {}) as { entries?: unknown[] }).entries || [];
  const monthLabel = String(payloads[cur].monthLabel || "");
  return (
    <>
      <Grab />
      <div className="sh-title">Export Insights</div>
      <div className="tsub" style={{ margin: "0 2px 14px", color: "var(--muted)" }}>
        Copy any analytics tab as JSON — names, totals, counts and percentages resolved.
        Month: {monthLabel}.
      </div>
      {ordered.map((g) => {
        const env = payloads[g];
        const n = entriesOf(g).length;
        return (
          <button
            key={g}
            className="sh-row"
            onClick={() => copy(JSON.stringify(env, null, 2), "Insights " + insightLabel(g))}
          >
            <span className="ccircle" style={{ ["--c" as string]: "rgba(82,229,165,.16)" } as CSSProperties}>
              {IC.share}
            </span>
            <span className="rname">
              Copy {insightLabel(g)} JSON{g === cur ? " · this view" : ""}
              <div className="s-sub">
                {n} items · {kbOf(env)}
              </div>
            </span>
            {IC.right}
          </button>
        );
      })}
    </>
  );
}

/* ---------------- gist setup ---------------- */

export function GistSetupSheet() {
  const { closeSheet, toast } = useApp();
  const [pat, setPat] = useState("");
  const [pass, setPass] = useState("");

  const save = async () => {
    if (pass.length < 8) {
      toast("Passphrase must be at least 8 characters");
      return;
    }
    if (!pat || pat.trim().length < 10) {
      toast("Enter a GitHub token with gist scope");
      return;
    }
    if (pat.trim().startsWith("github_pat_")) {
      toast("Fine-grained tokens don't support gist scope — use a classic token (ghp_…)");
      return;
    }
    if (!C.sup()) {
      toast("Backup needs a secure connection — open Xpend over https://");
      return;
    }
    closeSheet();
    try {
      const r = await Gist.connect(pass, pat.trim());
      toast(r.restored ? "Restored backup · " + r.gistId.slice(0, 7) : "Backup connected");
    } catch (e) {
      if (e && (e as Error).name === "OperationError") toast("Wrong passphrase or corrupt backup");
      else toast("Setup failed: " + ((e as Error) && (e as Error).name ? (e as Error).name + ": " : "") + ((e as Error) && (e as Error).message ? (e as Error).message : e));
    }
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Encrypted gist backup</div>
      {C.sup() ? null : (
        <div className="tsub" style={{ margin: "0 2px 12px", color: "var(--neg)" }}>
          Backup needs a secure connection. Open Xpend over its https:// link (or localhost) — this
          http:// address has WebCrypto disabled by iOS.
        </div>
      )}
      <div className="tsub" style={{ margin: "0 2px 6px" }}>
        1 · Generate a token with <b>gist</b> scope (opens github.com)
      </div>
      <a
        className="set gh"
        href="https://github.com/settings/tokens/new?scopes=gist&description=Xpend+backup&default_expires_at=none"
        target="_blank"
        rel="noreferrer"
      >
        {IC.open}
        <span className="s-label">
          Get a GitHub token<div className="s-sub">gist pre-checked · no expiry</div>
        </span>
        {IC.right}
      </a>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        2 · Paste the token below
      </div>
      <input type="password" placeholder="ghp_…" autoComplete="off" value={pat} onChange={(e) => setPat(e.target.value)} />
      <div className="tsub" style={{ margin: "10px 2px 4px" }}>
        3 · Set a passphrase (min 8 chars) — kept only in memory
      </div>
      <input type="password" placeholder="Passphrase" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
      <div className="tsub" style={{ margin: "6px 2px 10px", color: "var(--muted)" }}>
        Connect creates a private gist for you. Data is AES-256-GCM encrypted before upload.
      </div>
      <button className="btn" onClick={save}>
        {IC.shield} Connect
      </button>
    </>
  );
}

/* ---------------- gist unlock ---------------- */

export function GistUnlockSheet() {
  const { closeSheet, toast } = useApp();
  const [pass, setPass] = useState("");

  const save = async () => {
    if (!pass) {
      toast("Enter your passphrase");
      return;
    }
    if (!C.sup()) {
      toast("Backup needs a secure connection — open Xpend over https://");
      return;
    }
    closeSheet();
    try {
      const pulled = await Gist.unlock(pass);
      toast(pulled ? "Synced latest backup" : "Backup unlocked");
    } catch {
      toast("Wrong passphrase");
    }
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Unlock backup</div>
      <div className="tsub" style={{ margin: "0 2px 6px" }}>
        Enter the passphrase used to create this backup
      </div>
      <input type="password" placeholder="Passphrase" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
      <button className="btn" style={{ marginTop: 16 }} onClick={save}>
        {IC.shield} Unlock
      </button>
    </>
  );
}

/* ---------------- gist restore ---------------- */

export function GistRestoreSheet() {
  const { closeSheet, toast } = useApp();
  const [gid, setGid] = useState((gistCfg() && gistCfg()!.gistId) || "");
  const [pass, setPass] = useState("");

  const save = async () => {
    if (!pass) {
      toast("Enter your passphrase");
      return;
    }
    if (!C.sup()) {
      toast("Backup needs a secure connection — open Xpend over https://");
      return;
    }
    closeSheet();
    try {
      await Gist.restore(pass, gid.trim());
      toast("Restored from backup");
    } catch (e) {
      if (e && (e as Error).name === "OperationError") toast("Wrong passphrase or corrupt backup");
      else toast("Restore failed: " + ((e as Error) && (e as Error).message ? (e as Error).message : e));
    }
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Restore from backup</div>
      <div className="tsub" style={{ margin: "0 2px 6px" }}>
        Gist ID or URL
      </div>
      <input type="text" placeholder="e.g. abc123" autoComplete="off" value={gid} onChange={(e) => setGid(e.target.value)} />
      <div className="tsub" style={{ margin: "4px 2px 6px" }}>
        Passphrase
      </div>
      <input type="password" placeholder="Passphrase" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
      <div className="tsub" style={{ margin: "4px 2px 10px", color: "var(--muted)" }}>
        Replaces the data on this device.
      </div>
      <button className="btn" onClick={save}>
        {IC.refresh} Restore
      </button>
    </>
  );
}

/* ---------------- add-screen overflow menu ---------------- */

export function MoreSheet() {
  const { state, setAdd, mutate, closeSheet, toast, openSheet } = useApp();
  const a = state.add;
  return (
    <>
      <Grab />
      <button
        className="sh-row"
        onClick={() => {
          setAdd({ dir: a.dir === "expense" ? "income" : "expense" });
          closeSheet();
        }}
      >
        <span className="ccircle" style={{ ["--c" as string]: "#2B3339" } as CSSProperties}>
          {IC.refresh}
        </span>
        <span className="rname">Mark as {a.dir === "expense" ? "income" : "expense"}</span>
        {IC.right}
      </button>
      <button
        className="sh-row"
        onClick={() => {
          closeSheet();
          setTimeout(() => document.getElementById("note-inline")?.focus(), 40);
        }}
      >
        <span className="ccircle" style={{ ["--c" as string]: "#2B3339" } as CSSProperties}>
          {IC.note}
        </span>
        <span className="rname">Add note</span>
        {IC.right}
      </button>
      <button
        className="sh-row"
        onClick={() => {
          mutate((d) => {
            d.shortcuts.push({
              id: "sh-" + Date.now().toString(36),
              name: a.note || "Shortcut",
              dir: a.dir,
              amount: a.amount,
              categoryId: a.categoryId,
              accountId: a.accountId,
              merchantId: a.merchantId,
            });
          });
          closeSheet();
          toast("Shortcut saved");
        }}
      >
        <span className="ccircle" style={{ ["--c" as string]: "#2B3339" } as CSSProperties}>
          {IC.star}
        </span>
        <span className="rname">Save as shortcut</span>
        {IC.right}
      </button>
      <button
        className="sh-row"
        onClick={() => {
          closeSheet();
          openSheet({ name: "autopay" });
        }}
      >
        <span className="ccircle" style={{ ["--c" as string]: "#2B3339" } as CSSProperties}>
          {IC.repeat}
        </span>
        <span className="rname">{a.autopay ? "Edit autopay" : "Make autopay"}</span>
        {IC.right}
      </button>
      <button className="sh-row" onClick={closeSheet} style={{ color: "var(--neg)" }}>
        <span className="ccircle" style={{ ["--c" as string]: "rgba(192,91,77,.16)" } as CSSProperties}>
          {IC.x}
        </span>
        <span className="rname">Close</span>
        {IC.right}
      </button>
    </>
  );
}

/* ---------------- Autopay config sheet ---------------- */

export function AutopaySheet() {
  const { state, setAdd, closeSheet, toast, openSheet } = useApp();
  const a = state.add;

  const existing = a.autopay || {
    interval: "monthly" as const,
    dayOfMonth: parseInt(a.date.slice(8, 10), 10) || 1,
    customIntervalMonths: undefined,
    startDate: a.date,
    endDate: null,
    isActive: true,
  };

  const [interval, setInterval] = useState<"monthly" | "custom">(existing.interval);
  const [dayOfMonth, setDayOfMonth] = useState(existing.dayOfMonth);
  const [customIntervalMonths, setCustomIntervalMonths] = useState(existing.customIntervalMonths ?? 3);
  const [startDate, setStartDate] = useState(existing.startDate);
  const [endDate, setEndDate] = useState(existing.endDate || "");
  const [isActive, setIsActive] = useState(existing.isActive);

  const openDatePicker = (field: "startDate" | "endDate") => {
    setDatePickerConfig({
      field,
      value: field === "startDate" ? startDate : endDate,
      onPick: (key: string) => {
        if (field === "startDate") setStartDate(key);
        else setEndDate(key);
      },
      title: field === "startDate" ? "Start date" : "End date",
    });
    openSheet({ name: "date-picker" });
  };

  const save = () => {
    if (dayOfMonth < 1 || dayOfMonth > 31) {
      toast("Day must be 1-31");
      return;
    }
    if (interval === "custom" && (!customIntervalMonths || customIntervalMonths < 2 || customIntervalMonths > 12)) {
      toast("Custom interval must be 2-12 months");
      return;
    }
    const cfg: AutopayConfig = {
      interval,
      dayOfMonth,
      customIntervalMonths: interval === "custom" ? customIntervalMonths : undefined,
      startDate,
      endDate: endDate || null,
      isActive,
    };
    setAdd({ autopay: cfg });
    closeSheet();
    toast("Autopay configured");
  };

  const clear = () => {
    setAdd({ autopay: undefined });
    closeSheet();
    toast("Autopay removed");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Autopay settings</div>
      <div className="tsub" style={{ margin: "0 2px 12px", color: "var(--muted)" }}>
        This transaction will recur automatically. A virtual entry appears in Insights → Autopay.
      </div>

      {/* Recurrence - match Add Expense .seg style */}
      <div className="set">
        <label className="set-label">Recurrence</label>
        <div className="seg" style={{ marginTop: 8 }}>
          <button
            className={interval === "monthly" ? "on" : ""}
            onClick={() => setInterval("monthly")}
          >
            Monthly
          </button>
          <button
            className={interval === "custom" ? "on" : ""}
            onClick={() => setInterval("custom")}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Day of month - match Add Expense .field style */}
      <button className="field" onClick={() => setDayOfMonth(dayOfMonth === 31 ? 1 : dayOfMonth + 1)} style={{ cursor: "default" }}>
        <span className="ficon">📅</span>
        <span className="f-name">Day of month</span>
        <span className="f-val">{dayOfMonth}</span>
        {IC.right}
      </button>

      {/* Custom interval months */}
      {interval === "custom" && (
        <div className="set">
          <label className="set-label" htmlFor="customIntervalMonths">Every N months</label>
          <input
            id="customIntervalMonths"
            className="sheet-input input-number"
            type="number"
            min="2"
            max="12"
            value={customIntervalMonths}
            onChange={(e) => setCustomIntervalMonths(parseInt(e.target.value, 10) || 3)}
          />
        </div>
      )}

      {/* Start date - opens date picker sheet, match Add Expense .field style */}
      <button className="field" onClick={() => openDatePicker("startDate")}>
        <span className="ficon">🗓️</span>
        <span className="f-name">{dayLabel(startDate)}</span>
        <span className="f-val">Start date</span>
        {IC.right}
      </button>

      {/* End date (optional) - opens date picker sheet, match Add Expense .field style */}
      <button className="field" onClick={() => openDatePicker("endDate")}>
        <span className="ficon">🗓️</span>
        <span className="f-name">{endDate ? dayLabel(endDate) : "No end date"}</span>
        <span className="f-val muted">End date <span className="muted">(optional)</span></span>
        {IC.right}
      </button>

      {/* Active toggle switch - match Add Expense .field style */}
      <button className="field" onClick={() => setIsActive(!isActive)} style={{ cursor: "default" }}>
        <span className="ficon">⚙️</span>
        <span className="f-name">Status</span>
        <div className="toggle-switch-wrapper">
          <div
            role="switch"
            tabIndex={0}
            aria-checked={isActive}
            className={`toggle-switch ${isActive ? "is-on" : ""}`}
            onClick={(e) => { e.stopPropagation(); setIsActive(!isActive); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsActive(!isActive);
              }
            }}
          >
            <div className="toggle-track" aria-hidden="true">
              <div className="toggle-thumb" aria-hidden="true"></div>
            </div>
          </div>
        </div>
      </button>

      {/* Button row with Cancel */}
      <div className="button-row">
        <button className="btn btn-cancel" onClick={closeSheet}>
          Cancel
        </button>
        <button className="btn" onClick={save}>
          {IC.check} Save
        </button>
        {a.autopay && (
          <button className="btn btn-danger" onClick={clear}>
            {IC.trash} Remove
          </button>
        )}
      </div>
    </>
  );
}

/* ---------------- Date picker sheet (reusable for any local state) ---------------- */

export function DatePickerSheet() {
  const { closeSheet } = useApp();
  const cfg = getDatePickerConfig();

  if (!cfg) {
    closeSheet();
    return null;
  }

  return (
    <>
      <Grab />
      <div className="dp-head">
        <div className="dp-title">{cfg.title}</div>
        <button className="cbtn small" onClick={() => { clearDatePickerConfig(); closeSheet(); }} aria-label="Close">
          {IC.x}
        </button>
      </div>
      <CalGrid
        value={cfg.value}
        onPick={(key) => {
          cfg.onPick(key);
          // Defer to next tick to avoid race condition with parent state update
          setTimeout(() => {
            clearDatePickerConfig();
            closeSheet();
          }, 0);
        }}
      />
    </>
  );
}

/* ---------------- PWA install help ---------------- */

export function PwaHelpSheet() {
  return (
    <>
      <Grab />
      <div className="sh-title">Run locally, no server</div>
      <div className="tsub" style={{ margin: "0 2px 8px" }}>
        1 · In Safari, tap Share {IC.share}
      </div>
      <div className="tsub" style={{ margin: "0 2px 8px" }}>
        2 · Tap <b>Add to Home Screen</b> (Add to Dock on iPadOS)
      </div>
      <div className="tsub" style={{ margin: "0 2px 8px" }}>
        3 · Open Xpend from your Home Screen — it runs offline with all data stored on the phone
      </div>
      <div className="tsub" style={{ margin: "0 2px 10px", color: "var(--muted)" }}>
        The installed app keeps its secure https origin, so gist backup keeps working with no server
        needed.
      </div>
    </>
  );
}

