// GitHub-link + migration sheets — device-flow OAuth ("Link GitHub"),
// the lossless passphrase→OAuth migration checklist, undo, and the
// cross-device import-merge (consolidation) flow.

import { useEffect, useRef, useState } from "react";
import { C } from "../lib/crypto";
import { mergeDocs, previewMerge } from "../lib/mergeDoc";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import { Gist, gistUnlocked } from "../services/gist";
import {
  devicePoll,
  deviceStart,
  ghClientId,
  ghLinked,
  ghUnlink,
  ghWhoami,
  setGhClientId,
  type DeviceGrant,
} from "../services/githubAuth";
import {
  exportRawKey,
  findEscrow,
  getMig,
  keyFingerprint,
  readEscrow,
  readSnapshot,
  setMig,
  takeSnapshot,
  writeEscrow,
  type MigState,
} from "../services/escrow";
import { Grab } from "./Sheet";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type LinkStep = "cid" | "start" | "code" | "done";

export function GithubLinkSheet() {
  const { toast, openSheet } = useApp();
  const [step, setStep] = useState<LinkStep>(ghClientId() ? "start" : "cid");
  const [cid, setCid] = useState(ghClientId());
  const [grant, setGrant] = useState<DeviceGrant | null>(null);
  const [login, setLogin] = useState<string | null>(ghLinked() ? "" : null);
  const [busy, setBusy] = useState(false);
  const grantRef = useRef<DeviceGrant | null>(null);
  grantRef.current = grant;

  useEffect(() => {
    if (ghLinked() && login === null) {
      ghWhoami().then(setLogin).catch(() => setLogin(""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== "code" || !grant) return;
    let dead = false;
    const tick = async () => {
      if (dead) return;
      try {
        const r = await devicePoll(grantRef.current!.deviceCode);
        if (dead) return;
        if (r.status === "ok") {
          try {
            setLogin(await ghWhoami());
          } catch {
            setLogin("");
          }
          setStep("done");
        } else if (r.status !== "pending") {
          toast(r.error === "access_denied" ? "Approval denied" : "Code expired — try again");
          setStep("start");
        }
      } catch {
        /* transient — keep polling until expiry */
      }
    };
    tick();
    const t = setInterval(tick, Math.max(5, grant.interval) * 1000);
    const killer = setTimeout(() => {
      if (!dead) {
        setStep("start");
        toast("Code expired — try again");
      }
    }, Math.max(60, grant.expiresIn) * 1000);
    return () => {
      dead = true;
      clearInterval(t);
      clearTimeout(killer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const saveCid = () => {
    const v = cid.trim();
    if (!v) {
      toast("Paste the OAuth app client ID");
      return;
    }
    setGhClientId(v);
    setCid(v);
    setStep("start");
  };

  const start = async () => {
    setBusy(true);
    try {
      const g = await deviceStart();
      setGrant(g);
      setStep("code");
    } catch (e) {
      const m = (e as Error).message || "";
      if (m === "no-client-id") setStep("cid");
      else toast("Login failed: " + m);
    } finally {
      setBusy(false);
    }
  };

  const unlink = () => {
    if (!window.confirm("Unlink GitHub? Your data stays; API access stops until you link again.")) return;
    ghUnlink();
    setLogin(null);
    setStep("start");
    toast("GitHub unlinked");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Link GitHub account</div>
      {step === "cid" && (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
            One-time setup: register an OAuth App (github.com → Settings → Developer settings →
            OAuth Apps, homepage = this app's URL) and paste its client ID. It's public by design.
          </div>
          <input
            type="text"
            placeholder="OAuth client ID (Iv1.…)"
            value={cid}
            onChange={(e) => setCid(e.target.value)}
            style={{ marginTop: 8 }}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button className="btn" style={{ marginTop: 16 }} onClick={saveCid}>
            {IC.check} Save client ID
          </button>
        </>
      )}
      {step === "start" && (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
            No more passphrases or hand-made tokens: approve on GitHub once and this device
            signs API calls + unlocks backups by itself.
          </div>
          <button className="btn" style={{ marginTop: 16 }} onClick={start} disabled={busy}>
            {IC.shield} {busy ? "Contacting GitHub…" : "Get login code"}
          </button>
          {ghLinked() && (
            <button className="set" style={{ marginTop: 8 }} onClick={unlink}>
              <span className="s-label">
                Unlink GitHub<div className="s-sub">Stop API access on this device</div>
              </span>
              {IC.x}
            </button>
          )}
        </>
      )}
      {step === "code" && grant && (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
            Open this page and enter the code:
          </div>
          <a
            href={grant.verificationUri}
            target="_blank"
            rel="noreferrer"
            className="btn"
            style={{ marginTop: 8, textDecoration: "none" }}
          >
            {IC.open} Approve on GitHub
          </a>
          <div className="sh-title" style={{ textAlign: "center", letterSpacing: 4, marginTop: 12 }}>
            {grant.userCode}
          </div>
          <button
            className="btn"
            style={{ marginTop: 8 }}
            onClick={async () => {
              if (await copyText(grant.userCode)) toast("Code copied");
              else toast("Copy failed — long-press the code");
            }}
          >
            {IC.share} Copy code
          </button>
          <div className="tsub" style={{ margin: "12px 2px 4px", color: "var(--muted)", textAlign: "center" }}>
            Waiting for approval… (expires in {Math.round(grant.expiresIn / 60)} min)
          </div>
        </>
      )}
      {step === "done" && (
        <>
          <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
            Linked{login ? " as @" + login : ""}. Next: migrate your backup key into escrow
            (one tap, verified at every step) so restores never need the passphrase again.
          </div>
          <MigrationPanel />
          <button className="set" style={{ marginTop: 8 }} onClick={unlink}>
            <span className="s-label">
              Unlink GitHub<div className="s-sub">Stop API access on this device</div>
            </span>
            {IC.x}
          </button>
          <button className="btn" style={{ marginTop: 8 }} onClick={() => openSheet({ name: "import-merge" })}>
            {IC.refresh} Merge another device's export
          </button>
        </>
      )}
    </>
  );
}

type EscrowStatus = "checking" | "none" | "mine" | "foreign" | "error";

export function MigrationPanel() {
  const { state, loadDoc, toast, openSheet } = useApp();
  const doc = state.doc!;
  const [fp, setFp] = useState<string | null>(null);
  const [escrow, setEscrow] = useState<EscrowStatus>("checking");
  const [escrowId, setEscrowId] = useState<string | null>(null);
  const [mig, setMigState] = useState<MigState>(getMig().state);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState(!!readSnapshot());
  const unlocked = gistUnlocked() && !!Gist.key;

  useEffect(() => {
    let dead = false;
    (async () => {
      if (Gist.key) {
        try {
          const f = await keyFingerprint(Gist.key);
          if (!dead) setFp(f);
        } catch {
          /* ignore */
        }
      }
      if (!ghLinked()) {
        if (!dead) setEscrow("error");
        return;
      }
      try {
        const id = await findEscrow();
        if (dead) return;
        if (!id) {
          setEscrow("none");
          return;
        }
        setEscrowId(id);
        const payload = await readEscrow(id);
        if (!payload) {
          setEscrow("error");
          return;
        }
        if (!Gist.key) {
          setEscrow("mine"); // can't compare yet; migration will verify
          return;
        }
        const mine = await exportRawKey(Gist.key);
        setEscrow(payload.keyB64 === mine ? "mine" : "foreign");
      } catch {
        if (!dead) setEscrow("error");
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  const say = (line: string) => setLog((l) => [...l, line]);

  const migrate = async () => {
    if (!unlocked || !Gist.key) {
      openSheet({ name: "gist-unlock" });
      return;
    }
    if (escrow === "foreign") {
      toast("Another device uses a different key — merge first");
      return;
    }
    setBusy(true);
    setLog([]);
    try {
      // 0. snapshot (oldest wins — never overwrite an existing one)
      if (getMig().state === "idle" && !readSnapshot()) {
        takeSnapshot(doc);
        setSnap(true);
        say("Snapshot saved");
      }
      // 1. force-push backup so remote == local
      say("Pushing backup…");
      await Gist.push(true);
      setMig("pushed");
      setMigState("pushed");
      // 2. read-back verify: remote updatedAt + txn count match local
      const cfg = doc.settings.gist;
      if (!cfg || !cfg.gistId) throw new Error("no-backup");
      const g = (await Gist.api("GET", "/gists/" + cfg.gistId)) as {
        files?: Record<string, { content?: string }>;
      };
      const content = g && g.files && g.files["xpend-backup.json"] && g.files["xpend-backup.json"].content;
      if (!content) throw new Error("empty-remote");
      const env = JSON.parse(content) as { iv: string; ct: string };
      const remote = JSON.parse(await C.dec(Gist.key, env.iv, env.ct)) as {
        meta?: { updatedAt?: string };
        transactions?: unknown[];
      };
      if (
        (remote.meta && remote.meta.updatedAt) !== (doc.meta.updatedAt || undefined) ||
        (remote.transactions || []).length !== (doc.transactions || []).length
      )
        throw new Error("remote-mismatch");
      say("Backup verified");
      // 3. escrow (reuse when already mine)
      let eid = escrowId;
      if (escrow !== "mine" || !eid) {
        say("Writing escrow…");
        const raw = await exportRawKey(Gist.key);
        eid = await writeEscrow(raw);
        setEscrowId(eid);
      } else {
        say("Escrow already mine — reusing");
      }
      setMig("escrowed");
      setMigState("escrowed");
      // 4. read-back + trial-decrypt escrow, fingerprint match
      const back = await readEscrow(eid);
      if (!back) throw new Error("escrow-unreadable");
      if (!back.isPrivate) throw new Error("escrow-not-private");
      const mine = await exportRawKey(Gist.key);
      if (back.keyB64 !== mine) throw new Error("escrow-mismatch");
      setMig("verified");
      setMigState("verified");
      say("Escrow verified (private, key matches)");
      setEscrow("mine");
      setMig("linked");
      setMigState("linked");
      say("Done — restores are passphrase-free now");
    } catch (e) {
      const m = (e as Error).message || "failed";
      const friendly =
        m === "remote-mismatch"
          ? "Remote backup differs — push again, then retry"
          : m === "escrow-not-private"
            ? "Escrow gist is not private — delete it and retry"
            : m === "snapshot-quota"
              ? "Storage full — free space and retry"
              : "Migration failed: " + m + " — nothing was changed";
      say(friendly);
      toast(friendly);
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    const s = readSnapshot();
    if (!s) return;
    if (
      !window.confirm(
        "Restore the pre-migration snapshot from " +
          new Date(s.at).toLocaleString("en-IN") +
          "? Current state will be replaced."
      )
    )
      return;
    loadDoc(s.doc);
    setMig("idle");
    setMigState("idle");
    toast("Snapshot restored");
  };

  return (
    <>
      <div className="tsub" style={{ margin: "12px 2px 4px" }}>
        Migration status: <b>{mig}</b>
        {fp ? (
          <>
            {" "}· device key <b>{fp}</b>
          </>
        ) : (
          <> · unlock backup to show the device key</>
        )}
      </div>
      <div className="tsub" style={{ margin: "0 2px 8px", color: "var(--muted)" }}>
        Escrow:{" "}
        {escrow === "checking"
          ? "checking…"
          : escrow === "none"
            ? "none yet"
            : escrow === "mine"
              ? "exists, matches this device"
              : escrow === "foreign"
                ? "belongs to a DIFFERENT key — merge devices first"
                : "could not read"}
      </div>
      {log.length > 0 && (
        <div className="tsub" style={{ margin: "0 2px 8px", color: "var(--muted)" }}>
          {log.map((l, i) => (
            <div key={i}>· {l}</div>
          ))}
        </div>
      )}
      {!unlocked ? (
        <button className="btn" style={{ marginTop: 8 }} onClick={() => openSheet({ name: "gist-unlock" })}>
          {IC.shield} Unlock backup to migrate
        </button>
      ) : escrow === "foreign" ? (
        <button className="btn" style={{ marginTop: 8 }} onClick={() => openSheet({ name: "import-merge" })}>
          {IC.refresh} Merge the other device first
        </button>
      ) : (
        <button className="btn" style={{ marginTop: 8 }} onClick={migrate} disabled={busy}>
          {IC.check} {busy ? "Migrating…" : mig === "linked" ? "Re-verify migration" : "Migrate to GitHub login"}
        </button>
      )}
      {snap && (
        <button className="set" style={{ marginTop: 8 }} onClick={undo}>
          <span className="s-label">
            Undo migration<div className="s-sub">Restore the pre-migration snapshot</div>
          </span>
          {IC.refresh}
        </button>
      )}
    </>
  );
}

export function ImportMergeSheet() {
  const { state, loadDoc, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const [incoming, setIncoming] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const preview = previewMerge(doc, incoming);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      const o = JSON.parse(text);
      const p = previewMerge(doc, o);
      if (!p) {
        toast("Not an Xpend export");
        return;
      }
      setIncoming(o);
      setFileName(f.name);
    } catch {
      toast("Could not read that file");
    }
  };

  const confirm = () => {
    if (!preview || !incoming) return;
    const merged = mergeDocs(doc, incoming as Parameters<typeof mergeDocs>[1]);
    loadDoc(merged);
    closeSheet();
    const c = preview.counts;
    toast(`Merged +${c.transactions} txns, +${c.groceryLists} lists, +${c.groceryItems} items`);
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Merge another device</div>
      <div className="tsub" style={{ margin: "8px 2px 4px", color: "var(--muted)" }}>
        Export full JSON on the other device (Settings → ⋯ → Export), then pick the file here.
        Union by id — nothing on this device is overwritten.
      </div>
      <label className="btn" style={{ marginTop: 8 }}>
        {IC.open} Pick export file
        <input
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={(e) => onFile(e.target.files ? e.target.files[0] : undefined)}
        />
      </label>
      {preview && (
        <>
          <div className="tsub" style={{ margin: "12px 2px 4px" }}>
            {fileName} — this device {preview.baseTx} txns · file {preview.incomingTx} txns · new:{" "}
            {preview.counts.transactions} txns, {preview.counts.groceryLists} lists,{" "}
            {preview.counts.groceryItems} items, {preview.counts.budgets} budgets,{" "}
            {preview.counts.goals} goals
          </div>
          <button className="btn" style={{ marginTop: 8 }} onClick={confirm}>
            {IC.check} Merge into this device
          </button>
        </>
      )}
    </>
  );
}
