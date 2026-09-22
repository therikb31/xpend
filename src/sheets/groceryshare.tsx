// Shared-list sheets — multi-member group lists.
// Key tiers: pair secret per friend (delivery) + group key per list (data).
// New shares: random group key, key envelope per pair-ready member,
// bootstrap #/s/ link (carries the pair secret) per pending member.
// Join (#/s/): stores the pair secret, then direct-decrypt, else the key
// envelope addressed to me. Legacy #/l/ salt links unchanged.

import { useEffect, useState } from "react";
import { C } from "../lib/crypto";
import { listLink, parseInvite, shareLink } from "../lib/friends";
import { useApp } from "../services/store";
import { Gist, gistUnlocked } from "../services/gist";
import { ghLinked, ghWhoami } from "../services/githubAuth";
import { exportRawKey, importRawKey } from "../services/escrow";
import {
  createReplica,
  createReplicaWithKey,
  envelopeMarker,
  findReplica,
  friendGists,
  listKeyLoad,
  listKeySave,
  openEnvelope,
  publishEnvelope,
  pullReplica,
  randomListKey,
  ReplicaError,
  setMyUsername,
  syncState,
} from "../services/grocerySync";
import { IC } from "../lib/icons";
import type { GroceryList } from "../types";
import { Grab } from "./Sheet";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function ApiGate() {
  const { openSheet } = useApp();
  return (
    <>
      <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
        Sharing needs API access: link GitHub or unlock backup first.
      </div>
      <button className="btn" style={{ marginTop: 8 }} onClick={() => openSheet({ name: "github-link" })}>
        {IC.shield} Link GitHub
      </button>
      <button className="set" style={{ marginTop: 8 }} onClick={() => openSheet({ name: "gist-unlock" })}>
        <span className="s-label">
          Unlock backup instead<div className="s-sub">Use the passphrase path</div>
        </span>
        {IC.right}
      </button>
    </>
  );
}

function MissingList({ what }: { what: string }) {
  const { closeSheet } = useApp();
  return (
    <>
      <Grab />
      <div className="sh-title">{what}</div>
      <div className="tsub" style={{ margin: "0 2px 8px", color: "var(--muted)" }}>
        This list no longer exists.
      </div>
      <button className="btn" style={{ marginTop: 16 }} onClick={closeSheet}>
        {IC.check} Done
      </button>
    </>
  );
}

function payloadOf(l: GroceryList): GroceryList {
  return { ...l, share: null, items: (l.items || []).map((i) => ({ ...i })) };
}

function ago(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  return Math.round(m / 60) + "h ago";
}

const ISSUE_HELP: Record<string, string> = {
  "missing-key": "No list key on this device — re-open your invite link.",
  "not-found": "Friend's copy not found — they may have re-shared; ask for a fresh link.",
  decrypt: "Can't decrypt their copy — keys diverged; ask for a fresh invite link.",
  invalid: "Their copy looks corrupt — ask them to check the list.",
  network: "Network/API hiccup — will retry automatically.",
  "push-failed": "Last push failed — will retry on the next change.",
};

/** Live sync readout for a shared list (pushed/pulled/error). Refreshes on
    a short timer while the sheet is open; state lives in the sync module. */
export function SyncStatusLine({ listId }: { listId: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 3000);
    return () => clearInterval(t);
  }, []);
  const st = syncState(listId);
  if (!st.pushedAt && !st.pulledAt && !st.issue) return null;
  return (
    <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
      {st.issue ? (
        <>Sync problem: {ISSUE_HELP[st.issue] || st.issue}</>
      ) : (
        <>
          Pushed {ago(st.pushedAt)} · Pulled {ago(st.pulledAt)}
        </>
      )}
    </div>
  );
}

