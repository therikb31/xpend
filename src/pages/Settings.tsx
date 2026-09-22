// Settings — port of App.settings + prefs/backup/data actions.

import { useEffect, useState } from "react";
import { APP_VER, init } from "../lib/format";
import { monthKey } from "../lib/format";
import { friendLink } from "../lib/friends";
import { IC } from "../lib/icons";
import { defaultDoc } from "../data/defaults";
import { sampleData } from "../data/sample";
import type { Doc } from "../types";
import { Gist, gistConnected, gistDirty, gistUnlocked } from "../services/gist";
import { keyFingerprint } from "../services/escrow";
import { ghLinked, ghWhoami } from "../services/githubAuth";
import { useApp } from "../services/store";
import type { Friend } from "../types";

/** Roster sharing state: secret present + recently seen = fully mutual. */
function sharingSub(f: Friend): string {
  if (!f.pairSecret) return " · sharing off — share a list to activate";
  if (!f.lastSeenAt) return " · sharing on · not seen yet";
  const mins = Math.max(0, Math.round((Date.now() - f.lastSeenAt) / 60000));
  const ago = mins < 1 ? "just now" : mins < 60 ? mins + "m ago" : mins < 1440 ? Math.round(mins / 60) + "h ago" : Math.round(mins / 1440) + "d ago";
  return " · sharing on · active " + ago;
}

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
   device (viewport px, visual viewport px, top/bottom insets px, #app rect,
   nav gap px, standalone media match, iOS standalone flag). Inset probe:
   top+bottom with height:auto lets it stretch so its rect reveals both
   insets (never set an explicit height — it over-constrains the box). */
