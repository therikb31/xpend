// Account sheets — ports of accAddSheet / accEditSheet / accIconSheet.
// Logo picking is internal step state (legacy used sheet swaps + App._acc*).

import { useState } from "react";
import type { CSSProperties } from "react";
import { AccountAvatar } from "../components/ui";
import { accById } from "../data/finance";
import { init, parseRupeesToPaise, uid } from "../lib/format";
import { ACC_ICONS, IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { AccountKind } from "../types";
import { Grab } from "./Sheet";

function IconGrid({
  cur,
  onPick,
  onClear,
}: {
  cur: string | null | undefined;
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  return (
    <>
      <Grab />
      <div className="sh-title">Account logo</div>
      <div className="search" style={{ marginBottom: 8 }}>
        {IC.search}
        <input type="text" placeholder="Search bank or card" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {(["Banks", "Cards"] as const).map((g, gi) => (
        <div key={g}>
          <div className="sec-label" style={{ marginTop: gi === 0 ? 0 : 12 }}>
            {g}
          </div>
          <div className="ai-grid">
            {Object.keys(ACC_ICONS)
              .filter((k) => ACC_ICONS[k].g === g)
              .filter((k) => {
                const i = ACC_ICONS[k];
                return (i.name + (i.alt ? " " + i.alt : "") + " " + i.g).toLowerCase().includes(query);
              })
              .map((k) => {
                const i = ACC_ICONS[k];
                return (
                  <button key={k} className={"ai-cell " + (cur === k ? "on" : "")} onClick={() => onPick(k)}>
                    <span className="ccircle pic" style={{ ["--c" as string]: "#fff" } as CSSProperties}>
                      <img className="acc-ico" src={i.src} alt={i.name} loading="lazy" />
                    </span>
                    <span className="ai-name">{i.name}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      <button className="set" style={{ marginTop: 16 }} onClick={onClear}>
        <span className="s-label">
          No logo<div className="s-sub">Show the account's initials instead</div>
        </span>
        {IC.x}
      </button>
    </>
  );
}

export function AccountAddSheet() {
  const { mutate, closeSheet, toast } = useApp();
  const [step, setStep] = useState<"main" | "icon">("main");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("cash");
  const [opening, setOpening] = useState("");
  const [secondary, setSecondary] = useState(false);
  const [icon, setIcon] = useState<string | null>(null);

  if (step === "icon") {
    return (
      <IconGrid
        cur={icon}
        onPick={(id) => {
          setIcon(id);
          setStep("main");
        }}
        onClear={() => {
          setIcon(null);
          setStep("main");
        }}
      />
    );
  }

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast("Enter a name");
      return;
    }
    const o = parseRupeesToPaise(opening || "0");
    mutate((d) => {
      const acc = {
        id: "acc-u-" + uid(), name: n, kind, opening: o, color: "#7C9AA6",
        secondary: secondary === true,
      } as (typeof d.accounts)[number];
      if (icon) acc.icon = icon;
      if (kind === "savings") acc.prev = o;
      d.accounts.push(acc);
    });
    closeSheet();
    toast("Account created");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">New account</div>
      <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="chip-row" style={{ marginTop: 4 }}>
        {(["cash", "card", "savings", "goal"] as const).map((k) => (
          <button key={k} className={"chip " + (kind === k ? "on" : "")} onClick={() => setKind(k)}>
            {k === "cash" ? "Cash" : k === "card" ? "Card" : k === "savings" ? "Savings" : "Goal"}
          </button>
        ))}
      </div>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Opening balance (₹)
      </div>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={opening}
        onChange={(e) => setOpening(e.target.value)}
        style={{ marginTop: 0 }}
      />
      <button className="set" style={{ marginTop: 14 }} onClick={() => setSecondary((v) => !v)}>
        <span className="s-label">
          Secondary account<div className="s-sub">Excluded from net worth (e.g. meal card)</div>
        </span>
        <span className={"switch " + (secondary ? "on" : "")}></span>
      </button>
      <button className="set" style={{ marginTop: 14 }} onClick={() => setStep("icon")}>
        <span className="s-label">
          Logo<div className="s-sub">Bank or card logo shown on the account</div>
        </span>
        <span className="csel" id="ai-prev">
          {icon ? (
            <AccountAvatar a={{ id: "tmp", name, kind: "cash", opening: 0, color: "#7C9AA6", icon }} />
          ) : (
            <span className="ccircle" style={{ ["--c" as string]: "#7C9AA6" } as CSSProperties}>
              {init(name || "") || "•"}
            </span>
          )}
        </span>
      </button>
      <button className="btn" style={{ marginTop: 16 }} onClick={save}>
        {IC.plus} Create account
      </button>
    </>
  );
}

export function AccountEditSheet({ id }: { id: string }) {
  const { state } = useApp();
  const doc = state.doc!;
  const a = accById(doc, id);
  if (!a) return null;

  return <AccountEditBody key={id} id={id} />;
}

function AccountEditBody({ id }: { id: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const a = accById(doc, id);
  const [step, setStep] = useState<"main" | "icon">("main");
  const [name, setName] = useState(a.name);
  const [kind, setKind] = useState<AccountKind>(a.kind || "cash");
  const [armed, setArmed] = useState(false);

  if (step === "icon") {
    return (
      <IconGrid
        cur={a.icon}
        onPick={(icon) => {
          mutate((d) => {
            const t = d.accounts.find((x) => x.id === id);
            if (t) t.icon = icon;
          });
          setStep("main");
        }}
        onClear={() => {
          mutate((d) => {
            const t = d.accounts.find((x) => x.id === id);
            if (t) t.icon = null;
          });
          setStep("main");
        }}
      />
    );
  }

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast("Enter a name");
      return;
    }
    mutate((d) => {
      const t = d.accounts.find((x) => x.id === id);
      if (!t) return;
      t.name = n;
      t.kind = kind;
      if (t.kind === "savings" && t.prev == null) t.prev = t.opening || 0;
    });
    closeSheet();
    toast("Account saved");
  };

  const del = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    const first = doc.accounts.find((x) => x.id !== id);
    if (!first) {
      toast("Cannot delete the only account");
      return;
    }
    const delSav = a.kind === "savings";
    mutate((d) => {
      if (delSav) {
        d.transactions = d.transactions.filter(
          (t) => !(t.dir === "trans" && ((t.from === id && t.to === "__prev") || (t.from === "__prev" && t.to === id)))
        );
      }
      d.accounts = d.accounts.filter((x) => x.id !== id);
      d.transactions.forEach((t) => {
        if (t.dir === "trans") {
          if (t.from === id) t.from = first.id;
          if (t.to === id) t.to = first.id;
        } else if (t.accountId === id) {
          t.accountId = first.id;
        }
      });
    });
    closeSheet();
    toast("Account deleted");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Edit account</div>
      <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Type
      </div>
      <div className="chip-row" style={{ marginTop: 0 }}>
        {(["cash", "card", "savings", "goal"] as const).map((k) => (
          <button key={k} className={"chip " + (kind === k ? "on" : "")} onClick={() => setKind(k)}>
            {k === "cash" ? "Cash" : k === "card" ? "Card" : k === "savings" ? "Savings" : "Goal"}
          </button>
        ))}
      </div>
      <div className="tsub" style={{ margin: "6px 2px 10px", color: "var(--muted)" }}>
        Balances come from transactions only. For savings, use "Move between current &amp; previous" on the
        Accounts page.
      </div>
      <button
        className="set"
        onClick={() =>
          mutate((d) => {
            const t = d.accounts.find((x) => x.id === id);
            if (t) t.secondary = !t.secondary;
          })
        }
      >
        <span className="s-label">
          Secondary account<div className="s-sub">Excluded from net worth (e.g. meal card)</div>
        </span>
        <span className={"switch " + (a.secondary ? "on" : "")}></span>
      </button>
      <button className="set" style={{ marginTop: 14 }} onClick={() => setStep("icon")}>
        <span className="s-label">
          Logo<div className="s-sub">Bank or card logo shown on the account</div>
        </span>
        <span className="csel" id="ai-prev">
          <AccountAvatar a={a} />
        </span>
      </button>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button className="btn ghost" style={{ flex: 1 }} onClick={closeSheet}>
          Cancel
        </button>
        <button className="btn" style={{ flex: 1 }} onClick={save}>
          {IC.check} Save
        </button>
      </div>
      <button
        className="btn ghost"
        style={{ width: "100%", marginTop: 12, color: "var(--neg)", borderColor: "rgba(192,91,77,.35)" }}
        onClick={del}
      >
        {IC.trash} {armed ? "Tap again to delete" : "Delete account"}
      </button>
      <div className="tsub" style={{ margin: "6px 2px 2px", color: "var(--muted)" }}>
        Transactions paid from this account move to your first account.
      </div>
    </>
  );
}
