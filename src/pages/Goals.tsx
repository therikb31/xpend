// Goals — port of App.goals + goal rows.

import { Empty, GoalRow } from "../components/ui";
import { PAL, goalOrder, goalProgress, liveGoals, p1Floor } from "../data/finance";
import { rupees } from "../lib/format";
import { IC } from "../lib/icons";
import { useApp } from "../services/store";

export function GoalsPage() {
  const { state, openSheet } = useApp();
  const doc = state.doc!;
  const hide = !!doc.settings.hideBalances;

  const gs = (doc.goals || []).filter((g) => !g.deleted);
  const active = liveGoals(doc);
  const totalTarget = gs.reduce((s, g) => s + (g.target || 0), 0);
  const saved = gs.reduce((s, g) => s + goalProgress(doc, g).current, 0);
  const onTrack = active.filter((g) => goalProgress(doc, g).status === "on-track").length;
  const needsAttention = active.filter((g) => goalProgress(doc, g).status === "needs-attention").length;
  const overdue = active.filter((g) => goalProgress(doc, g).status === "overdue").length;
  const completed = gs.filter((g) => g.completed).length;
  const monthlyReq = active.reduce((s, g) => s + (goalProgress(doc, g).required || 0), 0);
  const floor = p1Floor(doc);
  const upcoming = active
    .slice()
    .sort(goalOrder)
    .slice(0, 8);
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
            <span className="metric-val inc">{rupees(saved, hide)}</span>
            <span className="metric-lbl">Saved</span>
          </div>
          <div className="metric">
            <span className="metric-val neg">{rupees(floor, hide)}</span>
            <span className="metric-lbl">Minimum Due</span>
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
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="btn mini" style={{ flex: 1 }} onClick={() => openSheet({ name: "goal-fund" })}>
            Fund goals
          </button>
          <button className="btn mini ghost" style={{ flex: 1 }} onClick={() => openSheet({ name: "goal-whatif" })}>
            What-if
          </button>
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
