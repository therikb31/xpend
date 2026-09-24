// Ask AI — full-screen chat over your expenses (OpenRouter, tool-using).
// History lives per-device in localStorage (never synced). Tools run
// locally; only their results cross to the model. General info only.

import { useEffect, useRef, useState } from "react";
import { Empty } from "../components/ui";
import { monthKey } from "../lib/format";
import { IC } from "../lib/icons";
import {
  askHistoryKey, buildSystem, getKey, getModel, runAgent,
} from "../services/ai";
import type { ChatMsg } from "../services/ai";
import { useApp } from "../services/store";

const HIST_CAP = 50;

interface UIMsg {
  role: "user" | "assistant";
  text: string;
  usage?: { total_tokens?: number };
  error?: string;
}

function loadHist(): UIMsg[] {
  try {
    const raw = JSON.parse(localStorage.getItem(askHistoryKey()) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (m): m is UIMsg =>
          !!m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string"
      )
      .slice(-HIST_CAP);
  } catch {
    return [];
  }
}

const QUICK = [
  "Month digest",
  "Top drivers",
  "Expected spends",
  "Am I saving enough?",
  "Compare cards",
];

const QUICK_TEXT: Record<string, string> = {
  "Month digest": "Summarise this month: totals, top drivers, one flag.",
  "Top drivers": "What are my top spending categories and merchants this month?",
  "Expected spends": "Based on my repeat-purchase patterns, what will I likely spend on next month?",
  "Am I saving enough?": "Am I saving enough against the 50-30-20 rule?",
  "Compare cards": "Analyse my merchant mix and suggest what kind of credit card suits it. I'll paste shortlisted cards for exact math.",
};

