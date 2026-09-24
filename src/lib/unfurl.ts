// Buy-link unfurl — one-shot preview fetch, cached on the item.
// Only ever called from explicit user action (add / refresh), so the pasted
// URL leaves the device exactly once. Everything degrades to favicon +
// hostname + manual title when offline or when the fetch fails.

import { uid } from "./format";
import type { BuyLink } from "../types";

export const MAX_LINKS = 5;

/** Normalize pasted text to an absolute https URL, or null when invalid. */
export function normalizeUrl(raw: string): string | null {
  const v = (raw || "").trim();
  if (!v) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : "https://" + v;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function faviconFor(url: string): string {
  return "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(siteOf(url)) + "&sz=64";
}

interface Unfurled {
  title: string;
  desc: string;
  image: string;
}

/** Best-effort title/desc/image via the free microlink API (no key). */
export async function unfurl(url: string): Promise<Unfurled | null> {
  try {
    const r = await fetch("https://api.microlink.io?url=" + encodeURIComponent(url), {
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const d = (j && j.data) || {};
    const title = typeof d.title === "string" && d.title.trim() ? d.title.trim() : "";
    const desc = typeof d.description === "string" ? d.description.trim().slice(0, 160) : "";
    const image =
      d.image && typeof d.image.url === "string" && /^https?:\/\//i.test(d.image.url) ? d.image.url : "";
    if (!title && !image) return null;
    return { title, desc, image };
  } catch {
    return null;
  }
}

/** Build a BuyLink: unfurl when online, otherwise favicon + hostname shell. */
export async function buildLink(url: string, manualTitle?: string): Promise<BuyLink> {
  const u = await unfurl(url);
  const site = siteOf(url);
  const title =
    (manualTitle || "").trim() || (u && u.title) || site;
  return {
    id: uid(), url, title,
    desc: (u && u.desc) || "",
    image: (u && u.image) || "",
    site, fetchedAt: Date.now(),
  };
}
