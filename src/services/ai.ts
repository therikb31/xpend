// OpenRouter client + agent loop. Browser-direct (static hosting, no proxy):
// key in localStorage only (never in the doc/sync/export), SSE streaming,
// tool rounds executed locally against the doc (only results cross over).

import { TOOL_DEFS, runTool } from "./aiTools";
import { merchById, merchantCount } from "../data/finance";
import { monthKey, todayStr } from "../lib/format";
import type { Doc } from "../types";

export const LS_OR_KEY = "xpend:or";
const LS_MODEL = "xpend:ai-model";
const LS_ASK = "xpend:ask";
const API = "https://openrouter.ai/api/v1";
export const DEFAULT_MODEL = "openrouter/free";
export const MAX_TOOL_ROUNDS = 6;
export const MAX_CONTEXT_TOKENS = 20000;

export function getKey(): string | null {
  try {
    return localStorage.getItem(LS_OR_KEY);
  } catch {
    return null;
  }
}

export function setKey(k: string): void {
  try {
    if (k) localStorage.setItem(LS_OR_KEY, k);
    else localStorage.removeItem(LS_OR_KEY);
  } catch {
    /* storage unavailable — key lives for the session only */
  }
}

export function clearKey(): void {
  setKey("");
}

export function getModel(): string {
  try {
    return localStorage.getItem(LS_MODEL) || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setModel(m: string): void {
  try {
    if (m && m !== DEFAULT_MODEL) localStorage.setItem(LS_MODEL, m);
    else localStorage.removeItem(LS_MODEL);
  } catch {
    /* ignore */
  }
}

/** Remove all AI-local state (key, model override, chat history). */
export function wipeAiLocal(): void {
  clearKey();
  try {
    localStorage.removeItem(LS_MODEL);
    localStorage.removeItem(LS_ASK);
  } catch {
    /* ignore */
  }
}

export function askHistoryKey(): string {
  return LS_ASK;
}

export type AiCode =
  | "auth" | "credits" | "rate" | "network" | "model" | "abort" | "context" | "unknown";

export interface AiError {
  code: AiCode;
  message: string;
  retryAfter?: number;
}

export function aiError(code: AiCode, message: string, retryAfter?: number): AiError {
  return { code, message, retryAfter };
}

function httpError(status: number, body: string, retryAfter?: number): AiError {
  const detail = body.slice(0, 300);
  if (status === 401 || status === 403) {
    return aiError("auth", "Key rejected (401/403). Paste a fresh OpenRouter key in Settings → AI.");
  }
  if (status === 402) {
    return aiError("credits", "Out of credits (402). Top up OpenRouter or switch to a :free model.");
  }
  if (status === 429) {
    return aiError(
      "rate",
      "Rate-limited (429)." + (retryAfter ? ` Retry after ~${retryAfter}s.` : " Wait a minute and retry.") +
        " Free models allow ~50 requests/day.",
      retryAfter
    );
  }
  if (status === 404) {
    return aiError("model", "Model not found (404). Pick another model ID in Settings → AI.");
  }
  return aiError("unknown", `Request failed (${status}). ${detail}`);
}

async function readError(res: Response): Promise<AiError> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }
  const ra = res.headers.get("Retry-After");
  return httpError(res.status, body, ra ? parseInt(ra, 10) || undefined : undefined);
}

function netError(e: unknown): AiError {
  if (e && typeof e === "object" && "code" in (e as Record<string, unknown>)) return e as AiError;
  return aiError(
    "network",
    "Network request failed. Check internet — or the browser blocked the call (CORS). " +
      "If this persists on Wi-Fi + mobile data, OpenRouter may not allow browser origins."
  );
}

export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

/* ---------------- key verify + model list ---------------- */

export interface KeyInfo {
  ok: boolean;
  label?: string;
  limit_remaining?: number | null;
  usage_daily?: number;
  error?: AiError;
}

