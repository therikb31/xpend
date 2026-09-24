// Bottom navigation (mobile floating pill) / left rail (desktop via CSS).
// Port of App.renderNav — including the rule that the Activity tab covers the
// overview/category drill views.

import { IC } from "../../lib/icons";
import type { TabId } from "../../services/store";
import { useApp } from "../../services/store";
import type { View } from "../../types";

const TABS: Array<{ id: TabId; label: string; icon: keyof typeof IC }> = [
  { id: "activity", label: "Activity", icon: "list" },
  { id: "summary", label: "Insights", icon: "pie" },
  { id: "budget", label: "Budget", icon: "trend" },
  { id: "goals", label: "Goals", icon: "target" },
  { id: "groceries", label: "Groceries", icon: "cart" },
  { id: "accounts", label: "Accounts", icon: "wallet" },
];

function isOn(tab: TabId, view: View, prevView: View): boolean {
  if (tab === "activity")
    return (
      view === "overview" ||
      view === "activity" ||
      (view === "category" && (prevView === "overview" || prevView === "activity"))
    );
  return view === tab || (view === "category" && prevView === tab) || (view === "merchant" && prevView === tab) || (view === "bucket" && prevView === tab) || (view === "ask" && prevView === tab);
}

export function BottomNav() {
  const { state, goTab } = useApp();
  return (
    <nav id="nav" aria-label="Tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={"nav-item " + (isOn(t.id, state.view, state.prevView) ? "on" : "")}
          onClick={() => goTab(t.id)}
        >
          <span className="ni-ic">{IC[t.icon]}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
