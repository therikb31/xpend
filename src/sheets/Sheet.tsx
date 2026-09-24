// Bottom-sheet root — port of #scrim + #sheet + openSheet/swapSheet/closeSheet.
// One sheet at a time; nested flows are internal step state (see sheets/*).
// Close animates out (320ms, matching the legacy timer) before unmounting.

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useApp } from "../services/store";
import type { SheetSpec } from "../services/store";
import { AccountAddSheet, AccountEditSheet } from "./accounts";
import { BudgetDetailSheet, BudgetFormSheet } from "./budget";
import { DayTxnsSheet } from "./daytxns";
import { FriendAddSheet, OpenInAppSheet } from "./friends";
import { GoalCompleteSheet, GoalDetailSheet, GoalFormSheet } from "./goals";
import { GroceryItemSheet, GroceryListSheet, GroceryMoreSheet, GroceryPurchasedSheet } from "./grocery";
import { GroceryJoinSheet, GroceryShareSheet } from "./groceryshare";
import { MerchantEditorSheet, MerchantManageSheet } from "./manage";
import { CategoryManageSheet, ShortcutsSheet } from "./manage";
import { GithubLinkSheet, ImportMergeSheet } from "./oauth";
import { SavMoveSheet, TransferSheet } from "./money";
import {
  AccountFilterSheet,
  AccountSheet,
  CategorySheet,
  DateSheet,
  MerchantSheet,
  MonthSheet,
} from "./pickers";
import {
  ExportSheet,
  GistRestoreSheet,
  GistSetupSheet,
  GistUnlockSheet,
  MoreSheet,
  PwaHelpSheet,
} from "./system";
import { TxnSheet } from "./txn";

export function Grab() {
  return <div className="sh-grab"></div>;
}

function Content({ sheet }: { sheet: SheetSpec }) {
  switch (sheet.name) {
    case "month":
      return <MonthSheet />;
    case "date":
      return <DateSheet />;
    case "category":
      return <CategorySheet />;
    case "account":
      return <AccountSheet />;
    case "merchant":
      return <MerchantSheet />;
    case "merchant-manage":
      return <MerchantManageSheet />;
    case "merchant-edit":
      return <MerchantEditorSheet id={sheet.id} />;
    case "transfer":
      return <TransferSheet />;
    case "sav-move":
      return <SavMoveSheet id={sheet.id!} />;
    case "account-filter":
      return <AccountFilterSheet />;
    case "txn":
      return <TxnSheet id={sheet.id!} />;
    case "day-txns":
      return <DayTxnsSheet date={sheet.id!} />;
    case "more":
      return <MoreSheet />;
    case "shortcuts":
      return <ShortcutsSheet />;
    case "category-manage":
      return <CategoryManageSheet />;
    case "goal-form":
      return <GoalFormSheet id={sheet.id} />;
    case "goal-detail":
      return <GoalDetailSheet id={sheet.id!} />;
    case "goal-complete":
      return <GoalCompleteSheet id={sheet.id!} />;
    case "account-add":
      return <AccountAddSheet />;
    case "account-edit":
      return <AccountEditSheet id={sheet.id!} />;
    case "gist-setup":
      return <GistSetupSheet />;
    case "gist-unlock":
      return <GistUnlockSheet />;
    case "gist-restore":
      return <GistRestoreSheet />;
    case "export":
      return <ExportSheet />;
    case "pwa-help":
      return <PwaHelpSheet />;
    case "budget-form":
      return <BudgetFormSheet id={sheet.id} />;
    case "grocery-item":
      return <GroceryItemSheet listId={sheet.id!} itemId={sheet.id2} />;
    case "grocery-list":
      return <GroceryListSheet id={sheet.id} />;
    case "grocery-more":
      return <GroceryMoreSheet />;
    case "grocery-purchased":
      return <GroceryPurchasedSheet listId={sheet.id!} />;
    case "grocery-share":
      return <GroceryShareSheet listId={sheet.id!} />;
    case "grocery-join":
      return <GroceryJoinSheet listId={sheet.id!} from={sheet.id2 || ""} salt={sheet.id3} keyB64={sheet.id4} />;
    case "friend-add":
      return <FriendAddSheet username={sheet.id} name={sheet.id2} />;
    case "open-in-app":
      return <OpenInAppSheet link={sheet.id || ""} kind={sheet.id2 || ""} />;
    case "github-link":
      return <GithubLinkSheet />;
    case "import-merge":
      return <ImportMergeSheet />;
    case "budget-detail":
      return <BudgetDetailSheet id={sheet.id!} />;
    default:
      return null;
  }
}

export function SheetRoot() {
  const { state, closeSheet } = useApp();
  const [visible, setVisible] = useState<SheetSpec | null>(null);
  const [up, setUp] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; dy: number; t: number } | null>(null);

  useEffect(() => {
    if (state.sheet) {
      setVisible(state.sheet);
      setUp(false);
      const t = setTimeout(() => setUp(true), 30);
      return () => clearTimeout(t);
    } else if (visible) {
      setUp(false);
      const t = setTimeout(() => setVisible(null), 320);
      return () => clearTimeout(t);
    }
  }, [state.sheet, visible]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [closeSheet]);

  // Swipe-down-to-close, initiated on the grab handle only (Pointer Events
  // unify mouse/touch). Inner list scrolling never triggers it: gestures
  // starting elsewhere are untouched, and a sub-threshold release snaps back.
  const onGrabDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement | null;
    if (!t || typeof t.closest !== "function" || !t.closest(".sh-grab")) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — moves still tracked while over the sheet */
    }
    dragRef.current = { startY: e.clientY, dy: 0, t: Date.now() };
  };
  const onGrabMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    setDragY(d.dy);
  };
  const onGrabUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const dt = Math.max(1, Date.now() - d.t);
    if (d.dy > 110 || d.dy / dt > 0.6) closeSheet();
    setDragY(null);
  };

  return (
    <>
      <div id="scrim" className={state.sheet ? "on" : ""} onClick={closeSheet} data-act="close-sheet" />
      <div id="sheet">
        {visible && (
          <div
            className={"sheet" + (up ? " up" : "")}
            id="sheet-body"
            style={
              dragY != null && dragY > 0
                ? { transform: `translateY(${dragY}px)`, transition: "none" }
                : undefined
            }
            onPointerDown={onGrabDown}
            onPointerMove={onGrabMove}
            onPointerUp={onGrabUp}
            onPointerCancel={onGrabUp}
          >
            <Content sheet={visible} />
          </div>
        )}
      </div>
    </>
  );
}