export async function verifyKey(key: string, signal?: AbortSignal): Promise<KeyInfo> {
  try {
    const res = await fetch(API + "/key", {
      headers: { Authorization: "Bearer " + key },
      signal,
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const j = await res.json();
    const d = (j && j.data) || {};
    return {
      ok: true,
      label: typeof d.label === "string" ? d.label : undefined,
      limit_remaining: typeof d.limit_remaining === "number" ? d.limit_remaining : null,
      usage_daily: typeof d.usage_daily === "number" ? d.usage_daily : undefined,
    };
  } catch (e) {
    return { ok: false, error: netError(e) };
  }
}

export async function fetchModels(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(API + "/models", { signal });
  if (!res.ok) throw await readError(res);
  const j = await res.json();
  const arr = Array.isArray(j && j.data) ? j.data : [];
  return arr.map((m: { id?: unknown }) => String(m.id || "")).filter(Boolean);
}

/* ---------------- chat (SSE, tool-call aware) ---------------- */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  args: string;
}

export interface ChatMsg {
  role: ChatRole;
  content: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export interface StreamResult {
  content: string;
  toolCalls: ToolCall[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const HDR = (key: string) => ({
  Authorization: "Bearer " + key,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://therikb31.github.io/xpend/",
  "X-Title": "Xpend",
});

export async function streamChat(opts: {
  key: string;
  model: string;
  messages: ChatMsg[];
  tools?: boolean;
  signal?: AbortSignal;
  onToken?: (t: string) => void;
}): Promise<StreamResult> {
  let res: Response;
  try {
    res = await fetch(API + "/chat/completions", {
      method: "POST",
      headers: HDR(opts.key),
      signal: opts.signal,
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
        ...(opts.tools ? { tools: TOOL_DEFS.map((t) => ({ type: "function", function: t })) } : null),
      }),
    });
  } catch (e) {
    throw netError(e);
  }
  if (!res.ok || !res.body) throw await readError(res);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let content = "";
  const calls = new Map<number, { id: string; name: string; args: string }>();
  let usage: StreamResult["usage"];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const ln of lines) {
      const line = ln.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(data) as Record<string, unknown>;
      } catch {
        continue;
      }
      const u = j.usage as StreamResult["usage"] | undefined;
      if (u && typeof u === "object") usage = u;
      const choices = j.choices as Array<{ delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> } }> | undefined;
      const delta = choices && choices[0] && choices[0].delta;
      if (!delta) continue;
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        if (opts.onToken) opts.onToken(delta.content);
      }
      for (const tc of delta.tool_calls || []) {
        const i = tc.index || 0;
        let cur = calls.get(i);
        if (!cur) {
          cur = { id: "", name: "", args: "" };
          calls.set(i, cur);
        }
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
      }
    }
  }
  return {
    content,
    toolCalls: [...calls.values()].filter((c) => c.name),
    usage,
  };
}

/* ---------------- agent loop ---------------- */

export interface AgentEvent {
  type: "token" | "tool" | "usage";
  text?: string;
  name?: string;
  usage?: StreamResult["usage"];
}

export async function runAgent(opts: {
  key: string;
  model: string;
  doc: Doc;
  system: string;
  history: ChatMsg[];
  signal?: AbortSignal;
  onEvent?: (e: AgentEvent) => void;
}): Promise<{ text: string; toolRounds: number; usage?: StreamResult["usage"] }> {
  const messages: ChatMsg[] = [{ role: "system", content: opts.system }, ...opts.history];
  let spent = estimateTokens(opts.system + JSON.stringify(opts.history));
  let usage: StreamResult["usage"];
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    if (opts.signal?.aborted) throw aiError("abort", "Stopped.");
    const r = await streamChat({
      key: opts.key,
      model: opts.model,
      messages,
      tools: true,
      signal: opts.signal,
      onToken: (t) => {
        if (opts.onEvent) opts.onEvent({ type: "token", text: t });
      },
    });
    if (r.usage) {
      usage = {
        prompt_tokens: (usage?.prompt_tokens || 0) + (r.usage.prompt_tokens || 0),
        completion_tokens: (usage?.completion_tokens || 0) + (r.usage.completion_tokens || 0),
        total_tokens: (usage?.total_tokens || 0) + (r.usage.total_tokens || 0),
      };
      if (opts.onEvent) opts.onEvent({ type: "usage", usage });
    }
    spent += estimateTokens(r.content) + 800 * r.toolCalls.length;
    if (!r.toolCalls.length) {
      return { text: r.content, toolRounds: round, usage };
    }
    if (round >= MAX_TOOL_ROUNDS || spent > MAX_CONTEXT_TOKENS) {
      throw aiError(
        "context",
        "Too many steps for one answer — try a narrower question (one month, one category)."
      );
    }
    messages.push({
      role: "assistant",
      content: r.content,
      tool_calls: r.toolCalls.map((c) => ({
        id: c.id || `call_${round}_${c.name}`,
        type: "function" as const,
        function: { name: c.name, arguments: c.args },
      })),
    });
    for (const c of r.toolCalls) {
      if (opts.onEvent) opts.onEvent({ type: "tool", name: c.name });
      let args: unknown = {};
      try {
        args = c.args ? JSON.parse(c.args) : {};
      } catch {
        args = {};
      }
      let result: string;
      try {
        result = JSON.stringify(runTool(c.name, args, opts.doc)).slice(0, 12000);
      } catch (e) {
        result = JSON.stringify({ error: e instanceof Error ? e.message : "tool failed" });
      }
      spent += estimateTokens(result);
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: c.id || `call_${round}_${c.name}`,
      });
    }
  }
  throw aiError("context", "Too many steps for one answer — try a narrower question.");
}

