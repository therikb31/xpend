// Central store — React port of the legacy `App` god-object's state + save path.
// One doc + view/mkey/flt/drafts in a context+reducer. Every MUTATE stamps
// meta.updatedAt, marks gist dirty (when connected), and the persist effect
// writes to local Store + schedules the debounced gist push.

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { AddDraft, Doc, Filters, InsightGrp, Txn, View } from "../types";
import { defaultDoc } from "../data/defaults";
import {
  mergePool,
  migrateBud,
  migrateCats,
  migrateGoals,
  migrateGrocery,
  migrateMerch,
  migrateNeeds,
  migrateSav,
} from "../data/migrate";
import { monthKey, parseMk, rupees, todayStr, uid } from "../lib/format";
import { savSync } from "../data/finance";
import { attachGist, Gist, gistConnected, gistDirty } from "./gist";
import { ghLoadToken } from "./githubAuth";
import { Store } from "./storage";

export type TabId = "activity" | "summary" | "budget" | "goals" | "groceries" | "accounts";

export type SheetName =
  | "month" | "date" | "category" | "account" | "merchant"
  | "merchant-manage" | "merchant-edit" | "merchant-icon"
  | "transfer" | "sav-move" | "account-filter"
  | "txn" | "note" | "more" | "shortcuts" | "category-manage"
  | "goal-form" | "goal-detail" | "goal-sources" | "source-entry" | "goal-complete"
  | "account-add" | "account-edit" | "account-icon"
  | "gist-setup" | "gist-unlock" | "gist-restore"
  | "export" | "pwa-help" | "budget-form" | "budget-detail"
  | "grocery-item" | "grocery-list" | "grocery-share" | "grocery-join" | "grocery-more"
  | "friend-add" | "github-link" | "import-merge" | "open-in-app" | "day-txns";

export interface SheetSpec {
  name: SheetName;
  /** entity id (txn / merchant / goal / budget / account / grocery list) */
  id?: string;
  /** second entity id (grocery item id for grocery-item edit, sender for grocery-join) */
  id2?: string;
  /** third param (list salt for legacy #/l/ grocery-join links) */
  id3?: string;
  /** fourth param (list key for #/s/ grocery-join links) */
  id4?: string;
}

interface AppState {
  doc: Doc | null;
  booted: boolean;
  view: View;
  prevView: View;
  mkey: string;
  flt: Filters;
  igrp: InsightGrp;
  add: AddDraft;
  editingId: string | null;
  sheet: SheetSpec | null;
  toast: string | null;
  gistVersion: number;
}

/** Scroll memory for add/edit round-trips (port of App._scrollRestore). */
export const scrollMem: { v: number | null } = { v: null };

function screenEl(): HTMLElement | null {
  return document.getElementById("screen");
}

export function freshAdd(doc: Doc): AddDraft {
  const s = doc.settings;
  const cid = s.lastCategoryId || "cat-gro";
  const mid =
    s.lastMerchantId && (doc.merchants || []).some((m) => m.id === s.lastMerchantId)
      ? s.lastMerchantId
      : "";
  return {
    amount: "",
    dir: "expense",
    categoryId: doc.categories.some((c) => c.id === cid) ? cid : "cat-gro",
    accountId: doc.accounts[0] ? doc.accounts[0].id : "",
    date: (s && s.lastDate) || todayStr(),
    note: "",
    merchantId: mid,
  };
}

type Action =
  | { t: "BOOT"; doc: Doc }
  | { t: "GO_TAB"; tab: TabId }
  | { t: "GO"; view: View; prev?: View }
  | { t: "BACK" }
  | { t: "OPEN_ADD"; add: AddDraft; editingId: string | null }
  | { t: "CLOSE_ADD"; view: View }
  | { t: "SET_MKEY"; mkey: string }
  | { t: "SET_FILTER"; patch: Partial<Filters> }
  | { t: "SET_IGRP"; igrp: InsightGrp }
  | { t: "CLEAR_FILTERS" }
  | { t: "SET_ADD"; patch: Partial<AddDraft> }
  | { t: "OPEN_SHEET"; sheet: SheetSpec | null }
  | { t: "TOAST"; msg: string | null }
  | { t: "MUTATE"; fn: (d: Doc) => void }
  | { t: "LOAD_DOC"; doc: Doc }
  | { t: "GIST_PUSHED"; at: string }
  | { t: "BUMP_GIST" };

