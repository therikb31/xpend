// Settings — port of App.settings + prefs/backup/data actions.

import { useEffect, useState } from "react";
import { APP_VER } from "../lib/format";
import { monthKey } from "../lib/format";
import { IC } from "../lib/icons";
import { defaultDoc } from "../data/defaults";
import { sampleData } from "../data/sample";
import type { Doc } from "../types";
import { Gist, gistConnected, gistDirty, gistUnlocked } from "../services/gist";
import { useApp } from "../services/store";

function shortT(iso: string | undefined, dirty: boolean): string {
  if (dirty) return "Pending changes…";
  if (!iso) return "Never synced";
  try {
    return (
      "Synced " +
      new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  } catch {
    return "Synced";
  }
}

/* Muted viewport/safe-area readout for diagnosing edge-to-edge issues on
   device (viewport px, visual viewport px, top/bottom insets px, standalone
   media match, iOS standalone flag). Measured live via an env() probe. */
function ViewportDiagnostics() {
  const [v, setV] = useState({ vh: 0, vv: 0, top: 0, bottom: 0, dm: false, ios: false });
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px);" +
      "left:0;width:0;height:0;pointer-events:none;visibility:hidden";
    document.body.appendChild(probe);
    const read = () => {
      const r = probe.getBoundingClientRect();
      setV({
        vh: window.innerHeight,
        vv: window.visualViewport ? Math.round(window.visualViewport.height) : 0,
        top: Math.round(r.top),
        bottom: Math.round(window.innerHeight - r.bottom),
        dm: window.matchMedia("(display-mode: standalone)").matches,
        ios: (navigator as Navigator & { standalone?: boolean }).standalone === true,
      });
    };
    read();
    window.addEventListener("resize", read);
    return () => {
      window.removeEventListener("resize", read);
      probe.remove();
    };
  }, []);
  return (
    <div
      className="tsub"
      style={{ textAlign: "center", padding: "2px 12px 8px", color: "var(--muted)", fontSize: 11 }}
    >
      viewport {v.vh} · visual {v.vv} · safe {v.top}/{v.bottom} · standalone {v.dm ? "yes" : "no"} ·
      ios {v.ios ? "yes" : "no"}
    </div>
  );
}

