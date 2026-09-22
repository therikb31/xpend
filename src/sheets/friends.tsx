// Friend sheets — add a friend by pasting their invite link or entering
// their GitHub username + display name manually. An opened invite link
// (#/f/…) pre-fills via sheet id/id2.

import { useState } from "react";
import { IC } from "../lib/icons";
import { cleanUsername, parseInvite, validUsername } from "../lib/friends";
import { Gist } from "../services/gist";
import { useApp } from "../services/store";
import { Grab } from "./Sheet";

async function fetchProfile(
  username: string
): Promise<{ name: string; avatar: string | null } | "missing" | "offline"> {
  try {
    const u = (await Gist.api("GET", "/users/" + encodeURIComponent(username))) as {
      login?: string;
      name?: string | null;
      avatar_url?: string | null;
    };
    if (!u || !u.login) return "missing";
    return { name: (u.name || "").trim() || u.login, avatar: u.avatar_url || null };
  } catch (e) {
    const m = (e as Error).message || "";
    if (/not found|404/i.test(m)) return "missing";
    return "offline";
  }
}

/** Browser landing for invite links opened outside the installed app
    (iOS Safari storage is separate from the PWA): copy + guided handoff. */
export function OpenInAppSheet({ link, kind }: { link: string; kind: string }) {
  const { closeSheet, toast } = useApp();
  const isFriend = kind === "friend";
  return (
    <>
      <Grab />
      <div className="sh-title">Finish in your Xpend app</div>
      <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
        This opened in the browser, which keeps separate data from your installed app. Copy the
        invite, then {isFriend ? "in the app go to Settings → Friends → Add friend" : "in the app go to Groceries → Join"} and
        paste it there.
      </div>
      <div className="tsub" style={{ margin: "8px 2px 4px", overflowWrap: "anywhere", fontSize: 13 }}>
        {link}
      </div>
      <button
        className="btn"
        style={{ marginTop: 8 }}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            toast("Invite copied — paste it in your app");
          } catch {
            toast("Copy failed — long-press the link");
          }
        }}
      >
        {IC.share} Copy invite
      </button>
      <button className="set" style={{ marginTop: 8 }} onClick={closeSheet}>
        <span className="s-label">
          Dismiss<div className="s-sub">Nothing was changed here</div>
        </span>
        {IC.check}
      </button>
    </>
  );
}

export function FriendAddSheet({ username, name }: { username?: string; name?: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const [link, setLink] = useState("");
  const [user, setUser] = useState(username || "");
  const [display, setDisplay] = useState(name || "");
  const [busy, setBusy] = useState(false);

  const onLink = (v: string) => {
    setLink(v);
    const p = parseInvite(v);
    if (p && p.kind === "friend") {
      setUser(p.username);
      setDisplay(p.name);
    }
  };

  const save = async () => {
    const u = cleanUsername(user);
    if (!validUsername(u)) {
      toast("Enter a valid GitHub username");
      return;
    }
    setBusy(true);
    // Verify against the GitHub profile: missing aborts, offline saves raw.
    const res = await fetchProfile(u);
    if (res === "missing") {
      toast("No GitHub user @" + u);
      setBusy(false);
      return;
    }
    const profile = res === "offline" ? null : res;
    const verified = res !== "offline";
    const n = display.trim() || (profile ? profile.name : u);
    const exists = (doc.settings.friends || []).some((f) => f.githubUsername === u);
    mutate((d) => {
      if (!Array.isArray(d.settings.friends)) d.settings.friends = [];
      const f = d.settings.friends.find((x) => x.githubUsername === u);
      if (f) {
        f.displayName = n;
        if (profile && profile.avatar) f.avatarUrl = profile.avatar;
      } else {
        d.settings.friends.push({
          githubUsername: u,
          displayName: n,
          avatarUrl: profile ? profile.avatar : null,
          addedAt: Date.now(),
        });
      }
    });
    setBusy(false);
    closeSheet();
    toast(exists ? "Friend updated" : verified ? "Friend added" : "Friend saved (unverified — offline?)");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Add friend</div>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Paste their invite link
      </div>
      <input
        type="text"
        placeholder="https://…/#/f/username/Name"
        value={link}
        onChange={(e) => onLink(e.target.value)}
        style={{ marginTop: 0 }}
        autoCapitalize="none"
        autoCorrect="off"
      />
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Or enter manually
      </div>
      <input
        type="text"
        placeholder="GitHub username"
        value={user}
        onChange={(e) => setUser(e.target.value)}
        style={{ marginTop: 0 }}
        autoCapitalize="none"
        autoCorrect="off"
      />
      <input
        type="text"
        placeholder="Display name"
        value={display}
        onChange={(e) => setDisplay(e.target.value)}
        style={{ marginTop: 8 }}
      />
      <button className="btn" style={{ marginTop: 16 }} onClick={save} disabled={busy}>
        {IC.check} {busy ? "Checking…" : "Add friend"}
      </button>
      <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
        Friend links only add the name — sharing switches on with the first shared list.
      </div>
    </>
  );
}
