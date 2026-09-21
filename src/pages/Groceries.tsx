// Groceries — upcoming-products planner. Each list holds items with a
// quantity and an expected purchase date; nearest dates surface first.
// Checking out moves an item to Already purchased (status flip, not delete);
// tombstoned deletes are preserved for shared-list merges.

import { useState } from "react";
import { Empty } from "../components/ui";
import { IC } from "../lib/icons";
import { activeItems, expectInfo, purchasedItems } from "../lib/grocery";
import { useApp } from "../services/store";
import type { GroceryItem } from "../types";

function ActiveRow({ item, listId }: { item: GroceryItem; listId: string }) {
  const { mutate, openSheet, toast } = useApp();
  const info = expectInfo(item.expectDate);
  const checkout = () => {
    const now = Date.now();
    mutate((d) => {
      const l = (d.groceryLists || []).find((x) => x.id === listId);
      const it = l && (l.items || []).find((x) => x.id === item.id);
      if (!it || it.deleted) return;
      it.status = "purchased";
      it.purchasedAt = now;
      it.updatedAt = now;
      l!.updatedAt = now;
    });
    toast("Moved to purchased");
  };
  return (
    <div className="slab g-row">
      <button type="button" className="gcheck" onClick={checkout} aria-label={"Mark " + item.name + " purchased"}>
        {IC.check}
      </button>
      <span className="s-label" onClick={() => openSheet({ name: "grocery-item", id: listId, id2: item.id })}>
        {item.name}
        <div className="s-sub">
          {[item.qty, info.label + " · " + info.date].filter(Boolean).join(" · ")}
        </div>
      </span>
      <span className={"pill " + (info.overdue ? "err" : info.soon ? "warn" : "")}>{info.label}</span>
    </div>
  );
}

function PurchasedRow({ item, listId }: { item: GroceryItem; listId: string }) {
  const { mutate, toast } = useApp();
  const bought = item.purchasedAt
    ? new Date(item.purchasedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "";
  const moveBack = () => {
    const now = Date.now();
    mutate((d) => {
      const l = (d.groceryLists || []).find((x) => x.id === listId);
      const it = l && (l.items || []).find((x) => x.id === item.id);
      if (!it || it.deleted) return;
      it.status = "active";
      it.purchasedAt = null;
      it.updatedAt = now;
      l!.updatedAt = now;
    });
    toast("Moved back to list");
  };
  const remove = () => {
    const now = Date.now();
    mutate((d) => {
      const l = (d.groceryLists || []).find((x) => x.id === listId);
      const it = l && (l.items || []).find((x) => x.id === item.id);
      if (!it) return;
      it.deleted = true;
      it.updatedAt = now;
      l!.updatedAt = now;
    });
    toast("Removed");
  };
  return (
    <div className="slab g-row done">
      <span className="s-label">
        {item.name}
        <div className="s-sub">{[item.qty, bought ? "Bought " + bought : ""].filter(Boolean).join(" · ")}</div>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" className="row-btn" onClick={moveBack} aria-label={"Move " + item.name + " back to list"}>
          {IC.refresh}
        </button>
        <button type="button" className="row-btn" onClick={remove} aria-label={"Remove " + item.name}>
          {IC.trash}
        </button>
      </span>
    </div>
  );
}

export function GroceriesPage() {
  const { state, openSheet } = useApp();
  const doc = state.doc!;
  const lists = doc.groceryLists || [];
  const [sel, setSel] = useState<string | null>(null);
  const [showBought, setShowBought] = useState(true);
  const list = lists.find((l) => l.id === sel) ?? lists[0] ?? null;
  const active = list ? activeItems(list) : [];
  const bought = list ? purchasedItems(list) : [];
  const dueCount = active.filter((i) => expectInfo(i.expectDate).overdue).length;

  return (
    <div className="scr">
      <header className="scrhdr">
        <div className="hdr-title">Groceries</div>
        <div className="hdr-left">
          <button className="cbtn small" onClick={() => openSheet({ name: "export" })} aria-label="Export data">
            {IC.dots}
          </button>
          <button className="btn mini" onClick={() => openSheet({ name: "grocery-list" })}>
            {IC.plus} New list
          </button>
        </div>
      </header>
      {lists.length > 1 && (
        <div className="chip-row" style={{ marginTop: 0 }} aria-label="Grocery lists">
          {lists.map((l) => (
            <button
              key={l.id}
              type="button"
              className={"chip " + (list && l.id === list.id ? "on" : "")}
              onClick={() => setSel(l.id)}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}
      {!list ? (
        <div className="card">
          <Empty
            icon={IC.cart}
            title="No grocery lists yet"
            sub="Create a list for products that are about to run out"
          />
        </div>
      ) : (
        <>
          <div className="sec-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1 }}>
              {list.name} · {active.length} to buy{dueCount ? ` · ${dueCount} overdue` : ""}
            </span>
            <button
              type="button"
              className="row-btn"
              onClick={() => openSheet({ name: "grocery-list", id: list.id })}
              aria-label="Rename or delete list"
            >
              {IC.pen}
            </button>
            <button type="button" className="btn mini" onClick={() => openSheet({ name: "grocery-item", id: list.id })}>
              {IC.plus} Add item
            </button>
          </div>
          {active.length ? (
            active.map((it) => <ActiveRow key={it.id} item={it} listId={list.id} />)
          ) : (
            <div className="card">
              <Empty icon={IC.check} title="All stocked up" sub="Nothing left to buy on this list" />
            </div>
          )}
          {bought.length > 0 && (
            <>
              <div
                className="sec-label"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
                onClick={() => setShowBought((v) => !v)}
                role="button"
              >
                <span style={{ flex: 1 }}>
                  Already purchased · {bought.length}
                </span>
                <span className="row-btn" aria-hidden="true">{showBought ? IC.chev : IC.right}</span>
              </div>
              {showBought && bought.map((it) => <PurchasedRow key={it.id} item={it} listId={list.id} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}