/* ---------------- system prompt ---------------- */

export function buildSystem(doc: Doc): string {
  const now = new Date();
  const cur = monthKey(now);
  const keys = (doc.transactions || []).map((t) => t.date.slice(0, 7));
  keys.sort();
  const span = keys.length ? `${keys[0]} to ${keys[keys.length - 1]} (${doc.transactions.length} transactions)` : "no transactions yet";
  const cats = (doc.categories || [])
    .map((c) => `${c.id}=${c.name}(${c.kind}${c.need ? "," + c.need : ""})`)
    .join("; ");
  const topMerch = merchantCount(doc);
  const merchIds = Object.entries(topMerch)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 40)
    .map(([id]) => (id === "__none" ? "__none=Unassigned" : `${id}=${merchById(doc, id)?.name || "?"}`))
    .join("; ");
  const accs = (doc.accounts || []).map((a) => `${a.id}=${a.name}(${a.kind})`).join("; ");
  return [
    "You are Xpend's finance assistant. Currency is Indian rupees (₹); ALL tool money figures are decimal rupees. Today is " +
      todayStr() + " (month " + cur + ").",
    "Data: user transactions span " + span + ".",
    "Category directory (id=name(kind[,need-tag])): " + (cats || "none"),
    "Top merchants (id=name): " + (merchIds || "none"),
    "Accounts (id=name(kind)): " + (accs || "none"),
    "RULES:",
    "- You are READ-ONLY. No data changes, no goal/budget creation — propose; the user taps things in.",
    "- Tools are your only data source. Never invent amounts, dates, or merchants. If a tool errors, say so and stop that branch.",
    "- Start with get_month_overview (months=3-4 for averages/trends); drill only what the question needs. Page get_transactions (limit≤100) and stop when total_count is covered.",
    "- Free-text notes are never sent to you; do not ask for or repeat them.",
    "- Keep answers tight: headline numbers first, then 2-4 bullets. Tables only when comparing.",
    "MONEY MATH:",
    "- Monthly surplus = avg income − avg spending (use the minimum month when income varies; say so). Subtract existing goals' monthly_required before judging room.",
    "- Savings target feasibility: split overlapping timelines into phases (rate per phase), compare each phase to free surplus, keep one month of essentials unallocated.",
    "- 50-30-20 lens: needs≤50, wants≤30, savings≥20 (of income) as a sanity line, not gospel.",
    "CREDIT CARDS:",
    "- Lead with the data-exact merchant/category mix, then card archetypes (durable), then named cards each tagged VERIFY-ON-ISSUER-SITE (rates devalue; your knowledge has a cutoff — say so).",
    "- Offer breakeven math on the user's own numbers; invite pasting 2-3 shortlisted cards for exact comparison.",
    "REPLENISHMENT/EXPECTED SPENDS:",
    "- detect_replenishment returns firm (3+ buys) and early (2 buys) candidates; present Overdue vs Due-this-month with dates, qty, price, evidence; totals split known-price vs unknown-price (never silently incomplete); mark on-list items.",
    "SAFETY: general information only, not professional financial advice. No guaranteed returns. Emergency-fund prudence over optimization.",
  ].join("\n");
}