const initial: AppState = {
  doc: null,
  booted: false,
  view: "overview",
  prevView: "overview",
  mkey: monthKey(new Date()),
  flt: { q: "", dir: "all", cat: "all", acc: "all", merch: "all", bucket: "all" },
  igrp: "cat" as InsightGrp,
  add: { amount: "", dir: "expense", categoryId: "cat-gro", accountId: "", date: todayStr(), note: "", merchantId: "" },
  editingId: null,
  sheet: null,
  toast: null,
  gistVersion: 0,
};

function mutateDoc(doc: Doc, fn: (d: Doc) => void): Doc {
  const next = structuredClone(doc);
  fn(next);
  next.meta.updatedAt = new Date().toISOString();
  if (next.settings.gist && next.settings.gist.gistId) next.settings.gist.dirty = true;
  return next;
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.t) {
    case "BOOT":
      return { ...s, doc: a.doc, booted: true, add: freshAdd(a.doc) };
    case "GO_TAB": {
      if (a.tab === "activity") return { ...s, view: "overview", prevView: "overview" };
      return { ...s, view: a.tab, prevView: a.tab };
    }
    case "GO":
      return { ...s, view: a.view, prevView: a.prev ?? s.prevView };
    case "BACK":
      return { ...s, view: s.prevView || "overview" };
    case "OPEN_ADD":
      return { ...s, add: a.add, editingId: a.editingId, view: "add" };
    case "CLOSE_ADD":
      return { ...s, view: a.view, editingId: null };
    case "SET_MKEY":
      return { ...s, mkey: a.mkey };
    case "SET_FILTER":
      return { ...s, flt: { ...s.flt, ...a.patch } };
    case "SET_IGRP":
      return { ...s, igrp: a.igrp };
    case "CLEAR_FILTERS":
      return { ...s, flt: { ...s.flt, dir: "all", acc: "all", merch: "all", bucket: "all" } };
    case "SET_ADD":
      return { ...s, add: { ...s.add, ...a.patch } };
    case "OPEN_SHEET":
      return { ...s, sheet: a.sheet };
    case "TOAST":
      return { ...s, toast: a.msg };
    case "MUTATE":
      return s.doc ? { ...s, doc: mutateDoc(s.doc, a.fn) } : s;
    case "LOAD_DOC":
      return { ...s, doc: a.doc, add: freshAdd(a.doc) };
    case "GIST_PUSHED": {
      if (!s.doc || !s.doc.settings.gist) return s;
      const doc = {
        ...s.doc,
        settings: { ...s.doc.settings, gist: { ...s.doc.settings.gist, dirty: false, lastPushedAt: a.at } },
      };
      return { ...s, doc };
    }
    case "BUMP_GIST":
      return { ...s, gistVersion: s.gistVersion + 1 };
  }
}