export function SettingsPage() {
  const { state, openSheet, mutate, setMkey, setFilter, toast } = useApp();
  const doc = state.doc!;
  const s = doc.settings;

  const pushNow = async () => {
    if (!gistUnlocked()) {
      openSheet({ name: "gist-unlock" });
      return;
    }
    try {
      await Gist.push(true);
      toast("Backed up to gist");
    } catch (e) {
      toast("Backup failed: " + ((e as Error) && (e as Error).message ? (e as Error).message : e));
    }
  };

  const loadSample = () => {
    if (doc.transactions.length) {
      if (!window.confirm("Replace existing data with sample?")) return;
    }
    mutate((d) => sampleData(d));
    toast("Sample data loaded");
  };

  const resetAll = () => {
    if (!window.confirm("Erase all data and restore defaults?")) return;
    Gist.disconnect();
    mutate((d) => {
      const f = defaultDoc();
      (Object.keys(f) as Array<keyof Doc>).forEach((k) => {
        (d as unknown as Record<string, unknown>)[k as string] = f[k];
      });
    });
    setMkey(monthKey(new Date()));
    setFilter({ q: "", dir: "all", cat: "all", acc: "all", merch: "all" });
    toast("Reset complete");
  };

  const disconnect = () => {
    if (!window.confirm("Stop using this gist for backup?")) return;
    Gist.disconnect();
    toast("Backup disconnected");
  };

  return (
    <div className="scr">
      <header className="scrhdr">
        <div className="hdr-title">Settings</div>
        <div className="hdr-left">
          <button className="cbtn small" onClick={() => openSheet({ name: "export" })} aria-label="Export data">
            {IC.dots}
          </button>
        </div>
      </header>

      <div className="sec-label">Preferences</div>
      <div className="card">
        <div className="slab">
          <button
            className="set"
            onClick={() => mutate((d) => void (d.settings.hideBalances = !d.settings.hideBalances))}
          >
            <span className="s-label">
              Hide balances<div className="s-sub">Blur amount figures</div>
            </span>
            <span className={"switch " + (s.hideBalances ? "on" : "")}></span>
          </button>
        </div>
        <div className="slab">
          <button
            className="set"
            onClick={() =>
              mutate((d) => {
                d.settings.highlightNoMerchant = d.settings.highlightNoMerchant !== false ? false : true;
              })
            }
          >
            <span className="s-label">
              Highlight untagged
              <div className="s-sub">Yellow amounts when no merchant is set</div>
            </span>
            <span className={"switch " + (s.highlightNoMerchant !== false ? "on" : "")}></span>
          </button>
        </div>
        <div className="slab">
          <span className="set" style={{ cursor: "default" }}>
            <span className="s-label">
              Month starts on<div className="s-sub">Budget &amp; overview period start</div>
            </span>
            <select
              className="sel"
              value={s.monthStartDay}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                mutate((d) => void (d.settings.monthStartDay = v));
                toast("Month starts on day " + v);
              }}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((v) => (
                <option key={v} value={v}>
                  Day {v}
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="slab">
          <span className="set" style={{ cursor: "default" }}>
            <span className="s-label">
              Week starts on<div className="s-sub">Calendar first column</div>
            </span>
            <span className="tsub" style={{ fontSize: 14, color: "var(--text-2)" }}>
              Monday
            </span>
          </span>
        </div>
      </div>

      <div className="sec-label">Manage</div>
      <div className="card grid2">
        <button className="set" onClick={() => openSheet({ name: "category-manage" })}>
          <span className="s-label">
            Categories<div className="s-sub">{doc.categories.length} categories</div>
          </span>
          {IC.right}
        </button>
        <button className="set" onClick={() => openSheet({ name: "shortcuts" })}>
          <span className="s-label">
            Shortcuts<div className="s-sub">Quick-fill common transactions</div>
          </span>
          {IC.right}
        </button>
        <button className="set" onClick={() => openSheet({ name: "account-add" })}>
          <span className="s-label">
            Accounts<div className="s-sub">{doc.accounts.length} accounts</div>
          </span>
          {IC.right}
        </button>
        <button className="set" onClick={() => openSheet({ name: "merchant-manage" })}>
          <span className="s-label">
            Merchants<div className="s-sub">{(doc.merchants || []).length} merchants</div>
          </span>
          {IC.right}
        </button>
        <button className="set" onClick={() => openSheet({ name: "pwa-help" })}>
          <span className="s-label">
            Install as app<div className="s-sub">Add to Home Screen — runs offline</div>
          </span>
          {IC.right}
        </button>
      </div>

      <div className="sec-label">Data</div>
      <div className="card grid2">
        <button className="set" onClick={loadSample}>
          <span className="s-label">
            Load sample data<div className="s-sub">Add demo transactions</div>
          </span>
          {IC.right}
        </button>
        <button className="set" onClick={resetAll}>
          <span className="s-label">
            Reset all data<div className="s-sub">Erase everything</div>
          </span>
          {IC.right}
        </button>
      </div>

      <div className="sec-label">Backup</div>
      <div className="card">
        {!gistConnected() ? (
          <button className="set" onClick={() => openSheet({ name: "gist-setup" })}>
            <span className="s-label">
              Encrypted gist backup
              <div className="s-sub">Passphrase + GitHub token · AES-256-GCM</div>
            </span>
            {IC.shield}
          </button>
        ) : gistUnlocked() ? (
          <button className="set" style={{ cursor: "default" }}>
            <span className="s-label">
              Backup on<div className="s-sub">Auto-syncs to a private gist</div>
            </span>
            <span className="switch on"></span>
          </button>
        ) : (
          <button className="set" onClick={() => openSheet({ name: "gist-unlock" })}>
            <span className="s-label">
              Unlock backup<div className="s-sub">Enter passphrase to resume sync</div>
            </span>
            {IC.shield}
          </button>
        )}
        {gistConnected() && (
          <>
            <button className="set" onClick={pushNow}>
              <span className="s-label">
                Push now
                <div className="s-sub">
                  {shortT(
                    doc.settings.gist!.lastPushedAt,
                    gistDirty()
                  )}
                </div>
              </span>
              {IC.refresh}
            </button>
            <button className="set" onClick={() => openSheet({ name: "gist-restore" })}>
              <span className="s-label">
                Restore<div className="s-sub">Pull encrypted snapshot</div>
              </span>
              {IC.refresh}
            </button>
            <button className="set" onClick={disconnect}>
              <span className="s-label">
                Disconnect<div className="s-sub">Stop using this gist</div>
              </span>
            </button>
          </>
        )}
      </div>
      <div className="tsub" style={{ textAlign: "center", padding: "8px 0 12px", color: "var(--muted)" }}>
        Xpend · v0.{APP_VER}
      </div>
      <ViewportDiagnostics />
    </div>
  );
}
