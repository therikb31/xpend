// Friend sheets — add a friend by pasting their invite link or entering
// their GitHub username + display name manually. An opened invite link
// (#/f/…) pre-fills via sheet id/id2.

import { useState } from "react";
import { IC } from "../lib/icons";
import { parseInvite } from "../lib/friends";
import { useFriendAdd } from "../hooks/useFriendAdd";
import { useApp } from "../services/store";
import { Grab } from "./Sheet";

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
  const { closeSheet } = useApp();
  const addFriend = useFriendAdd();
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
    setBusy(true);
    // Same shared flow as link-click: validate → save → signal.
    const r = await addFriend(user, display, true);
    setBusy(false);
    if (r === "added" || r === "updated") closeSheet();
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
        Adding follows them on GitHub so they see you back — same as opening their link.
      </div>
    </>
  );
}
