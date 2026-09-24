// Grocery sheets — item add/edit (name + qty + expected date) and
// list create/rename/delete. Expected date is picked via day chips backed
// by a plain date input; deletes are tombstones for shared-list merges.

import { useRef, useState } from "react";
import { addDaysStr, deviceName, findGroceryItem } from "../lib/grocery";
import { dayLabel, todayStr, uid } from "../lib/format";
import { MAX_LINKS, buildLink, faviconFor, normalizeUrl } from "../lib/unfurl";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import type { BuyLink } from "../types";
import { Grab } from "./Sheet";
import { CalGrid } from "./pickers";

const UNITS = ["unit", "kg", "ml"] as const;
type QtyUnit = (typeof UNITS)[number] | "custom";

/* Split a stored qty string ("2 kg", "500 ml", legacy free text) into
   stepper number + unit pick + preserved custom text. Never loses data:
   unrecognized remainders ride along as custom. */
function parseQty(raw: string): { n: string; unit: QtyUnit; custom: string } {  const m = /^\s*(\d{1,3})\s*(.*)$/.exec(raw || "");
  if (!m) {
    const rest = (raw || "").trim();
    return { n: "", unit: "unit", custom: rest };
  }
  const rest = m[2].trim();
  const hit = UNITS.find((u) => rest.toLowerCase() === u || rest.toLowerCase() === u + "s");
  if (hit) return { n: m[1], unit: hit, custom: "" };
  return { n: m[1], unit: "custom", custom: rest };
}

const REVEAL_W = 96;

/* Buy-link row: tap anywhere opens the link; swipe left reveals
   Rename | Delete. Dragging suppresses the tap so swipes never navigate. */
