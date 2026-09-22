// Grocery sheets — item add/edit (name + qty + expected date) and
// list create/rename/delete. Expected date is picked via day chips backed
// by a plain date input; deletes are tombstones for shared-list merges.

import { useState } from "react";
import { addDaysStr, dayDiff, deviceName, findGroceryItem } from "../lib/grocery";
import { todayStr, uid } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";
import { Grab } from "./Sheet";
const DAY_CHIPS: Array<{ label: string; days: number }> = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "2 weeks", days: 14 },
];

export function GroceryItemSheet({ listId, itemId }: { listId: string; itemId?: string }) {
  const { state, mutate, closeSheet, toast } = useApp();
  const doc = state.doc!;
  const list = (doc.groceryLists || []).find((l) => l.id === listId);
  const found = itemId ? findGroceryItem(doc, itemId) : null;
  const existing = found && found.list.id === listId ? found.item : undefined;

  const [name, setName] = useState(existing ? existing.name : "");
  const [qty, setQty] = useState(existing ? existing.qty || "" : "");
  const [expectDate, setExpectDate] = useState(existing ? existing.expectDate : addDaysStr(3));
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

  const chipDays = (() => {
    const diff = dayDiff(expectDate || todayStr());
    const hit = DAY_CHIPS.find((c) => c.days === diff);
    return hit ? hit.days : null;
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
        it.qty = qty.trim();
        it.expectDate = expectDate || todayStr();
        it.updatedAt = now;
      } else {
        l.items.push({
          id: uid(), name: n, qty: qty.trim(), expectDate: expectDate || todayStr(),
          status: "active", purchasedAt: null, addedBy: by, updatedAt: now,
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
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Item
      </div>
      <input
        type="text"
        placeholder="e.g. Facewash"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ marginTop: 0 }}
      />
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Quantity
      </div>
      <input
        type="text"
        placeholder="e.g. 2 packs, 500 ml"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        style={{ marginTop: 0 }}
      />
      <div className="tsub" style={{ margin: "8px 2px 4px" }}>
        Expect to buy
      </div>
      <div className="chip-row" style={{ marginTop: 0 }}>
        {DAY_CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            className={"chip " + (chipDays === c.days ? "on" : "")}
            onClick={() => setExpectDate(addDaysStr(c.days))}
          >
            {c.label}
          </button>
        ))}
      </div>
      <input
        type="date"
        value={expectDate}
        onChange={(e) => setExpectDate(e.target.value)}
        style={{ marginTop: 8 }}
      />
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
