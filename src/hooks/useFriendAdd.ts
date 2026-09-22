// Single friend-add flow for every mode (link-click, link-paste,
// username-add): validate → verify profile → save → signal. Identical
// behavior everywhere by construction — callers only supply the inputs.

import { useCallback, useRef } from "react";
import { cleanUsername, validUsername } from "../lib/friends";
import { useApp } from "../services/store";
import { Gist, gistUnlocked } from "../services/gist";
import { ghLinked } from "../services/githubAuth";
import { followUser, publishAck } from "../services/grocerySync";

export type AddFriendResult = "added" | "updated" | "invalid" | "missing" | "failed";

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

export function useFriendAdd() {
  const { state, mutate, toast } = useApp();
  // Ref-forwarded so link-open effects (mounted once) always see fresh state.
  const ref = useRef({ doc: state.doc, mutate, toast });
  ref.current = { doc: state.doc, mutate, toast };

  const addFriend = useCallback(
    async (username: string, displayName?: string, overwriteName?: boolean): Promise<AddFriendResult> => {
      const { doc, mutate, toast } = ref.current;
      if (!doc) return "failed";
    const u = cleanUsername(username);
    if (!validUsername(u)) {
      toast("Enter a valid GitHub username");
      return "invalid";
    }
    const res = await fetchProfile(u);
    if (res === "missing") {
      toast("No GitHub user @" + u);
      return "missing";
    }
    const profile = res === "offline" ? null : res;
    const n = (displayName || "").trim() || (profile ? profile.name : u);
    const exists = (doc.settings.friends || []).some((f) => f.githubUsername === u);
    mutate((d) => {
      if (!Array.isArray(d.settings.friends)) d.settings.friends = [];
      const f = d.settings.friends.find((x) => x.githubUsername === u);
      if (f) {
        if (overwriteName && n) f.displayName = n;
        else if (!f.displayName || f.displayName === f.githubUsername) f.displayName = n;
        if (profile && profile.avatar && !f.avatarUrl) f.avatarUrl = profile.avatar;
      } else {
        d.settings.friends.push({
          githubUsername: u,
          displayName: n,
          avatarUrl: profile ? profile.avatar : null,
          addedAt: Date.now(),
        });
      }
    });
    // Doorbell signal so they see us back (link-click, paste, typed alike).
    let signaled = false;
    if (gistUnlocked() || ghLinked()) {
      try {
        await followUser(u);
        await publishAck(u);
        signaled = true;
      } catch {
        /* local-only: no API, no signal */
      }
    }
    if (!exists) {
      toast(
        signaled
          ? n + " added — they'll see you back shortly"
          : n + " added" + (profile ? "" : " (unverified — offline?)")
      );
      return "added";
    }
    toast("@" + u + " is already a friend");
    return "updated";
    },
    []
  );

  return addFriend;
}
