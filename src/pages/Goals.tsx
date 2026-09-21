// Goals — port of App.goals + goal rows.

import { Empty, GoalRow } from "../components/ui";
import { PAL, goalCalc, goalCurrent } from "../data/finance";
import { rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";

export function GoalsPage() {
  const { state, openSheet } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;

  const gs = doc.goals || [];
  const active = gs.filter((g) => !g.completed);
  const totalTarget = gs.reduce((s, g) => s + (g.target || 0), 0);
  const totalSaved = gs.reduce((s, g) => s + goalCurrent(g), 0);
  const totalRemaining = Math.max(0, totalTarget - totalSaved);
  const onTrack = active.filter((g) => goalCalc(g).status === "on-track").length;
  const needsAttention = active.filter((g) => goalCalc(g).status === "needs-attention").length;
  const overdue = active.filter((g) => goalCalc(g).status === "overdue").length;
  const completed = gs.filter((g) => g.completed).length;
  const monthlyReq = active.reduce((s, g) => s + (goalCalc(g).required || 0), 0);
  const upcoming = active
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .slice(0, 5);
  const done = gs.filter((g) => g.completed);
  const colors: Record<string, string> = {};
  gs.forEach((g, i) => {
    colors[g.id] = PAL[i % PAL.length];
  });

  return (
    <div className="scr">
      <header className="scrhdr">
        <div className="hdr-title">Goals</div>
        <div className="hdr-left">
          <button className="cbtn small" onClick={() => openSheet({ name: "export" })} aria-label="Export data">
            {IC.dots}
          </button>
          <button className="btn mini" onClick={() => openSheet({ name: "goal-form" })}>
            {IC.plus} Create Goal
          </button>
        </div>
      </header>
      <div className="card">
        <div className="card-title">Overview</div>
        <div className="metrics-grid">
          <div className="metric">
            <span className="metric-val">{rupees(totalTarget, hide)}</span>
            <span className="metric-lbl">Total Needed</span>
          </div>
          <div className="metric">
            <span className="metric-val inc">{rupees(totalSaved, hide)}</span>
            <span className="metric-lbl">Saved</span>
          </div>
          <div className="metric">
            <span className="metric-val neg">{rupees(totalRemaining, hide)}</span>
            <span className="metric-lbl">Remaining</span>
          </div>
          <div className="metric">
            <span className="metric-val">
              {rupees(monthlyReq, hide)}
              <small>/mo</small>
            </span>
            <span className="metric-lbl">Monthly Required</span>
          </div>
        </div>
        <div className="status-pills" style={{ marginTop: 14 }}>
          <span className="pill on">{onTrack} On Track</span>
          <span className={"pill " + (needsAttention ? "warn" : "")}>{needsAttention} Need Attention</span>
          <span className={"pill " + (overdue ? "err" : "")}>{overdue} Overdue</span>
          <span className={"pill " + (completed ? "ok" : "")}>{completed} Completed</span>
        </div>
      </div>
      <div className="sec-label">Upcoming Goals</div>
      {upcoming.length ? (
        upcoming.map((g) => (
          <GoalRow
            key={g.id}
            doc={doc}
            g={g}
            color={colors[g.id]}
            onOpen={(id) => openSheet({ name: "goal-detail", id })}
          />
        ))
      ) : (
        <div className="card">
          <Empty icon={IC.target} title="No goals yet" sub="Create a goal for something you are saving for" />
        </div>
      )}
      {done.length > 0 && (
        <>
          <div className="sec-label">Completed</div>
          {done.map((g) => (
            <GoalRow
              key={g.id}
              doc={doc}
              g={g}
              color={colors[g.id]}
              onOpen={(id) => openSheet({ name: "goal-detail", id })}
            />
          ))}
        </>
      )}
    </div>
  );
}