export function AskPage() {
  const { state, openSheet, back, go, toast } = useApp();
  const doc = state.doc!;
  const [msgs, setMsgs] = useState<UIMsg[]>(loadHist);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const gotText = useRef(false);
  const online = typeof navigator === "undefined" || navigator.onLine;
  const mkey = state.mkey;
  const cur = new Date();
  const mk = new Date(parseInt(mkey.slice(0, 4), 10), parseInt(mkey.slice(5, 7), 10) - 1, 1);
  const monthName =
    mk.getFullYear() === cur.getFullYear() && mk.getMonth() === cur.getMonth()
      ? "This month"
      : mk.toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  useEffect(() => {
    try {
      localStorage.setItem(askHistoryKey(), JSON.stringify(msgs.slice(-HIST_CAP)));
    } catch {
      /* ignore */
    }
  }, [msgs]);

  useEffect(() => {
    const s = document.getElementById("screen");
    if (s) s.scrollTo({ top: s.scrollHeight });
  }, [msgs, status, busy]);

  const push = (m: UIMsg) => setMsgs((prev) => [...prev, m].slice(-HIST_CAP));

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const key = getKey();
    if (!key) {
      toast("Add your OpenRouter key in Settings → AI");
      go("settings", state.view);
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      push({ role: "assistant", text: "", error: "You're offline — AI needs internet." });
      return;
    }
    const history: ChatMsg[] = [...msgs.slice(-20), { role: "user" as const, text: q }].map((m) => ({
      role: m.role,
      content: m.text,
    }));
    setMsgs((prev) => [...prev, { role: "user" as const, text: q }, { role: "assistant" as const, text: "" }].slice(-HIST_CAP));
    setInput("");
    setBusy(true);
    setStatus("Thinking…");
    const ctl = new AbortController();
    abortRef.current = ctl;
    gotText.current = false;
    try {
      await runAgent({
        key,
        model: getModel(),
        doc,
        system: buildSystem(doc),
        history,
        signal: ctl.signal,
        onEvent: (e) => {
          if (e.type === "token" && e.text) {
            const t = e.text;
            gotText.current = true;
            setMsgs((prev) => {
              const n = [...prev];
              const l = n[n.length - 1];
              if (l && l.role === "assistant") n[n.length - 1] = { ...l, text: l.text + t };
              return n;
            });
          } else if (e.type === "tool") {
            setStatus("Checking " + (e.name || "data") + "…");
          } else if (e.type === "usage" && e.usage) {
            const u = e.usage;
            setMsgs((prev) => {
              const n = [...prev];
              const l = n[n.length - 1];
              if (l && l.role === "assistant") n[n.length - 1] = { ...l, usage: { total_tokens: u.total_tokens } };
              return n;
            });
          }
        },
      });
      if (!gotText.current && !ctl.signal.aborted) {
        setMsgs((prev) => {
          const n = [...prev];
          const l = n[n.length - 1];
          if (l && l.role === "assistant" && !l.text && !l.error) {
            n[n.length - 1] = { ...l, error: "Empty reply — try again or another model." };
          }
          return n;
        });
      }
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const msg = (err && err.message) || "Something went wrong.";
      const hint =
        err?.code === "auth"
          ? " Add a fresh key in Settings → AI."
          : err?.code === "abort"
            ? ""
            : " Retry, or check Settings → AI.";
      setMsgs((prev) => {
        const n = [...prev];
        const l = n[n.length - 1];
        if (l && l.role === "assistant" && !l.text) n[n.length - 1] = { ...l, error: msg + hint };
        else n.push({ role: "assistant", text: "", error: msg + hint });
        return n;
      });
    } finally {
      setBusy(false);
      setStatus(null);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const clear = () => {
    if (!msgs.length) return;
    if (!window.confirm("Clear this chat history?")) return;
    setMsgs([]);
    try {
      localStorage.removeItem(askHistoryKey());
    } catch {
      /* ignore */
    }
  };

  const hasKey = !!getKey();

  return (
    <div className="scr">
      <header className="scrhdr">
        <div className="hdr-left">
          <button className="cbtn small" onClick={back} aria-label="Back">
            {IC.left}
          </button>
        </div>
        <div className="hdr-title">Ask AI</div>
        <div className="hdr-left">
          <button className="cbtn small" onClick={clear} aria-label="Clear chat">
            {IC.trash}
          </button>
        </div>
      </header>
      <div className="ov-chips">
        <button className="ov-chip" onClick={() => openSheet({ name: "month" })}>
          {monthName}
        </button>
        {!online && <span className="pill warn">Offline</span>}
        {!hasKey && <span className="pill warn">No key</span>}
      </div>
      {!msgs.length && (
        <>
          <Empty
            icon={IC.star}
            title="Ask about your money"
            sub={hasKey ? "Digests, budgets, card picks — tools read your ledger locally" : "Add your OpenRouter key first"}
          />
          {!hasKey && (
            <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => go("settings", state.view)}>
              Open Settings → AI
            </button>
          )}
          <div className="qprompts">
            {QUICK.map((q) => (
              <button key={q} type="button" className="chip" onClick={() => send(QUICK_TEXT[q] || q)}>
                {q}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="ask-list">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg msg-user">
              {m.text}
            </div>
          ) : m.error && !m.text ? (
            <div key={i} className="msg msg-ai msg-err">
              {m.error}
            </div>
          ) : (
            <div key={i} className="msg msg-ai">
              {m.text || (busy && i === msgs.length - 1 ? "…" : "")}
              {m.usage?.total_tokens != null && (
                <div className="msg-meta">~{(m.usage.total_tokens / 1000).toFixed(1)}k tokens</div>
              )}
            </div>
          )
        )}
        {status && busy && (
          <div className="ask-status">
            <span className="pill">{status}</span>
          </div>
        )}
      </div>
      <div className="ask-row">
        <input
          type="text"
          className="ask-input"
          placeholder={hasKey ? "Ask anything…" : "Add your key first…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          maxLength={2000}
        />
        {busy ? (
          <button type="button" className="ask-send" onClick={stop} aria-label="Stop">
            {IC.x}
          </button>
        ) : (
          <button
            type="button"
            className="ask-send"
            onClick={() => send(input)}
            aria-label="Send"
            disabled={!input.trim()}
          >
            {IC.right}
          </button>
        )}
      </div>
      <div className="tsub" style={{ textAlign: "center", padding: "2px 0 6px", color: "var(--muted)" }}>
        General info only — not financial advice. Month {monthKey(new Date()) === mkey ? "scoped" : mkey}.
      </div>
    </div>
  );
}
