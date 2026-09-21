// Friend sheets — add a friend by pasting their invite link or entering
// their GitHub username + display name manually. An opened invite link
// (#/f/…) pre-fills via sheet id/id2.

import { useState } from "react";
import { IC } from "../lib/icons";
import { cleanUsername, parseInvite, validUsername } from "../lib/friends";
import { useApp } from "../services/store";
import { Grab } from "./Sheet";

export function FriendAddSheet({ username, name }: { username?: string; name?: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const [link, setLink] = useState("");
  const [user, setUser] = useState(username || "");
  const [display, setDisplay] = useState(name || "");

  const onLink = (v: string) => {
    setLink(v);
    const p = parseInvite(v);
    if (p && p.kind === "friend") {
      setUser(p.username);
      setDisplay(p.name);
    }
  };

  const save = () => {
    const u = cleanUsername(user);
    if (!validUsername(u)) {
      toast("Enter a valid GitHub username");
      return;
    }
    const n = display.trim() || u;
    const exists = (doc.settings.friends || []).some((f) => f.githubUsername === u);
    mutate((d) => {
      if (!Array.isArray(d.settings.friends)) d.settings.friends = [];
      if (exists) {
        const f = d.settings.friends.find((x) => x.githubUsername === u);
        if (f) f.displayName = n;
      } else {
        d.settings.friends.push({ githubUsername: u, displayName: n, addedAt: Date.now() });
      }
    });
    closeSheet();
    toast(exists ? "Friend updated" : "Friend added");
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
      <button className="btn" style={{ marginTop: 16 }} onClick={save}>
        {IC.check} Add friend
      </button>
    </>
  );
}