function ViewportDiagnostics() {
  const [v, setV] = useState({ vh: 0, vv: 0, top: 0, bottom: 0, app: "", nav: -1, dm: false, ios: false });
  useEffect(() => {
    const probe = document.createElement("div");
    // NOTE: top+bottom with height:auto lets the probe stretch so its rect
    // reveals both insets. Do NOT set an explicit height here — it
    // over-constrains the box, bottom is dropped, and the reading is garbage.
    probe.style.cssText =
      "position:fixed;top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px);" +
      "left:0;width:1px;pointer-events:none;visibility:hidden";
    document.body.appendChild(probe);
    const read = () => {
      const r = probe.getBoundingClientRect();
      const ar = document.getElementById("app")?.getBoundingClientRect();
      const nr = document.getElementById("nav")?.getBoundingClientRect();
      const vh = window.innerHeight;
      setV({
        vh,
        vv: window.visualViewport ? Math.round(window.visualViewport.height) : 0,
        top: Math.round(r.top),
        bottom: Math.round(vh - r.bottom),
        app: ar ? `${Math.round(ar.top)}/${Math.round(ar.height)}` : "?",
        nav: nr ? Math.round(vh - nr.bottom) : -1,
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
      viewport {v.vh} · visual {v.vv} · safe {v.top}/{v.bottom} · app {v.app} · nav {v.nav} ·
      standalone {v.dm ? "yes" : "no"} · ios {v.ios ? "yes" : "no"}
    </div>
  );
}

export function SettingsPage() {
  const { state, openSheet, mutate, setMkey, setFilter, toast } = useApp();
  const doc = state.doc!;
  const s = doc.settings;
  const friends = s.friends || [];
  const [myLink, setMyLink] = useState<string | null>(null);
  const [fp, setFp] = useState<string | null>(null);
  const [linked, setLinked] = useState(ghLinked());
  const [ghLogin, setGhLogin] = useState<string | null>(null);
  useEffect(() => {
    if (gistUnlocked() && Gist.key) keyFingerprint(Gist.key).then(setFp).catch(() => undefined);
    else setFp(null);
    if (ghLinked()) ghWhoami().then((l) => {
      setLinked(true);
      setGhLogin(l);
    }).catch(() => undefined);
    else {
      setLinked(false);
      setGhLogin(null);
    }
  }, [state.gistVersion, state.booted]);

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

  const makeMyLink = async () => {
    if (linked && ghLogin) {
      setMyLink(friendLink(ghLogin, (s.deviceName || "").trim() || ghLogin));
      return;
    }
    if (!gistUnlocked()) {
      openSheet({ name: "gist-unlock" });
      return;
    }
    try {
      const login = await Gist.whoami();
      setMyLink(friendLink(login, (s.deviceName || "").trim() || login));
    } catch {
      toast("Could not read GitHub login");
    }
  };

  const copyLink = async (link: string, what: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast(what + " copied — send it to your friend");
    } catch {
      toast("Copy failed — long-press the link");
    }
  };

  const shareLink = async (link: string) => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: "Add me on Xpend", url: link });
        return;
      } catch {
        /* dismissed — fall through to copy */
      }
    }
    copyLink(link, "Invite link");
  };

  const removeFriend = (username: string) => {
    if (!window.confirm("Remove " + username + " from friends?")) return;
    mutate((d) => {
      d.settings.friends = (d.settings.friends || []).filter((f) => f.githubUsername !== username);
    });
    toast("Friend removed");
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

      <div className="sec-label">Friends</div>
      <div className="card">
        <div className="slab">
          <span className="set" style={{ cursor: "default" }}>
            <span className="s-label">
              My device name<div className="s-sub">Shown on shared lists</div>
            </span>
            <input
              type="text"
              value={s.deviceName || ""}
              onChange={(e) => mutate((d) => void (d.settings.deviceName = e.target.value))}
              placeholder="My device"
              style={{ marginTop: 0, maxWidth: 150, textAlign: "right" }}
              maxLength={24}
            />
          </span>
        </div>
        {friends.length ? (
          friends.map((f) => (
            <div className="slab" key={f.githubUsername}>
              <span className="set" style={{ cursor: "default" }}>
                {f.avatarUrl ? (
                  <img
                    src={f.avatarUrl}
                    alt=""
                    width={32}
                    height={32}
                    style={{ borderRadius: "50%", flex: "none" }}
                  />
                ) : (
                  <span className="ccircle">{init(f.displayName)}</span>
                )}
                <span className="s-label">
                  {f.displayName}
                  <div className="s-sub">@{f.githubUsername}{sharingSub(f)}</div>
                </span>
              </span>
              <button
                type="button"
                className="row-btn"
                onClick={() => removeFriend(f.githubUsername)}
                aria-label={"Remove " + f.displayName}
              >
                {IC.x}
              </button>
            </div>
          ))
        ) : (
          <div className="tsub" style={{ padding: "2px 2px 8px", color: "var(--muted)" }}>
            No friends yet — add one to share grocery lists.
          </div>
        )}
        <button className="set" onClick={() => openSheet({ name: "friend-add" })}>
          <span className="s-label">
            Add friend<div className="s-sub">Paste their invite link</div>
          </span>
          {IC.plus}
        </button>
        <button className="set" onClick={makeMyLink}>
          <span className="s-label">
            My invite link<div className="s-sub">Share it so a friend can add you</div>
          </span>
          {IC.share}
        </button>
        {myLink && (
          <div className="slab">
            <span className="s-label" style={{ overflowWrap: "anywhere", fontWeight: 400, fontSize: 13 }}>
              {myLink}
            </span>
            <button type="button" className="btn mini" onClick={() => shareLink(myLink)}>
              Share
            </button>
          </div>
        )}
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
        <button className="set" onClick={() => openSheet({ name: "import-merge" })}>
          <span className="s-label">
            Merge another device<div className="s-sub">Union an export file into this device</div>
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
        <button className="set" onClick={() => openSheet({ name: "github-link" })}>
          <span className="s-label">
            {linked ? "GitHub linked" : "Link GitHub account"}
            <div className="s-sub">
              {linked
                ? (ghLogin ? "@" + ghLogin + " · " : "") + "passphrase-free login — tap to manage"
                : "Approve once — no more passphrases or tokens"}
            </div>
          </span>
          {IC.shield}
        </button>
        {fp && (
          <button
            className="set"
            style={{ cursor: "default" }}
            onClick={() => openSheet({ name: "github-link" })}
          >
            <span className="s-label">
              Device key<div className="s-sub">Compare across devices before migrating</div>
            </span>
            <span className="tsub" style={{ fontSize: 14, color: "var(--text-2)" }}>
              {fp}
            </span>
          </button>
        )}
      </div>
      <div className="tsub" style={{ textAlign: "center", padding: "8px 0 12px", color: "var(--muted)" }}>
        Xpend · v0.{APP_VER}
      </div>
      <ViewportDiagnostics />
    </div>
  );
}
