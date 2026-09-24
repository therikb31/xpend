// Settings — port of App.settings + prefs/backup/data actions.

import { useEffect, useState } from "react";
import { APP_VER, init } from "../lib/format";
import { monthKey } from "../lib/format";
import { friendLink } from "../lib/friends";
import { IC } from "../lib/icons";
import { defaultDoc } from "../data/defaults";
import type { Doc } from "../types";
import { Gist, gistConnected, gistDirty, gistUnlocked } from "../services/gist";
import { keyFingerprint } from "../services/escrow";
import { ghLinked, ghWhoami } from "../services/githubAuth";
import {
  DEFAULT_MODEL, clearKey, fetchModels, getKey, getModel, setKey, setModel, verifyKey, wipeAiLocal,
} from "../services/ai";
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

export function SettingsPage() {
  const { state, openSheet, mutate, setMkey, setFilter, toast } = useApp();
  const doc = state.doc!;
  const s = doc.settings;
  const friends = s.friends || [];
  const [myLink, setMyLink] = useState<string | null>(null);
  const [armReset, setArmReset] = useState(false);
  const [resetText, setResetText] = useState("");
  const [fp, setFp] = useState<string | null>(null);
  const [linked, setLinked] = useState(ghLinked());
  const [ghLogin, setGhLogin] = useState<string | null>(null);
  const [aiKey, setAiKey] = useState("");
  const [aiModel, setAiModel] = useState(getModel());
  const [aiOn, setAiOn] = useState(!!getKey());
  const [aiMsg, setAiMsg] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
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

  const saveVerifyKey = async () => {
    const k = aiKey.trim();
    if (!k) {
      toast("Paste an OpenRouter key first");
      return;
    }
    setAiBusy(true);
    setAiMsg("Checking key…");
    const r = await verifyKey(k);
    setAiBusy(false);
    if (!r.ok) {
      setAiMsg(r.error ? r.error.message : "Key check failed.");
      return;
    }
    setKey(k);
    setAiKey("");
    setAiOn(true);
    const left = r.limit_remaining;
    setAiMsg(
      "Key live" +
        (r.label ? ` · ${r.label}` : "") +
        (left == null ? " · no cap set — add one!" : ` · $${left.toFixed(2)} cap left`) +
        (r.usage_daily != null ? ` · $${r.usage_daily.toFixed(3)} used today` : "")
    );
    toast("AI key saved");
  };

  const saveModel = async () => {
    const m = aiModel.trim() || DEFAULT_MODEL;
    setModel(m);
    setAiModel(m);
    if (m === DEFAULT_MODEL) {
      toast("Model reset to default");
      return;
    }
    setAiMsg("Checking model…");
    try {
      const ids = await fetchModels();
      if (!ids.includes(m)) {
        setAiMsg("Not on OpenRouter's model list — check the ID (saved anyway).");
        return;
      }
      setAiMsg("Model OK · " + m);
      toast("Model saved");
    } catch {
      setAiMsg("Couldn't reach the model list — saved anyway.");
    }
  };

  const removeAiKey = () => {
    clearKey();
    setAiKey("");
    setAiOn(false);
    setAiMsg("Key removed from this device.");
  };

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

  const RESET_SENTENCE = "ERASE EVERYTHING";

  const resetAll = () => {
    if (resetText.trim() !== RESET_SENTENCE) return;
    Gist.disconnect();
    wipeAiLocal();
    setAiKey("");
    setAiModel(DEFAULT_MODEL);
    setAiOn(false);
    setAiMsg("");
    mutate((d) => {
      const f = defaultDoc();
      (Object.keys(f) as Array<keyof Doc>).forEach((k) => {
        (d as unknown as Record<string, unknown>)[k as string] = f[k];
      });
    });
    setMkey(monthKey(new Date()));
    setFilter({ q: "", dir: "all", cat: "all", acc: "all", merch: "all", bucket: "all" });
    setArmReset(false);
    setResetText("");
    toast("Reset complete");
  };

  const disconnect = () => {
    if (!window.confirm("Stop using this gist for backup?")) return;
    Gist.disconnect();
    toast("Backup disconnected");
  };

  const makeMyLink = async () => {
    // Prefer a fresh lookup: component state can predate an in-app link.
    if (ghLinked()) {
      try {
        const login = await ghWhoami();
        setLinked(true);
        setGhLogin(login);
        setMyLink(friendLink(login, (s.deviceName || "").trim() || login));
        return;
      } catch {
        /* fall through to unlock path */
      }
    }
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
              Chart scale<div className="s-sub">Daily bars: linear, cube-root, or log</div>
            </span>
            <span className="chip-row" style={{ margin: 0, padding: 0 }}>
              {(["lin", "cbrt", "log"] as const).map((lbl, i) => (
                <button
                  key={lbl}
                  type="button"
                  className={"chip " + ((s.chartScale ?? 1) === i ? "on" : "")}
                  onClick={() => mutate((d) => void (d.settings.chartScale = i as 0 | 1 | 2))}
                >
                  {lbl}
                </button>
              ))}
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

      <div className="sec-label">AI assistant</div>
      <div className="card">
        <div className="slab">
          <span className="set" style={{ cursor: "default" }}>
            <span className="s-label">
              Status
              <div className="s-sub">{aiOn ? "Key saved on this device" : "No key — chat is off"}</div>
            </span>
            <span className={"pill " + (aiOn ? "on" : "")}>{aiOn ? "On" : "Off"}</span>
          </span>
        </div>
        {!aiOn && (
          <>
            <div className="slab">
              <span className="set" style={{ cursor: "default" }}>
                <span className="s-label">
                  OpenRouter key
                  <div className="s-sub">Device-only · never synced · use a capped key</div>
                </span>
                <input
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder="sk-or-v1-…"
                  style={{ marginTop: 0, maxWidth: 150, textAlign: "right" }}
                  autoComplete="off"
                />
              </span>
            </div>
            <button className="set" onClick={saveVerifyKey}>
              <span className="s-label">
                Save &amp; verify key
                <div className="s-sub">{aiBusy ? "Checking…" : aiMsg || "Checks key + shows spend"}</div>
              </span>
              {IC.check}
            </button>
          </>
        )}
        {aiOn && aiMsg ? (
          <div className="tsub" style={{ padding: "2px 2px 8px", color: "var(--muted)" }}>
            {aiMsg}
          </div>
        ) : null}
        <div className="slab">
          <span className="set" style={{ cursor: "default" }}>
            <span className="s-label">
              Model
              <div className="s-sub">Default: {DEFAULT_MODEL}</div>
            </span>
            <input
              type="text"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder={DEFAULT_MODEL}
              style={{ marginTop: 0, maxWidth: 150, textAlign: "right" }}
              autoComplete="off"
              spellCheck={false}
            />
          </span>
        </div>
        <button className="set" onClick={saveModel}>
          <span className="s-label">
            Save model
            <div className="s-sub">Validated against OpenRouter's list</div>
          </span>
          {IC.right}
        </button>
        <div className="tsub" style={{ padding: "2px 2px 8px", color: "var(--muted)" }}>
          Aggregates + labeled transactions leave the device per question; free-text notes never do.
          Advice is general info only.
        </div>
        {aiOn && (
          <button className="set" onClick={removeAiKey}>
            <span className="s-label">
              Remove key
              <div className="s-sub">Deletes it — add a new one anytime</div>
            </span>
            {IC.x}
          </button>
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
        <button
          className="set"
          onClick={() => {
            setArmReset((v) => !v);
            setResetText("");
          }}
        >
          <span className="s-label">
            Reset all data<div className="s-sub">Erase everything</div>
          </span>
          {IC.right}
        </button>
        {armReset && (
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="tsub" style={{ margin: "4px 2px", color: "var(--muted)" }}>
              Type ERASE EVERYTHING below to confirm. This cannot be undone.
            </div>
            <input
              type="text"
              placeholder="ERASE EVERYTHING"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              style={{ marginTop: 0 }}
              autoCapitalize="characters"
              autoCorrect="off"
            />
            <button
              className="btn"
              style={{ marginTop: 8, opacity: resetText.trim() === RESET_SENTENCE ? 1 : 0.45 }}
              onClick={resetAll}
              disabled={resetText.trim() !== RESET_SENTENCE}
            >
              {IC.trash} Erase everything
            </button>
          </div>
        )}
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
    </div>
  );
}