function LinkCard({
  l, editing, editValue, onEditStart, onEditChange, onEditCommit, onDelete,
}: {
  l: BuyLink;
  editing: boolean;
  editValue: string;
  onEditStart: () => void;
  onEditChange: (v: string) => void;
  onEditCommit: () => void;
  onDelete: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const close = () => {
    setOpen(false);
    setDx(0);
  };
  const go = () => {
    window.open(l.url, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="link-reveal">
      <div className="link-under">
        <button
          type="button"
          aria-label="Rename link"
          onClick={() => {
            close();
            onEditStart();
          }}
        >
          {IC.pen}
        </button>
        <button type="button" className="lu-del" aria-label="Delete link" onClick={onDelete}>
          {IC.trash}
        </button>
      </div>
      <div
        className="link-card link-track"
        role="link"
        tabIndex={0}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={(e) => {
          if (open) {
            close();
            dragged.current = true;
            return;
          }
          dragged.current = false;
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const ddx = e.clientX - d.x;
          const ddy = e.clientY - d.y;
          if (Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy) * 1.2) dragged.current = true;
          if (ddx < 0) setDx(Math.max(-REVEAL_W, ddx));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          if (e.clientX - d.x < -REVEAL_W / 2) {
            setOpen(true);
            setDx(-REVEAL_W);
          } else {
            close();
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          if (!open) setDx(0);
        }}
        onClickCapture={(e) => {
          if (dragged.current) {
            dragged.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onClick={() => {
          if (!editing) go();
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !editing) {
            e.preventDefault();
            go();
          }
        }}
      >
        <span className="link-thumb">
          {l.image ? (
            <img src={l.image} alt="" loading="lazy" />
          ) : (
            <img src={faviconFor(l.url)} alt="" loading="lazy" />
          )}
        </span>
        <span className="link-meta">
          {editing ? (
            <input
              type="text"
              value={editValue}
              style={{ margin: 0, padding: "8px 10px" }}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={onEditCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") onEditCommit();
              }}
              autoFocus
            />
          ) : (
            <span className="link-title">{l.title}</span>
          )}
          <span className="link-site">{l.site}</span>
          {!!l.desc && <span className="link-desc">{l.desc}</span>}
        </span>
      </div>
    </div>
  );
}

export function GroceryItemSheet({ listId, itemId }: { listId: string; itemId?: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const list = (doc.groceryLists || []).find((l) => l.id === listId);
  const found = itemId ? findGroceryItem(doc, itemId) : null;
  const existing = found && found.list.id === listId ? found.item : undefined;

  const [name, setName] = useState(existing ? existing.name : "");
  const _q0 = parseQty(existing ? existing.qty || "" : "");
  const [qn, setQn] = useState(_q0.n);
  const [qunit, setQunit] = useState<QtyUnit>(_q0.unit);
  const [qcustom, setQcustom] = useState(_q0.custom);
  const [expectDate, setExpectDate] = useState(existing ? existing.expectDate : addDaysStr(3));
  const [showCal, setShowCal] = useState(false);
  const [links, setLinks] = useState<BuyLink[]>(existing ? [...(existing.links || [])] : []);
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // "add" or link id
  const [titleEdit, setTitleEdit] = useState<{ id: string; value: string } | null>(null);
  const addLink = async () => {
    const url = normalizeUrl(linkUrl);
    if (!url) {
      toast("Paste a valid link");
      return;
    }
    if (links.some((x) => x.url === url)) {
      toast("Link already added");
      return;
    }
    if (links.length >= MAX_LINKS) {
      toast(`Max ${MAX_LINKS} links per item`);
      return;
    }
    setBusy("add");
    try {
      const rec = await buildLink(url);
      setLinks((prev) => (prev.length >= MAX_LINKS ? prev : [...prev, rec]));
      setLinkUrl("");
    } finally {
      setBusy(null);
    }
  };
  const dropLink = (id: string) => {
    setLinks((prev) => prev.filter((x) => x.id !== id));
    toast("Link removed");
  };
  const commitTitle = () => {
    if (!titleEdit) return;
    const v = titleEdit.value.trim();
    const id = titleEdit.id;
    setLinks((prev) => prev.map((x) => (x.id === id ? { ...x, title: v || x.site } : x)));
    setTitleEdit(null);
  };

  if (!list) {
    return (
      <>
        <Grab />
        <div className="sh-title">Item</div>
        <div className="tsub" style={{ margin: "0 2px 8px", color: "var(--muted)" }}>
          This list no longer exists.
        </div>
        <button className="btn" style={{ marginTop: 16 }} onClick={closeSheet}>
          {IC.check} Done
        </button>
      </>
    );
  }

  const stepQn = (d: number) => {
    const cur = parseInt(qn.replace(/\D/g, ""), 10);
    const next = isNaN(cur) ? (d > 0 ? 1 : "") : Math.min(99, Math.max(0, cur + d));
    setQn(next === "" ? "" : String(next));
  };

  const qtyStr = (() => {
    const n = qn.replace(/\D/g, "").slice(0, 3);
    if (!n) return qcustom.trim();
    if (qunit === "custom") return (n + " " + qcustom.trim()).trim();
    return n + " " + qunit;
  })();

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast("Enter an item name");
      return;
    }
    const now = Date.now();
    const by = deviceName(doc);
    mutate((d) => {
      const l = (d.groceryLists || []).find((x) => x.id === listId);
      if (!l) return;
      if (!Array.isArray(l.items)) l.items = [];
      if (existing) {
        const it = l.items.find((x) => x.id === existing.id);
        if (!it || it.deleted) return;
        it.name = n;
        it.qty = qtyStr;
        it.expectDate = expectDate || todayStr();
        if (links.length) it.links = links.map((x) => ({ ...x }));
        else delete it.links;
        it.updatedAt = now;
      } else {
        l.items.push({
          id: uid(), name: n, qty: qtyStr, expectDate: expectDate || todayStr(),
          status: "active", purchasedAt: null, addedBy: by, updatedAt: now,
          ...(links.length ? { links: links.map((x) => ({ ...x })) } : null),
        });
      }
      l.updatedAt = now;
    });
    closeSheet();
    toast(existing ? "Item updated" : "Item added");
  };

  const remove = () => {
    if (!existing) return;
    const now = Date.now();
    mutate((d) => {
      const l = (d.groceryLists || []).find((x) => x.id === listId);
      const it = l && (l.items || []).find((x) => x.id === existing.id);
      if (!it) return;
      it.deleted = true;
      it.updatedAt = now;
      if (l) l.updatedAt = now;
    });
    closeSheet();
    toast("Removed");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">{existing ? "Edit item" : "Add item"}</div>
      <label className="field note-field">
        <span className="ficon">🛒</span>
        <input
          type="text"
          className="note-inline"
          placeholder="e.g. Facewash"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="field">
        <span className="ficon">⚖️</span>
        <span className="qty-step">
          <button type="button" className="qty-btn" onClick={() => stepQn(-1)} aria-label="Decrease quantity">
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            className="qty-num"
            placeholder="1"
            value={qn}
            onChange={(e) => setQn(e.target.value.replace(/\D/g, "").slice(0, 3))}
            aria-label="Quantity number"
          />
          <button type="button" className="qty-btn" onClick={() => stepQn(1)} aria-label="Increase quantity">
            +
          </button>
        </span>
        <select
          className="unit-select"
          value={qunit}
          onChange={(e) => setQunit(e.target.value as QtyUnit)}
          aria-label="Quantity unit"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
          <option value="custom">Other</option>
        </select>
      </div>
      {qunit === "custom" && (
        <input
          type="text"
          placeholder="e.g. packs, bottles"
          value={qcustom}
          onChange={(e) => setQcustom(e.target.value)}
          style={{ marginTop: 0 }}
        />
      )}
      <button type="button" className="field" onClick={() => setShowCal((v) => !v)}>
        <span className="ficon">🗓️</span>
        <span className="f-name">{dayLabel(expectDate || todayStr())}</span>
        <span className="f-val">Date</span>
        {IC.right}
      </button>
      {showCal && (
        <CalGrid
          value={expectDate || todayStr()}
          onPick={(d) => {
            setExpectDate(d);
            setShowCal(false);
          }}
        />
      )}
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Buy online{links.length > 0 ? ` · ${links.length}` : ""}
      </div>
      {links.map((l) => (
        <LinkCard
          key={l.id}
          l={l}
          editing={!!titleEdit && titleEdit.id === l.id}
          editValue={titleEdit && titleEdit.id === l.id ? titleEdit.value : ""}
          onEditStart={() => setTitleEdit({ id: l.id, value: l.title })}
          onEditChange={(v) => setTitleEdit({ id: l.id, value: v })}
          onEditCommit={commitTitle}
          onDelete={() => dropLink(l.id)}
        />
      ))}
      {links.length < MAX_LINKS && (
        <div className="link-addrow">
          <input
            type="text"
            inputMode="url"
            placeholder="Paste a shopping link"
            value={linkUrl}
            style={{ margin: 0 }}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addLink();
            }}
          />
          <button type="button" className="btn ghost mini" onClick={addLink} disabled={busy === "add"}>
            {busy === "add" ? "…" : "Add"}
          </button>
        </div>
      )}
      <button className="btn" style={{ marginTop: 16 }} onClick={save}>
        {IC.check} {existing ? "Save item" : "Add item"}
      </button>
      {existing && (
        <button className="set" style={{ marginTop: 8 }} onClick={remove}>
          <span className="s-label">
            Remove item<div className="s-sub">Takes it off the list</div>
          </span>
          {IC.trash}
        </button>
      )}
    </>
  );
}