interface Ctx {
  state: AppState;
  toast: (msg: string) => void;
  mutate: (fn: (d: Doc) => void) => void;
  loadDoc: (d: Doc) => void;
  goTab: (t: TabId) => void;
  go: (view: View, prev?: View) => void;
  back: () => void;
  openAdd: () => void;
  closeAdd: () => void;
  startEdit: (t: Txn) => void;
  keyInput: (k: string) => void;
  saveAdd: () => void;
  setMkey: (m: string) => void;
  setFilter: (patch: Partial<Filters>) => void;
  setIgrp: (g: InsightGrp) => void;
  setAdd: (patch: Partial<AddDraft>) => void;
  shiftMonth: (delta: number) => void;
  openSheet: (sheet: SheetSpec) => void;
  closeSheet: () => void;
  bumpGist: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const ref = useRef(state);
  ref.current = state;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = (msg: string) => {
    dispatch({ t: "TOAST", msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => dispatch({ t: "TOAST", msg: null }), 1900);
  };

  const ctx = useMemo<Ctx>(() => {
    const s = () => ref.current;
    const mutate = (fn: (d: Doc) => void) => dispatch({ t: "MUTATE", fn });
    const loadDoc = (doc: Doc) => dispatch({ t: "LOAD_DOC", doc });
    const openSheet = (sheet: SheetSpec) => dispatch({ t: "OPEN_SHEET", sheet });
    const closeSheet = () => dispatch({ t: "OPEN_SHEET", sheet: null });
    const bumpGist = () => dispatch({ t: "BUMP_GIST" });
    const goTab = (tab: TabId) => {
      scrollMem.v = null;
      const cur = s();
      if (tab !== "budget" && cur.mkey > monthKey(new Date()))
        dispatch({ t: "SET_MKEY", mkey: monthKey(new Date()) });
      dispatch({ t: "GO_TAB", tab });
    };
    const go = (view: View, prev?: View) => {
      scrollMem.v = null;
      dispatch({ t: "GO", view, prev });
    };
    const back = () => {
      scrollMem.v = null;
      dispatch({ t: "BACK" });
    };
    const openAdd = () => {
      const d = s().doc;
      if (!d) return;
      scrollMem.v = screenEl()?.scrollTop ?? null;
      dispatch({ t: "OPEN_ADD", add: freshAdd(d), editingId: null });
    };
    const closeAdd = () => {
      const cur = s();
      dispatch({ t: "OPEN_SHEET", sheet: null });
      dispatch({ t: "CLOSE_ADD", view: cur.prevView || "overview" });
    };
    const startEdit = (t: Txn) => {
      if (t.dir === "trans") return;
      scrollMem.v = screenEl()?.scrollTop ?? null;
      dispatch({ t: "OPEN_SHEET", sheet: null });
      dispatch({
        t: "OPEN_ADD",
        editingId: t.id,
        add: {
          amount: String(t.amount / 100).replace(/\.0+$/, ""),
          dir: t.dir,
          categoryId: t.categoryId,
          accountId: t.accountId,
          date: t.date,
          note: t.note || "",
          merchantId: t.merchantId || "",
        },
      });
    };
    const keyInput = (k: string) => {
      const a = { ...s().add };
      if (k === "del") {
        a.amount = a.amount.slice(0, -1);
      } else if (k === ".") {
        if (!a.amount) a.amount = "0.";
        else if (!a.amount.includes(".")) a.amount += ".";
      } else {
        if (a.amount.includes(".") && a.amount.split(".")[1].length >= 2) return;
        if (a.amount === "0") a.amount = k;
        else a.amount += k;
        if (a.amount.length > 10) return;
      }
      dispatch({ t: "SET_ADD", patch: { amount: a.amount } });
    };
    const saveAdd = () => {
      const cur = s();
      const d = cur.doc;
      if (!d) return;
      const a = cur.add;
      const v = parseFloat(a.amount);
      if (!isFinite(v) || v <= 0) {
        toast("Enter an amount");
        return;
      }
      const existing = cur.editingId && d.transactions.find((x) => x.id === cur.editingId);
      if (existing) {
        const before = { ...existing };
        mutate((doc) => {
          const t = doc.transactions.find((x) => x.id === cur.editingId);
          if (!t || t.dir === "trans") return;
          const prev: Txn = { ...before } as Txn;
          Object.assign(t, {
            date: a.date, dir: a.dir, amount: Math.round(v * 100),
            categoryId: a.categoryId, accountId: a.accountId,
            note: a.note, merchantId: a.merchantId,
          });
          savSync(doc, prev, t);
          doc.settings.lastDate = a.date;
          doc.settings.lastCategoryId = a.categoryId;
          doc.settings.lastMerchantId = a.merchantId;
        });
        const amt = Math.round(v * 100);
        dispatch({ t: "OPEN_ADD", add: freshAdd(d), editingId: null });
        dispatch({ t: "CLOSE_ADD", view: cur.prevView });
        toast("Updated " + rupees(amt, !!d.settings.hideBalances));
        return;
      }
      const txn: Txn = {
        id: uid(), date: a.date, dir: a.dir, amount: Math.round(v * 100),
        categoryId: a.categoryId, accountId: a.accountId, merchantId: a.merchantId,
        name: "", note: a.note, createdAt: Date.now(),
      };
      mutate((doc) => {
        doc.transactions.push(txn);
        savSync(doc, null, txn);
        doc.settings.lastDate = a.date;
        doc.settings.lastCategoryId = a.categoryId;
        doc.settings.lastMerchantId = a.merchantId;
      });
      dispatch({ t: "OPEN_ADD", add: freshAdd(d), editingId: null });
      dispatch({ t: "CLOSE_ADD", view: cur.prevView });
      toast("Added " + rupees(txn.amount, !!d.settings.hideBalances));
    };
    const setMkey = (mkey: string) => dispatch({ t: "SET_MKEY", mkey });
    const setFilter = (patch: Partial<Filters>) => dispatch({ t: "SET_FILTER", patch });
    const setIgrp = (igrp: InsightGrp) => dispatch({ t: "SET_IGRP", igrp });
    const setAdd = (patch: Partial<AddDraft>) => dispatch({ t: "SET_ADD", patch });
    const shiftMonth = (delta: number) => {
      const cur = s();
      const d = parseMk(cur.mkey);
      d.setMonth(d.getMonth() + delta);
      const k = monthKey(d);
      if (k > monthKey(new Date()) && cur.view !== "budget") return;
      dispatch({ t: "SET_MKEY", mkey: k });
    };
    return {
      state, toast, mutate, loadDoc, goTab, go, back, openAdd, closeAdd,
      startEdit, keyInput, saveAdd, setMkey, setFilter, setIgrp, setAdd, shiftMonth, openSheet, closeSheet, bumpGist,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ---- boot (port of App.boot) ----
  useEffect(() => {
    let dead = false;
    (async () => {
      await Store.init();
      let d: Doc | null = null;
      try {
        d = await Store.get<Doc>("doc");
      } catch {
        d = null;
      }
      if (!d) d = defaultDoc();
      if (!d.settings) d.settings = defaultDoc().settings;
      if (!Array.isArray(d.categories) || !d.categories.length)
        d.categories = defaultDoc().categories;
      let dirty = false;
      if (migrateCats(d)) dirty = true;
      if (migrateSav(d)) dirty = true;
      if (!Array.isArray(d.accounts) || !d.accounts.length) {
        d.accounts = defaultDoc().accounts;
        dirty = true;
      }
      d.goals = d.goals || [];
      d.shortcuts = d.shortcuts || [];
      d.transactions = d.transactions || [];
      if (migrateGrocery(d)) dirty = true;
      if (migrateNeeds(d)) dirty = true;
      if (!Array.isArray(d.merchants) || !d.merchants.length) {
        if (!migrateMerch(d)) {
          d.merchants = [];
          dirty = true;
        } else dirty = true;
      }
      if (mergePool(d)) dirty = true;
      migrateBud(d);
      if (migrateGoals(d)) dirty = true;
      if (dirty) Store.set("doc", d).catch(() => undefined);
      if (dead) return;
      dispatch({ t: "BOOT", doc: d });
      ghLoadToken();

      attachGist({
        getDoc: () => ref.current.doc,
        setDoc: (nd) => dispatch({ t: "LOAD_DOC", doc: nd }),
        saved: () => {
          const cur = ref.current.doc;
          if (cur) Store.set("doc", cur).catch(() => undefined);
        },
        bump: () => dispatch({ t: "BUMP_GIST" }),
        pushed: (at) => dispatch({ t: "GIST_PUSHED", at }),
      });
      /* a connected app lives by its gist backup — auto-unlock or ask */
      if (gistConnected()) {
        Gist.kLoad().then((ok) => {
          if (dead) return;
          if (ok) {
            if (gistDirty()) Gist.push().catch(() => undefined);
            else
              Gist.pull().then(() => {
                /* setDoc inside pull triggers render */
              });
          } else {
            setTimeout(() => {
              if (gistConnected() && !Gist.key)
                dispatch({ t: "OPEN_SHEET", sheet: { name: "gist-unlock" } });
            }, 350);
          }
        });
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  // ---- persist (port of App.save, minus the dirty flag which the reducer sets) ----
  const doc = state.doc;
  const booted = state.booted;
  useEffect(() => {
    if (!booted || !doc) return;
    Store.set("doc", doc).catch(() => undefined);
    Gist.schedulePush();
  }, [doc, booted]);

  return <StoreCtx.Provider value={ctx}>{children}</StoreCtx.Provider>;
}