export function GroceryShareSheet({ listId }: { listId: string }) {
  const { state, mutate, openSheet, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const list = (doc.groceryLists || []).find((l) => l.id === listId);
  const friends = doc.settings.friends || [];
  const linked = ghLinked();
  const canApi = gistUnlocked() || linked;
  const [picked, setPicked] = useState<string[]>([]);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState<string | null>(null);
  const [links, setLinks] = useState<Array<{ user: string; link: string }>>([]);

  useEffect(() => {
    if (!canApi) return;
    const who = linked ? ghWhoami() : Gist.whoami().catch(() => null);
    who.then((l) => {
      if (l) {
        setLogin(l);
        setMyUsername(l);
      }
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!list) return <MissingList what="Share list" />;
  if (!canApi) {
    return (
      <>
        <Grab />
        <div className="sh-title">Share “{list.name}”</div>
        <ApiGate />
      </>
    );
  }

  const peers = (list.share && list.share.peers) || [];
  const members = list.members || [];
  const candidates = friends.filter((f) => !peers.includes(f.githubUsername));
  const toggle = (u: string) =>
    setPicked((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));

  const ensurePair = async (username: string): Promise<{ secret: string; fresh: boolean }> => {
    const ex = (doc.settings.friends || []).find((f) => f.githubUsername === username);
    if (ex && ex.pairSecret) return { secret: ex.pairSecret, fresh: false };
    const raw = await randomListKey();
    const secret = await exportRawKey(raw);
    mutate((d) => {
      if (!Array.isArray(d.settings.friends)) d.settings.friends = [];
      const f = d.settings.friends.find((x) => x.githubUsername === username);
      if (f) f.pairSecret = secret;
      else
        d.settings.friends.push({
          githubUsername: username,
          displayName: username,
          addedAt: Date.now(),
          pairSecret: secret,
        });
    });
    return { secret, fresh: true };
  };

  const shareWith = async (
    usernames: string[],
    groupKeyB64: string,
    groupSalt: string,
    keep: { gistId: string; role: "owner" | "member" } | null
  ) => {
    const me = login || (await Gist.whoami().catch(() => null));
    if (me) {
      setLogin(me);
      setMyUsername(me);
    }
    let gid = keep ? keep.gistId : null;
    let role: "owner" | "member" = keep ? keep.role : "owner";
    if (!gid) {
      const key = await importRawKey(groupKeyB64);
      gid = await createReplicaWithKey(
        payloadOf({ ...list, members: me ? [me.toLowerCase(), ...usernames] : usernames }),
        groupSalt,
        key
      );
      role = "owner";
    }
    const freshLinks: Array<{ user: string; link: string }> = [];
    const auto: string[] = [];
    for (const u of usernames) {
      const { secret, fresh } = await ensurePair(u);
      await publishEnvelope(list.id, u, me || "a-friend", groupKeyB64, secret);
      if (fresh && me) freshLinks.push({ user: u, link: shareLink(list.id, me, secret) });
      else auto.push(u);
    }
    const allPeers = [...new Set([...peers, ...usernames])];
    const allMembers = [...new Set([...members, ...(me ? [me.toLowerCase()] : []), ...usernames])];
    mutate((d) => {
      const l = (d.groceryLists || []).find((x) => x.id === listId);
      if (!l) return;
      l.share = { gistId: gid!, role, peers: allPeers, salt: groupSalt, keyMode: true };
      l.members = allMembers;
      l.updatedAt = Date.now();
    });
    setLinks(freshLinks);
    setPicked([]);
    if (auto.length) toast("Added @" + auto.join(", @") + " — they'll see it shortly");
    if (freshLinks.length && !auto.length) toast("Send the invite link to join them up");
  };

  /** First share: group key + own replica + member setup. */
  const doShare = async () => {
    if (!picked.length) {
      toast("Pick at least one friend");
      return;
    }
    if (!linked && !gistUnlocked()) {
      toast("Unlock backup first");
      return;
    }
    // Legacy path (passphrase era): single member, salt link.
    if (!linked) {
      if (picked.length > 1) {
        toast("Link GitHub for multi-member sharing");
        return;
      }
      if (!pass) {
        toast("Enter your app passphrase");
        return;
      }
      setBusy(true);
      try {
        const s = C.b64(C.rand(16));
        const me = login || (await Gist.whoami().catch(() => null));
        const gid = await createReplica(payloadOf(list), pass, s);
        mutate((d) => {
          const l = (d.groceryLists || []).find((x) => x.id === listId);
          if (!l) return;
          l.share = { gistId: gid, role: "owner", peers: picked, salt: s };
          l.members = [...new Set([...(l.members || []), ...picked])];
          l.updatedAt = Date.now();
        });
        setLinks(me ? [{ user: picked[0], link: listLink(list.id, me, s) }] : []);
        setPicked([]);
        toast("Shared with @" + picked[0]);
      } catch (e) {
        toast("Share failed: " + ((e as Error).message || e));
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const saltMeta = C.b64(C.rand(16));
      const raw = await randomListKey();
      const groupKeyB64 = await exportRawKey(raw);
      await listKeySave(list.id, saltMeta, raw);
      await shareWith(picked, groupKeyB64, saltMeta, null);
    } catch (e) {
      toast("Share failed: " + ((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  /** Add members to an already-shared list. */
  const addMembers = async () => {
    if (!picked.length || !list.share) return;
    setBusy(true);
    try {
      const lk = await listKeyLoad(list.id);
      if (!lk) {
        toast("This device lost the list key — re-open your invite link");
        setBusy(false);
        return;
      }
      const groupKeyB64 = await exportRawKey(lk.key);
      await shareWith(picked, groupKeyB64, lk.salt, { gistId: list.share.gistId, role: list.share.role });
    } catch (e) {
      toast("Add failed: " + ((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    if (!window.confirm("Stop sharing this list? Your copy stays; friends keep theirs.")) return;
    mutate((d) => {
      const l = (d.groceryLists || []).find((x) => x.id === listId);
      if (l) {
        l.share = null;
        l.updatedAt = Date.now();
      }
    });
    closeSheet();
    toast("Sharing off");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Share “{list.name}”</div>
      {list.share && <SyncStatusLine listId={list.id} />}
      {peers.length > 0 && (
        <div className="tsub" style={{ margin: "8px 2px 4px" }}>
          Shared with {peers.map((p) => "@" + p).join(", ")}
        </div>
      )}
      {links.length > 0 && (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px" }}>
            Send {links.length > 1 ? "these links once" : "this link once"} — everything after is automatic:
          </div>
          {links.map((l) => (
            <div key={l.user} className="slab">
              <span className="s-label" style={{ overflowWrap: "anywhere", fontWeight: 400, fontSize: 13 }}>
                @{l.user}: {l.link}
              </span>
              <button
                type="button"
                className="btn mini"
                onClick={async () => {
                  if (await copyText(l.link)) toast("Invite copied — send it to @" + l.user);
                  else toast("Copy failed — long-press the link");
                }}
              >
                Copy
              </button>
            </div>
          ))}
        </>
      )}
      {candidates.length > 0 && (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px" }}>
            {list.share ? "Add members" : "Share with"}
          </div>
          <div className="chip-row" style={{ marginTop: 0 }}>
            {candidates.map((f) => (
              <button
                key={f.githubUsername}
                type="button"
                className={"chip " + (picked.includes(f.githubUsername) ? "on" : "")}
                onClick={() => toggle(f.githubUsername)}
              >
                {f.displayName}
                {f.pairSecret ? " ✓" : ""}
              </button>
            ))}
          </div>
        </>
      )}
      {!friends.length && (
        <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
          No friends yet — add one in Settings → Friends first.
        </div>
      )}
      {!linked && !list.share && (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px" }}>
            App passphrase (same as backup)
          </div>
          <input
            type="password"
            placeholder="Your passphrase"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            style={{ marginTop: 0 }}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </>
      )}
      {(picked.length > 0 || !list.share) && candidates.length > 0 && (
        <button
          className="btn"
          style={{ marginTop: 16 }}
          onClick={list.share ? addMembers : doShare}
          disabled={busy || (list.share ? !picked.length : !picked.length)}
        >
          {IC.share} {busy ? "Working…" : list.share ? "Add to list" : "Share list"}
        </button>
      )}
      {!friends.length && (
        <button className="set" style={{ marginTop: 8 }} onClick={() => openSheet({ name: "friend-add" })}>
          <span className="s-label">
            Add friend<div className="s-sub">Paste their invite link</div>
          </span>
          {IC.plus}
        </button>
      )}
      {list.share && (
        <button className="set" style={{ marginTop: 8 }} onClick={leave}>
          <span className="s-label">
            Stop sharing<div className="s-sub">Your copy stays on this device</div>
          </span>
          {IC.x}
        </button>
      )}
    </>
  );
}

export function GroceryJoinSheet({
  listId,
  from,
  salt,
  keyB64,
}: {
  listId: string;
  from: string;
  salt?: string;
  keyB64?: string;
}) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const canApi = gistUnlocked() || ghLinked();
  const [link, setLink] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = parseInvite(link);
  const effListId = parsed && parsed.kind === "list" ? parsed.name : listId;
  const effFrom = parsed && parsed.kind === "list" ? parsed.username : from;
  const effSalt = parsed && parsed.kind === "list" ? parsed.salt : salt;
  const effKey = parsed && parsed.kind === "list" ? parsed.keyB64 : keyB64;
  const existing = (doc.groceryLists || []).find((l) => l.id === effListId);

  const join = async () => {
    if (existing) {
      toast("You already have this list");
      return;
    }
    if (!effFrom) {
      toast("Paste a valid invite link");
      return;
    }
    if (!effKey && !effSalt) {
      toast("Ask your friend for a fresh link");
      return;
    }
    setBusy(true);
    try {
      // Keyed path (#/s/): the secret doubles as this pair's secret.
      if (effKey) {
        let key: CryptoKey;
        try {
          key = await importRawKey(effKey);
        } catch {
          throw new ReplicaError("invalid");
        }
        const saltMeta = C.b64(C.rand(16));
        await listKeySave(effListId, saltMeta, key);
        // 1. direct decrypt (pair-shared list), 2. key envelope (group list).
        let remote: GroceryList | null = null;
        try {
          remote = await pullWithKey(effFrom, effListId, saltMeta, key);
        } catch (e) {
          if (!(e instanceof ReplicaError) || (e.kind !== "not-found" && e.kind !== "decrypt")) throw e;
          remote = null;
        }
        if (!remote) {
          const g = await friendGists(effFrom);
          const hits = g.filter((x) => (x.description || "").startsWith(envelopeMarker(effListId, "")));
          // Envelope marker ends with the recipient; without a known login,
          // try unwrapping each candidate with the pair secret.
          let groupB64: string | null = null;
          for (const h of hits) {
            groupB64 = await openEnvelope(h.id, effKey);
            if (groupB64) break;
          }
          if (!groupB64) throw new ReplicaError("not-found");
          const gkey = await importRawKey(groupB64);
          await listKeySave(effListId, saltMeta, gkey);
          const gid = await findReplica(effFrom, effListId);
          if (!gid) throw new ReplicaError("not-found");
          try {
            remote = await pullReplica(gid, effListId);
          } catch {
            // Keyed path has no passphrase: undecryptable means stale link.
            throw new ReplicaError("invalid");
          }
        }
        await finishJoin(remote, effFrom, effKey, saltMeta, key, true);
        return;
      }
      // Legacy path (#/l/): passphrase-derived key.
      if (!pass) {
        toast("Enter the shared app passphrase");
        setBusy(false);
        return;
      }
      const key = await C.der(pass, effSalt!);
      await listKeySave(effListId, effSalt!, key);
      const gid = await findReplica(effFrom, effListId);
      if (!gid) throw new ReplicaError("not-found");
      const remote = await pullReplica(gid, effListId);
      await finishJoin(remote, effFrom, null, effSalt!, key, false);
    } catch (e) {
      const m = e instanceof ReplicaError ? e.kind : (e as Error).message || "";
      if (m === "not-found") toast("List not found — ask your friend to re-share");
      else if (m === "decrypt") toast("Wrong passphrase — try again");
      else if (m === "invalid") toast("Invite link invalid — ask for a fresh one");
      else toast("Join failed: " + m);
    } finally {
      setBusy(false);
    }
  };

  const pullWithKey = async (
    username: string,
    lid: string,
    saltMeta: string,
    key: CryptoKey
  ): Promise<GroceryList> => {
    await listKeySave(lid, saltMeta, key);
    const gid = await findReplica(username, lid);
    if (!gid) throw new ReplicaError("not-found");
    return pullReplica(gid, lid);
  };

  const finishJoin = async (
    remote: GroceryList,
    sender: string,
    pairSecret: string | null,
    saltMeta: string,
    key: CryptoKey,
    keyMode: boolean
  ) => {
    const myGistId = await createReplicaWithKey(
      { ...remote, share: null, items: (remote.items || []).map((i) => ({ ...i })) },
      saltMeta,
      key
    );
    const fr = sender.toLowerCase();
    mutate((d) => {
      if (!Array.isArray(d.groceryLists)) d.groceryLists = [];
      if (d.groceryLists.some((x) => x.id === remote.id)) return;
      d.groceryLists.push({
        ...remote,
        items: (remote.items || []).map((i) => ({ ...i })),
        members: [...new Set([...(remote.members || []), fr])],
        share: { gistId: myGistId, role: "member", peers: [...new Set([...(remote.members || []), fr])], salt: saltMeta, keyMode },
      });
      if (!Array.isArray(d.settings.friends)) d.settings.friends = [];
      const f = d.settings.friends.find((x) => x.githubUsername === fr);
      if (pairSecret) {
        if (f) {
          if (f.pairSecret && f.pairSecret !== pairSecret) toast("Sharing key updated for @" + fr);
          f.pairSecret = pairSecret;
        } else {
          d.settings.friends.push({ githubUsername: fr, displayName: fr, addedAt: Date.now(), pairSecret });
        }
      } else if (!f) {
        d.settings.friends.push({ githubUsername: fr, displayName: fr, addedAt: Date.now() });
      }
    });
    closeSheet();
    toast("Joined “" + remote.name + "”");
  };

  if (!canApi) {
    return (
      <>
        <Grab />
        <div className="sh-title">Join shared list</div>
        <ApiGate />
      </>
    );
  }
  return (
    <>
      <Grab />
      <div className="sh-title">Join shared list</div>
      {existing ? (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
            “{existing.name}” is already on this device.
          </div>
          <button className="btn" style={{ marginTop: 16 }} onClick={closeSheet}>
            {IC.check} Done
          </button>
        </>
      ) : (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px" }}>
            {effFrom ? "From @" + effFrom : "Paste the invite link your friend sent"}
          </div>
          <input
            type="text"
            placeholder="https://…/#/l/… or #/s/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            style={{ marginTop: 0 }}
            autoCapitalize="none"
            autoCorrect="off"
          />
          {!effKey && (
            <>
              <div className="tsub" style={{ margin: "8px 2px 4px" }}>
                Shared app passphrase
              </div>
              <input
                type="password"
                placeholder="The one passphrase"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                style={{ marginTop: 0 }}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </>
          )}
          {effKey && (
            <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
              This invite sets up sharing with @{effFrom} — just tap Join.
            </div>
          )}
          <button className="btn" style={{ marginTop: 16 }} onClick={join} disabled={busy}>
            {IC.check} {busy ? "Joining…" : "Join list"}
          </button>
        </>
      )}
    </>
  );
}
