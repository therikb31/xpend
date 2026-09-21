// Shared-list sheets — share a list with a friend (creates my encrypted
// replica + invite link) and join a list from an invite link (pulls the
// sender's replica, creates my own). Two eras:
// - linked (OAuth): random list key carried in #/s/ links — no passphrase.
// - legacy: passphrase-derived key, salt in #/l/ links.
// API access needs backup unlocked OR GitHub linked.

import { useEffect, useState } from "react";
import { C } from "../lib/crypto";
import { listLink, parseInvite, shareLink } from "../lib/friends";
import { useApp } from "../services/store";
import { Gist, gistUnlocked } from "../services/gist";
import { ghLinked } from "../services/githubAuth";
import { exportRawKey, importRawKey } from "../services/escrow";
import {
  createReplica,
  createReplicaWithKey,
  findReplica,
  listKeyLoad,
  listKeySave,
  pullReplica,
  randomListKey,
} from "../services/grocerySync";
import { IC } from "../lib/icons";
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

export function GroceryShareSheet({ listId }: { listId: string }) {
  const { state, mutate, openSheet, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const list = (doc.groceryLists || []).find((l) => l.id === listId);
  const friends = doc.settings.friends || [];
  const linked = ghLinked();
  const canApi = gistUnlocked() || linked;
  const [peer, setPeer] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [inviteKey, setInviteKey] = useState<string | null>(null);

  useEffect(() => {
    if (canApi) Gist.whoami().then(setLogin).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!list || !list.share) return;
    let dead = false;
    listKeyLoad(list.id).then(async (lk) => {
      if (dead) return;
      setHasKey(!!lk);
      if (lk && list.share && list.share.keyMode === true) {
        try {
          const raw = await exportRawKey(lk.key);
          if (!dead) setInviteKey(raw);
        } catch {
          /* ignore */
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list && list.share ? list.id : ""]);

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
  const candidates = friends.filter((f) => !peers.includes(f.githubUsername));

  const payloadOf = (l: typeof list) => ({
    ...l,
    share: null,
    items: (l.items || []).map((i) => ({ ...i })),
  });

  /** Legacy share: passphrase-derived key, salt in the link. */
  const doShareLegacy = async () => {
    if (!peer) {
      toast("Pick a friend to share with");
      return;
    }
    if (!pass) {
      toast("Enter your app passphrase");
      return;
    }
    setBusy(true);
    try {
      const s = C.b64(C.rand(16));
      const gistId = await createReplica(payloadOf(list), pass, s);
      const me = login || (await Gist.whoami());
      setLogin(me);
      mutate((d) => {
        const l = (d.groceryLists || []).find((x) => x.id === listId);
        if (!l) return;
        l.share = { gistId, role: "owner", peers: [peer], salt: s };
        l.updatedAt = Date.now();
      });
      toast("Shared with @" + peer);
    } catch (e) {
      toast("Share failed: " + ((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  /** Linked share: random key carried in the link — no passphrase. */
  const doShareKeyed = async () => {
    if (!peer) {
      toast("Pick a friend to share with");
      return;
    }
    setBusy(true);
    try {
      const s = C.b64(C.rand(16));
      const key = await randomListKey();
      const gistId = await createReplicaWithKey(payloadOf(list), s, key);
      const me = login || (await Gist.whoami());
      setLogin(me);
      setInviteKey(await exportRawKey(key));
      mutate((d) => {
        const l = (d.groceryLists || []).find((x) => x.id === listId);
        if (!l) return;
        l.share = { gistId, role: "owner", peers: [peer], salt: s, keyMode: true };
        l.updatedAt = Date.now();
      });
      toast("Shared with @" + peer);
    } catch (e) {
      toast("Share failed: " + ((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  const addPeer = (username: string) => {
    mutate((d) => {
      const l = (d.groceryLists || []).find((x) => x.id === listId);
      if (!l || !l.share) return;
      if (!l.share.peers.includes(username)) {
        l.share.peers = [...l.share.peers, username];
        l.updatedAt = Date.now();
      }
    });
    setPeer("");
    toast("Added @" + username);
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

  const invite =
    list.share && login
      ? list.share.keyMode === true
        ? inviteKey
          ? shareLink(list.id, login, inviteKey)
          : null
        : list.share.salt
          ? listLink(list.id, login, list.share.salt)
          : null
      : null;

  const reconnectLegacy = async () => {
    if (!list.share || !pass) {
      toast("Enter the shared app passphrase");
      return;
    }
    setBusy(true);
    try {
      const key = await C.der(pass, list.share.salt);
      await listKeySave(list.id, list.share.salt, key);
      setHasKey(true);
      setInviteKey(null);
      toast("List reconnected");
    } catch {
      toast("Wrong passphrase — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Share “{list.name}”</div>
      {!list.share ? (
        <>
          {friends.length ? (
            <>
              <div className="tsub" style={{ margin: "8px 2px 4px" }}>
                Share with
              </div>
              <div className="chip-row" style={{ marginTop: 0 }}>
                {friends.map((f) => (
                  <button
                    key={f.githubUsername}
                    type="button"
                    className={"chip " + (peer === f.githubUsername ? "on" : "")}
                    onClick={() => setPeer(f.githubUsername)}
                  >
                    {f.displayName}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
              No friends yet — add one in Settings → Friends first.
            </div>
          )}
          {!linked && (
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
          <button
            className="btn"
            style={{ marginTop: 16 }}
            onClick={linked ? doShareKeyed : doShareLegacy}
            disabled={busy}
          >
            {IC.share} {busy ? "Sharing…" : "Create invite link"}
          </button>
          {linked && (
            <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
              The invite carries the list key — your friend needs no passphrase.
            </div>
          )}
        </>
      ) : (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px" }}>
            Shared with {peers.length ? peers.map((p) => "@" + p).join(", ") : "nobody yet"}
          </div>
          {invite ? (
            <>
              <div className="tsub" style={{ margin: "8px 2px 4px", overflowWrap: "anywhere", fontSize: 13 }}>
                {invite}
              </div>
              <button
                className="btn"
                style={{ marginTop: 8 }}
                onClick={async () => {
                  if (await copyText(invite)) toast("Invite link copied — send it to your friend");
                  else toast("Copy failed — long-press the link");
                }}
              >
                {IC.share} Copy invite link
              </button>
            </>
          ) : (
            <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
              {hasKey === false
                ? "This device lost the list key."
                : "Preparing invite link…"}
            </div>
          )}
          {hasKey === false &&
            (list.share.keyMode === false ? (
              <>
                <input
                  type="password"
                  placeholder="Shared app passphrase"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  style={{ marginTop: 8 }}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <button className="btn" style={{ marginTop: 8 }} onClick={reconnectLegacy} disabled={busy}>
                  {IC.check} {busy ? "Reconnecting…" : "Reconnect"}
                </button>
              </>
            ) : (
              <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
                Re-open your invite link to reconnect this device.
              </div>
            ))}
          {candidates.length > 0 && (
            <>
              <div className="tsub" style={{ margin: "8px 2px 4px" }}>
                Add another friend
              </div>
              <div className="chip-row" style={{ marginTop: 0 }}>
                {candidates.map((f) => (
                  <button key={f.githubUsername} type="button" className="chip" onClick={() => addPeer(f.githubUsername)}>
                    {f.displayName}
                  </button>
                ))}
              </div>
            </>
          )}
          {!friends.length && (
            <button className="set" style={{ marginTop: 8 }} onClick={() => openSheet({ name: "friend-add" })}>
              <span className="s-label">
                Add friend<div className="s-sub">Paste their invite link</div>
              </span>
              {IC.plus}
            </button>
          )}
          <button className="set" style={{ marginTop: 8 }} onClick={leave}>
            <span className="s-label">
              Stop sharing<div className="s-sub">Your copy stays on this device</div>
            </span>
            {IC.x}
          </button>
        </>
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
      let key: CryptoKey;
      let saltMeta: string;
      let keyMode = false;
      if (effKey) {
        key = await importRawKey(effKey);
        saltMeta = C.b64(C.rand(16));
        keyMode = true;
      } else {
        if (!pass) {
          toast("Enter the shared app passphrase");
          setBusy(false);
          return;
        }
        saltMeta = effSalt!;
        key = await C.der(pass, saltMeta);
      }
      await listKeySave(effListId, saltMeta, key);
      const gid = await findReplica(effFrom, effListId);
      if (!gid) throw new Error("not-found");
      const remote = await pullReplica(gid, effListId);
      if (!remote) throw new Error(effKey ? "bad-link" : "wrong-pass");
      const myGistId = await createReplicaWithKey(
        { ...remote, share: null, items: (remote.items || []).map((i) => ({ ...i })) },
        saltMeta,
        key
      );
      mutate((d) => {
        if (!Array.isArray(d.groceryLists)) d.groceryLists = [];
        if (d.groceryLists.some((x) => x.id === remote.id)) return;
        d.groceryLists.push({
          ...remote,
          items: (remote.items || []).map((i) => ({ ...i })),
          share: {
            gistId: myGistId,
            role: "member",
            peers: [effFrom.toLowerCase()],
            salt: saltMeta,
            keyMode,
          },
        });
        const fr = effFrom.toLowerCase();
        if (!Array.isArray(d.settings.friends)) d.settings.friends = [];
        if (!d.settings.friends.some((f) => f.githubUsername === fr)) {
          d.settings.friends.push({ githubUsername: fr, displayName: fr, addedAt: Date.now() });
        }
      });
      closeSheet();
      toast("Joined “" + remote.name + "”");
    } catch (e) {
      const m = (e as Error).message || "";
      if (m === "not-found") toast("List not found — ask your friend to re-share");
      else if (m === "wrong-pass") toast("Wrong passphrase — try again");
      else if (m === "bad-link") toast("Invite link invalid — ask for a fresh one");
      else toast("Join failed: " + m);
    } finally {
      setBusy(false);
    }
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
              This invite carries the list key — just tap Join.
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
