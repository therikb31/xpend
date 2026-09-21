// App shell — ports the #app / #screen / #nav / #toast structure, the view
// switch (App.render), floaters, and the visibilitychange gist flush.
// iOS safe-area + viewport handling is centralized here via useViewportFix
// and src/styles/app.css (ported verbatim from the legacy <style>).

import { useEffect } from "react";
import { BottomNav } from "./components/nav/BottomNav";
import { useViewportFix } from "./hooks/useViewportFix";
import { IC } from "./lib/icons";
import { AccountsPage } from "./pages/Accounts";
import { ActivityPage } from "./pages/Activity";
import { AddPage } from "./pages/Add";
import { BudgetPage } from "./pages/Budget";
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
  const { state, openAdd } = useApp();
  useViewportFix();

  // Flush pending backup when leaving the page (port of visibilitychange).
  useEffect(() => {
    const h = () => {
      if (document.visibilityState === "hidden") Gist.push().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

  const ov = state.view === "overview" || state.view === "category" || state.view === "merchant";
  const add = state.view === "add";
  return (
    <div id="app" className={(ov ? "ov " : "") + (add ? "add" : "")}>
      <Screen />
      {!add && <BottomNav />}
      {!add && state.booted && (
        <div className="fab-stack">
          <button className="fab add" onClick={openAdd} aria-label="Add transaction">
            {IC.plusB}
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
