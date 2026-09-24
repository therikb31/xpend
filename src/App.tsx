// App shell — ports the #app / #screen / #nav / #toast structure, the view
// switch (App.render), floaters, and the visibilitychange gist flush.
// iOS safe-area + viewport handling is centralized here via useViewportFix
// and src/styles/app.css (ported verbatim from the legacy <style>).

import { useEffect } from "react";
import { BottomNav } from "./components/nav/BottomNav";
import { useFriendAdd } from "./hooks/useFriendAdd";
import { useGrocerySync } from "./hooks/useGrocerySync";
import { useViewportFix } from "./hooks/useViewportFix";
import { IC } from "./lib/icons";
import { cleanUsername, parseInvite } from "./lib/friends";
import { AccountsPage } from "./pages/Accounts";
import { ActivityPage } from "./pages/Activity";
import { AddPage } from "./pages/Add";
import { AskPage } from "./pages/Ask";
import { BudgetPage } from "./pages/Budget";
import { BucketPage } from "./pages/Bucket";
import { CategoryPage } from "./pages/Category";
import { GoalsPage } from "./pages/Goals";
import { GroceriesPage } from "./pages/Groceries";
import { InsightsPage } from "./pages/Insights";
import { MerchantPage } from "./pages/Merchant";
import { OverviewPage } from "./pages/Overview";
import { SettingsPage } from "./pages/Settings";
import { Gist } from "./services/gist";
import { AppProvider, scrollMem, useApp } from "./services/store";
import { SheetRoot } from "./sheets/Sheet";
import "./styles/app.css";

function Page() {
  const { state } = useApp();
  if (!state.booted || !state.doc) {
    return (
      <div className="scr">
        <div className="empty">
          <div className="t">Loading…</div>
        </div>
      </div>
    );
  }
  switch (state.view) {
    case "add":
      return <AddPage />;
    case "overview":
      return <OverviewPage />;
    case "activity":
      return <ActivityPage />;
    case "summary":
      return <InsightsPage />;
    case "budget":
      return <BudgetPage />;
    case "category":
      return <CategoryPage />;
    case "merchant":
      return <MerchantPage />;
    case "bucket":
      return <BucketPage />;
    case "ask":
      return <AskPage />;
    case "goals":
      return <GoalsPage />;
    case "groceries":
      return <GroceriesPage />;
    case "accounts":
      return <AccountsPage />;
    case "settings":
      return <SettingsPage />;
    default:
      return <OverviewPage />;
  }
}

function Screen() {
  const { state } = useApp();
  // Port of render() scroll behavior: reset to top, except add/edit
  // round-trips which restore the saved offset (scrollMem).
  useEffect(() => {
    const s = document.getElementById("screen");
    if (!s) return;
    if (scrollMem.v != null) {
      s.scrollTop = scrollMem.v;
      scrollMem.v = null;
    } else {
      s.scrollTop = 0;
    }
  }, [state.view, state.mkey, state.flt]);
  return (
    <main id="screen">
      <Page />
    </main>
  );
}

function Shell() {
  const { state, openAdd, openSheet, go } = useApp();
  const addFriend = useFriendAdd();
  useViewportFix();
  useGrocerySync();

  // Invite links (#/f/… add-friend, #/l/… join-list). Consumed once after
  // boot (fresh launch from a messenger), then cleared so a reload doesn't
  // re-trigger. A hashchange listener covers the same-tab case, where a
  // fragment-only navigation doesn't reload the page.
  useEffect(() => {
    if (!state.booted) return;
    const consume = () => {
      const h = window.location.hash;
      if (!h || !h.startsWith("#/")) return;
      const href = window.location.href;
      const inv = parseInvite(h);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (!inv) return;
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
        window.location.search.includes("standalone=1"); // headless coverage of PWA-only paths
      if (!standalone) {
        // Wrong container (e.g. iOS Safari — storage is separate from the
        // installed PWA): don't consume into an empty doc, hand over instead.
        openSheet({ name: "open-in-app", id: href, id2: inv.kind });
        return;
      }
      if (inv.kind === "friend") {
        // One shared flow for every mode (link-click here; paste + typed in
        // the friend sheet): validate → save → doorbell signal, best-effort.
        // Falls back to the sheet only when saving is impossible.
        const name = (inv.name || "").trim() || cleanUsername(inv.username);
        addFriend(inv.username, name).then((r) => {
          if (r === "failed" || r === "invalid") {
            openSheet({ name: "friend-add", id: inv.username, id2: inv.name });
          }
        });
      } else {
        openSheet({ name: "grocery-join", id: inv.name, id2: inv.username, id3: inv.salt, id4: inv.keyB64 });
      }
    };
    consume();
    window.addEventListener("hashchange", consume);
    return () => window.removeEventListener("hashchange", consume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.booted]);

  // Flush pending backup when leaving the page (port of visibilitychange).
  useEffect(() => {
    const h = () => {
      if (document.visibilityState === "hidden") Gist.push().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

  const ov = state.view === "overview" || state.view === "category" || state.view === "merchant" || state.view === "bucket";
  const add = state.view === "add";
  return (
    <div id="app" className={(ov ? "ov " : "") + (add ? "add" : "")}>
      <Screen />
      {!add && <BottomNav />}
      {state.booted && state.view === "overview" && (
        <div className="fab-stack">
          <button className="fab add" onClick={openAdd} aria-label="Add transaction">
            {IC.plusB}
          </button>
        </div>
      )}
      {state.booted &&
        (state.view === "summary" || state.view === "budget" || state.view === "goals") && (
          <div className="fab-stack">
            <button className="fab ask" onClick={() => go("ask", state.view)} aria-label="Ask AI">
              {IC.star}
            </button>
          </div>
        )}
      <SheetRoot />
      <div id="toast" className={state.toast ? "on" : ""}>
        {state.toast ?? ""}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
