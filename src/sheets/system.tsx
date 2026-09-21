// System sheets â€” ports of expSheet (+exp-copy) / gbSetupSheet / gbUnlockSheet /
// gbRestoreSheet / moreSheet / pwa-help.

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { expData, expLabel } from "../data/finance";
import { C } from "../lib/crypto";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import { Gist, gistCfg } from "../services/gist";
import { Grab } from "./Sheet";

/* ---------------- export JSON dump ---------------- */

export function ExportSheet() {
  const { state, closeSheet, toast } = useApp();
  const doc = state.doc!;
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
  else if (state.view === "summary") count = (dta.entries || []).length;
  else if (state.view === "budget") count = (dta.budgets || []).length;
  else if (state.view === "goals") count = (dta.goals || []).length;
  else if (state.view === "accounts") count = (dta.accounts || []).length;
  else count = dta.transactions ? dta.transactions.length : 0;

  const copy = () => {
    const txt = JSON.stringify(env, null, 2);
    const done = () => {
      closeSheet();
      toast("Copied " + label + " JSON");
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

  return (
    <>
      <Grab />
      <div className="sh-title">Export {label}</div>
      <div className="tsub" style={{ margin: "0 2px 14px", color: "var(--muted)" }}>
        Copies a JSON snapshot of everything shown on this screen â€” names, emojis, totals, counts
        and percentages resolved. Month: {String(env.monthLabel)} Â· {count} items Â· {size}.
      </div>
      <button className="sh-row" onClick={copy}>
        <span className="ccircle" style={{ ["--c" as string]: "rgba(82,229,165,.16)" } as CSSProperties}>
          {IC.share}
        </span>
        <span className="rname">Copy {label} JSON</span>
        {IC.right}
      </button>
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
      toast("Fine-grained tokens don't support gist scope â€” use a classic token (ghp_â€¦)");
      return;
    }
    if (!C.sup()) {
      toast("Backup needs a secure connection â€” open Xpend over https://");
      return;
    }
    closeSheet();
    try {
      const r = await Gist.connect(pass, pat.trim());
      toast(r.restored ? "Restored backup Â· " + r.gistId.slice(0, 7) : "Backup connected");
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
          Backup needs a secure connection. Open Xpend over its https:// link (or localhost) â€” this
          http:// address has WebCrypto disabled by iOS.
        </div>
      )}
      <div className="tsub" style={{ margin: "0 2px 6px" }}>
        1 Â· Generate a token with <b>gist</b> scope (opens github.com)
      </div>
      <a
        className="set gh"
        href="https://github.com/settings/tokens/new?scopes=gist&description=Xpend+backup&default_expires_at=none"
        target="_blank"
        rel="noreferrer"
      >
        {IC.open}
        <span className="s-label">
          Get a GitHub token<div className="s-sub">gist pre-checked Â· no expiry</div>
        </span>
        {IC.right}
      </a>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        2 Â· Paste the token below
      </div>
      <input type="password" placeholder="ghp_â€¦" autoComplete="off" value={pat} onChange={(e) => setPat(e.target.value)} />
      <div className="tsub" style={{ margin: "10px 2px 4px" }}>
        3 Â· Set a passphrase (min 8 chars) â€” kept only in memory
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
      toast("Backup needs a secure connection â€” open Xpend over https://");
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
      toast("Backup needs a secure connection â€” open Xpend over https://");
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
  const { state, setAdd, mutate, closeSheet, toast } = useApp();
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

/* ---------------- PWA install help ---------------- */

export function PwaHelpSheet() {
  return (
    <>
      <Grab />
      <div className="sh-title">Run locally, no server</div>
      <div className="tsub" style={{ margin: "0 2px 8px" }}>
        1 Â· In Safari, tap Share {IC.share}
      </div>
      <div className="tsub" style={{ margin: "0 2px 8px" }}>
        2 Â· Tap <b>Add to Home Screen</b> (Add to Dock on iPadOS)
      </div>
      <div className="tsub" style={{ margin: "0 2px 8px" }}>
        3 Â· Open Xpend from your Home Screen â€” it runs offline with all data stored on the phone
      </div>
      <div className="tsub" style={{ margin: "0 2px 10px", color: "var(--muted)" }}>
        The installed app keeps its secure https origin, so gist backup keeps working with no server
        needed.
      </div>
    </>
  );
}

