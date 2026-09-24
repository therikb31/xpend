// Management sheets — ports of shortcutsSheet / catManageSheet /
// merchManageSheet / merchAddSheet / merchIconSheet. Nested icon picking is
// internal step state (legacy used sheet swaps with App._merch* globals).

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { MerchantAvatar, MerchantLogoImg } from "../components/ui";
import { catById, merchantCount } from "../data/finance";
import { catEmoji, fallbackEmoji, init, uid } from "../lib/format";
import { IC, MERCH_ICONS } from "../lib/icons";
import { useApp } from "../services/store";
import type { Merchant } from "../types";
import { Grab } from "./Sheet";

const MERCH_COLS = ["#7C9AA6", "#8CA683", "#A68A7C", "#7C8FA6", "#A6A07C", "#A68393", "#9B8CA6", "#83A68C", "#6E8F87", "#C06A5D"];
const CAT_COLS = ["#7C9AA6", "#8CA683", "#A68A7C", "#7C8FA6", "#A6A07C", "#A68393", "#9B8CA6", "#83A68C", "#6E8F87", "#C06A5D"];

/* ---------------- shortcuts ---------------- */

export function ShortcutsSheet() {
  const { state, setAdd, mutate, closeSheet } = useApp();
  const doc = state.doc!;
  const shortcuts = doc.shortcuts || [];
  return (
    <>
      <Grab />
      <div className="sh-title">Shortcuts</div>
      {shortcuts.length ? (
        shortcuts.map((sh) => (
          <div key={sh.id} style={{ display: "flex", alignItems: "center" }}>
            <button
              className="sh-row"
              style={{ flex: 1 }}
              onClick={() => {
                const patch: Record<string, string> = { amount: sh.amount };
                if (sh.dir) patch.dir = sh.dir;
                if (sh.categoryId) patch.categoryId = sh.categoryId;
                if (sh.accountId) patch.accountId = sh.accountId;
                if (sh.merchantId != null) patch.merchantId = sh.merchantId;
                if (sh.name && sh.name !== "Shortcut") patch.note = sh.name;
                setAdd(patch as never);
                closeSheet();
              }}
            >
              <span className="ccircle" style={{ ["--c" as string]: catById(doc, sh.categoryId).color } as CSSProperties}>
                {catEmoji(catById(doc, sh.categoryId))}
              </span>
              <span className="rname">{sh.name || catById(doc, sh.categoryId).name}</span>
            </button>
            <button
              className="cbtn small"
              style={{ background: "transparent", color: "var(--muted)" }}
              onClick={() => mutate((d) => void (d.shortcuts = d.shortcuts.filter((x) => x.id !== sh.id)))}
            >
              {IC.trash}
            </button>
          </div>
        ))
      ) : (
        <div className="empty">
          <div>{IC.star}</div>
          <div className="t">No shortcuts</div>
          <div className="s">Use "⋯" on the entry screen to save one</div>
        </div>
      )}
    </>
  );
}

/* ---------------- category manager ---------------- */

const NEED_LABEL: Record<string, string> = {
  need: "🏠 Needs",
  want: "✨ Wants",
  saving: "🏦 Savings",
};

const NEED_NEXT: Record<string, "need" | "want" | "saving"> = {
  need: "want",
  want: "saving",
  saving: "need",
};

