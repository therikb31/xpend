// Pure formatting + date helpers — verbatim ports of the legacy global helpers.
// rupees()/shortAmt() take `hide` explicitly (legacy read App.data.settings).

export const APP_VER = "120";

export const pad = (n: number): string => String(n).padStart(2, "0");

export function dstr(d: Date): string {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function parseD(s: string): Date {
  const a = s.split("-").map(Number);
  return new Date(a[0], a[1] - 1, a[2]);
}

export function monthKey(d: Date): string {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1);
}

export function parseMk(k: string): Date {
  const a = k.split("-").map(Number);
  return new Date(a[0], a[1] - 1, 1);
}

export function todayStr(): string {
  return dstr(new Date());
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const init = (n: string | null | undefined): string =>
  String(n == null ? "" : n)
    .replace(/[^A-Za-z0-9]/g, "")
    .charAt(0)
    .toUpperCase() || "•";

const NF = new Intl.NumberFormat("en-IN");

export function money(n: number): string {
  return NF.format(n);
}

function sig(n: number): string {
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return String(parseFloat(n.toFixed(1)));
  return String(parseFloat(n.toFixed(2)));
}

/** paise → ₹ string (INR grouping, paise shown only when non-zero). */
export function rupees(p: number, hide = false): string {
  if (hide) return "₹••••";
  const r = Math.abs(p || 0) / 100;
  const whole = Math.floor(r);
  const paise = Math.round((r - whole) * 100);
  const showPaise = (p % 100) !== 0;
  let str = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    currencyDisplay: "symbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(whole);
  if (showPaise) str += "." + pad(paise);
  return p < 0 ? "-" + str : str;
}

/** Compact axis amount: 1.5Cr / 2.3L / 4.5k. */
export function shortAmt(p: number, hide = false): string {
  if (hide) return "•••";
  const r = Math.abs(p || 0) / 100;
  if (r >= 10000000) return sig(r / 10000000) + "Cr";
  if (r >= 100000) return sig(r / 100000) + "L";
  if (r >= 1000) return sig(r / 1000) + "k";
  return String(Math.round(r));
}

export function dayLabel(dateStr: string): string {
  if (dateStr === todayStr()) return "Today";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dateStr === dstr(y)) return "Yesterday";
  return parseD(dateStr).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

/** Parse a human rupee input ("12,345.67") → paise, NaN when invalid. */
export function parseRupeesToPaise(raw: string): number {
  return Math.round(parseFloat((raw || "").replace(/,/g, "")) * 100);
}

// --- category emoji (legacy EMO map + hashed fallback) ---

const EMO: Record<string, string> = {
  "cat-g": "🛒",
  "cat-e": "🍜",
  "cat-t": "🚕",
  "cat-u": "💡",
  "cat-s": "👕",
  "cat-h": "💊",
  "cat-en": "🎬",
  "cat-tr": "✈️",
  "cat-r": "🏠",
  "cat-o": "🧾",
  "cat-sal": "💼",
  "cat-oi": "💰",
};

const EMO_FALLBACK = [
  "🧾", "🛍️", "📦", "⚽", "💻", "📚", "🎁", "👶",
  "🐾", "🧸", "⚡", "🎧", "📷", "🪴", "🛠️", "🧴",
  "🍕", "☕", "🍫", "🎮",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function fallbackEmoji(c: { id?: string; name?: string } | null): string {
  const src = (c ? (c.id || "") + (c.name || "") : "") as string;
  return EMO_FALLBACK[hashStr(src) % EMO_FALLBACK.length];
}

export function catEmoji(c: { id?: string; emoji?: string } | null): string {
  return (c && c.emoji) || (c && c.id && EMO[c.id]) || fallbackEmoji(c) || "🧾";
}