export function GroceryListSheet({ id }: { id?: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const existing = id ? (doc.groceryLists || []).find((l) => l.id === id) : undefined;
  const [name, setName] = useState(existing ? existing.name : "");

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast("Enter a list name");
      return;
    }
    const now = Date.now();
    mutate((d) => {
      if (!Array.isArray(d.groceryLists)) d.groceryLists = [];
      if (existing) {
        const l = d.groceryLists.find((x) => x.id === existing.id);
        if (!l) return;
        l.name = n;
        l.updatedAt = now;
      } else {
        d.groceryLists.push({ id: uid(), name: n, items: [], share: null, updatedAt: now });
      }
    });
    closeSheet();
    toast(existing ? "List renamed" : "List created");
  };

  const remove = () => {
    if (!existing) return;
    mutate((d) => {
      d.groceryLists = (d.groceryLists || []).filter((x) => x.id !== existing.id);
    });
    closeSheet();
    toast("List deleted");
  };

  return (
    <>
      <Grab />
      <div className="sh-title">{existing ? "Edit list" : "New list"}</div>
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        List name
      </div>
      <input
        type="text"
        placeholder="e.g. Monthly staples"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ marginTop: 0 }}
      />
      <button className="btn" style={{ marginTop: 16 }} onClick={save}>
        {IC.check} {existing ? "Save list" : "Create list"}
      </button>
      {existing && (
        <button className="set" style={{ marginTop: 8 }} onClick={remove}>
          <span className="s-label">
            Delete list<div className="s-sub">Removes the list and all its items</div>
          </span>
          {IC.trash}
        </button>
      )}
    </>
  );
}

export function GroceryMoreSheet() {
  const { openSheet, closeSheet } = useApp();
  return (
    <>
      <Grab />
      <button className="sh-row" onClick={() => openSheet({ name: "grocery-list" })}>
        <span className="ccircle">{IC.plus}</span>
        <span className="rname">New list</span>
        {IC.right}
      </button>
      <button className="sh-row" onClick={() => openSheet({ name: "grocery-join", id: "", id2: "" })}>
        <span className="ccircle">{IC.open}</span>
        <span className="rname">Join shared list</span>
        {IC.right}
      </button>
      <button className="sh-row" onClick={() => openSheet({ name: "export" })}>
        <span className="ccircle">{IC.share}</span>
        <span className="rname">Export data</span>
        {IC.right}
      </button>
      <button className="sh-row" onClick={closeSheet} style={{ color: "var(--neg)" }}>
        <span className="ccircle">{IC.x}</span>
        <span className="rname">Close</span>
        {IC.right}
      </button>
    </>
  );
}