export function CategoryManageSheet() {
  const { state, mutate, toast } = useApp();
  const doc = state.doc!;
  const [name, setName] = useState("");
  const [color, setColor] = useState(CAT_COLS[0]);
  const [kind, setKind] = useState<"expense" | "income">("expense");

  const add = () => {
    const n = name.trim();
    if (!n) {
      toast("Enter a name");
      return;
    }
    if (doc.categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
      toast("Already exists");
      return;
    }
    const id = "cat-u-" + uid();
    mutate((d) => {
      d.categories.push({
        id,
        name: n,
        kind,
        color,
        emoji: fallbackEmoji({ id, name: n }),
        ...(kind === "expense" ? { need: "need" as const } : {}),
      });
    });
    setName("");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">Categories</div>
      {doc.categories.map((c) => {
        const custom = c.id.startsWith("cat-u-");
        return (
          <div key={c.id} style={{ display: "flex", alignItems: "center" }}>
            <span className="sh-row" style={{ flex: 1, pointerEvents: "none" }}>
              <span className="ccircle" style={{ ["--c" as string]: c.color } as CSSProperties}>
                {catEmoji(c)}
              </span>
              <span className="rname">{c.name}</span>
              {c.kind === "income" && <span className="rbal">{c.kind}</span>}
            </span>
            {c.kind === "expense" && (
              <button
                type="button"
                className="chip"
                style={{ marginLeft: 8, padding: "4px 10px", fontSize: 12 }}
                onClick={() =>
                  mutate((d) => {
                    const t = d.categories.find((x) => x.id === c.id);
                    if (t) t.need = NEED_NEXT[t.need || "need"];
                  })
                }
                aria-label={"Tag for " + c.name}
              >
                {NEED_LABEL[c.need || "need"]}
              </button>
            )}
            {custom && (
              <button
                className="cbtn small"
                style={{ background: "transparent", color: "var(--muted)" }}
                onClick={() =>
                  mutate((d) => {
                    d.categories = d.categories.filter((x) => x.id !== c.id);
                    d.transactions.forEach((t) => {
                      if (t.dir !== "trans" && t.categoryId === c.id) t.categoryId = "cat-ext";
                    });
                  })
                }
              >
                {IC.trash}
              </button>
            )}
          </div>
        );
      })}
      <div className="sec-label">Add custom</div>
      <input type="text" id="cc-n" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="chip-row" style={{ margin: 0 }}>
        {CAT_COLS.map((col) => (
          <button
            key={col}
            className={"chip " + (color === col ? "on" : "")}
            onClick={() => setColor(col)}
          >
            <span className="dot" style={{ ["--c" as string]: col } as CSSProperties} />
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          className="btn ghost mini"
          onClick={() => setKind((k) => (k === "expense" ? "income" : "expense"))}
        >
          {kind === "expense" ? "Expense" : "Income"}
        </button>
        <button className="btn mini" onClick={add}>
          {IC.plus} Add category
        </button>
      </div>
    </>
  );
}

/* ---------------- merchant manager ---------------- */

export function MerchantManageSheet() {
  const { state, mutate, openSheet, toast } = useApp();
  const doc = state.doc!;
  const cnt = merchantCount(doc);
  const [armed, setArmed] = useState<string | null>(null);
  const mts = useMemo(
    () => (doc.merchants || []).slice().sort((a, b) => (cnt[b.id] || 0) - (cnt[a.id] || 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.merchants, doc.transactions]
  );
  return (
    <>
      <Grab />
      <div className="sh-title">Merchants</div>
      {mts.length ? (
        mts.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center" }}>
            <button
              className="sh-row"
              style={{ flex: 1 }}
              onClick={() => openSheet({ name: "merchant-edit", id: m.id })}
            >
              <MerchantAvatar m={m} />
              <span className="rname">{m.name}</span>
              {IC.right}
            </button>
            <button
              className="cbtn small"
              style={{ background: "transparent", color: "var(--muted)" }}
              onClick={() => {
                if (armed !== m.id) {
                  setArmed(m.id);
                  return;
                }
                mutate((d) => {
                  d.merchants = d.merchants.filter((x) => x.id !== m.id);
                  if (m.name) {
                    if (!d.settings.merchHidden) d.settings.merchHidden = [];
                    const key = m.name.toLowerCase();
                    if (!d.settings.merchHidden.includes(key)) d.settings.merchHidden.push(key);
                  }
                });
                setArmed(null);
                toast("Merchant deleted");
              }}
            >
              {IC.trash}
            </button>
          </div>
        ))
      ) : (
        <div className="empty">
          <div>🏷️</div>
          <div className="t">No merchants</div>
          <div className="s">Add merchants to tag where each expense happens</div>
        </div>
      )}
      <button className="btn" style={{ marginTop: 16 }} onClick={() => openSheet({ name: "merchant-edit" })}>
        {IC.plus} New merchant
      </button>
    </>
  );
}

/* ---------------- merchant editor (new + edit, with icon step) ---------------- */

export function MerchantEditorSheet({ id }: { id?: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const existing = id ? doc.merchants.find((x) => x.id === id) : undefined;

  const [step, setStep] = useState<"main" | "icon">("main");
  const [name, setName] = useState(existing ? existing.name : "");
  const [color, setColor] = useState(existing ? existing.color || "#7C9AA6" : "#7C9AA6");
  const [icon, setIcon] = useState<string | null>(existing ? existing.icon || null : null);
  const [iconUrl, setIconUrl] = useState(existing ? existing.iconUrl || "" : "");
  const [logoScale, setLogoScale] = useState(existing ? existing.logoScale || 100 : 100);
  const [url, setUrl] = useState(existing ? existing.iconUrl || "" : "");
  const [query, setQuery] = useState("");

  const preview: Merchant = {
    id: "preview",
    name: name || "N",
    icon,
    iconUrl: iconUrl || null,
    color,
    logoScale,
  };

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast("Enter a name");
      return;
    }
    if (doc.merchants.some((x) => x.name.toLowerCase() === n.toLowerCase() && x.id !== id)) {
      toast("Already exists");
      return;
    }
    const data = { name: n, icon, iconUrl: iconUrl || null, color, logoScale: +logoScale || 100 };
    mutate((d) => {
      if (id) {
        const m = d.merchants.find((x) => x.id === id);
        if (m) Object.assign(m, data);
      } else {
        d.merchants.push({ id: "mer-u-" + uid(), createdAt: Date.now(), ...data });
      }
    });
    closeSheet();
    toast(id ? "Merchant updated" : "Merchant created");
  };

  if (step === "icon") {
    const groups = Object.keys(MERCH_ICONS)
      .map((k) => MERCH_ICONS[k].g)
      .filter((g, i, a) => a.indexOf(g) === i);
    const q = query.trim().toLowerCase();
    return (
      <>
        <Grab />
        <div className="sh-title">Merchant logo</div>
        <div className="sec-label">Uploaded image</div>
        <div className="mi-url-box">
          <div className="mi-url-prev" id="mi-url-prev">
            {url ? (
              <img
                className="acc-ico"
                src={url}
                alt="logo"
                onError={(e) => void ((e.target as HTMLImageElement).style.visibility = "hidden")}
              />
            ) : (
              <span className="mi-url-ph">URL</span>
            )}
          </div>
          <input
            type="text"
            id="mi-url"
            placeholder="Paste a logo image URL (https://…)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <button
          className="btn"
          style={{ margin: "8px 0 4px" }}
          disabled={!url}
          onClick={() => {
            const v = url.trim();
            if (!v) {
              toast("Paste an image URL first");
              return;
            }
            if (!/^(https?:\/\/|data:image\/)/i.test(v)) {
              toast("Enter an http(s) or image data URL");
              return;
            }
            setIconUrl(v);
            setIcon(null);
            setStep("main");
          }}
        >
          {IC.check} Use this image
        </button>
        <div className="sec-label" style={{ marginTop: 8 }}>
          Or pick a preset
        </div>
        <div className="search" style={{ marginBottom: 8 }}>
          {IC.search}
          <input type="text" placeholder="Search app or service" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {groups.map((g, gi) => (
          <div key={g}>
            <div className="sec-label" style={{ marginTop: gi === 0 ? 0 : 12 }}>
              {g}
            </div>
            <div className="ai-grid">
              {Object.keys(MERCH_ICONS)
                .filter((k) => MERCH_ICONS[k].g === g)
                .filter((k) => {
                  const i = MERCH_ICONS[k];
                  return (i.name + " " + i.g).toLowerCase().includes(q);
                })
                .map((k) => {
                  const i = MERCH_ICONS[k];
                  return (
                    <button
                      key={k}
                      className={"ai-cell " + (icon === k && !iconUrl ? "on" : "")}
                      onClick={() => {
                        setIcon(k);
                        setIconUrl("");
                        setStep("main");
                      }}
                    >
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
        <button
          className="set"
          style={{ marginTop: 16 }}
          onClick={() => {
            setIcon(null);
            setIconUrl("");
            setStep("main");
          }}
        >
          <span className="s-label">
            No logo<div className="s-sub">Show the merchant's initials instead</div>
          </span>
          {IC.x}
        </button>
      </>
    );
  }

  return (
    <>
      <Grab />
      <div className="sh-title">{id ? "Edit merchant" : "New merchant"}</div>
      <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Colour
      </div>
      <div className="chip-row" style={{ margin: 0 }}>
        {MERCH_COLS.map((col) => (
          <button
            key={col}
            className={"chip " + (color === col ? "on" : "")}
            onClick={() => setColor(col)}
          >
            <span className="dot" style={{ ["--c" as string]: col } as CSSProperties} />
          </button>
        ))}
      </div>
      <button className="set" style={{ marginTop: 14 }} onClick={() => setStep("icon")}>
        <span className="s-label">
          Logo<div className="s-sub">App or service logo shown as the merchant icon</div>
        </span>
        <span className="csel" id="mi-prev">
          <span className="sum-ic logo" style={{ ["--c" as string]: color } as CSSProperties}>
            {icon || iconUrl ? (
              <MerchantLogoImg m={preview} />
            ) : (
              <span className="acc-ico no-img">{init(name || "N")}</span>
            )}
          </span>
        </span>
      </button>
      <div className="mm-ls-row">
        <span className="s-label" style={{ fontSize: 13.5, fontWeight: 600 }}>
          Logo size
        </span>
        <span id="mm-ls-val" className="mm-ls-val">
          {logoScale}%
        </span>
        <input
          type="range"
          id="mm-ls"
          min={50}
          max={150}
          step={5}
          value={logoScale}
          onChange={(e) => setLogoScale(+e.target.value)}
        />
      </div>
      <button className="btn" style={{ marginTop: 16 }} onClick={save}>
        {IC.check} {id ? "Save merchant" : "Create merchant"}
      </button>
    </>
  );
}
