// Friend + list invite links. Hash routes so the static build (no server
// rewrites) can receive them: #/f/<githubUsername>/<displayName> adds a
// friend, #/l/<listId>/<fromUsername> joins a shared grocery list.

export function appBase(): string {
  const u = window.location.href.split("#")[0];
  return u.endsWith("/") ? u : u + "/";
}

export function friendLink(username: string, displayName: string): string {
  return appBase() + "#/f/" + encodeURIComponent(username) + "/" + encodeURIComponent(displayName || username);
}

export function listLink(listId: string, fromUsername: string, salt: string): string {
  return (
    appBase() +
    "#/l/" +
    encodeURIComponent(listId) +
    "/" +
    encodeURIComponent(fromUsername) +
    "/" +
    encodeURIComponent(salt)
  );
}

/** Key-carrying invite (OAuth era): the list key rides in the link, so the
    joiner needs no passphrase. Bearer credential — anyone with it reads the list. */
export function shareLink(listId: string, fromUsername: string, keyB64: string): string {
  return (
    appBase() +
    "#/s/" +
    encodeURIComponent(listId) +
    "/" +
    encodeURIComponent(fromUsername) +
    "/" +
    encodeURIComponent(keyB64)
  );
}

export interface ParsedInvite {
  kind: "friend" | "list";
  username: string; // friend login OR list sender login
  name: string; // display name OR list id
  salt?: string; // list salt (legacy #/l/ invites only)
  keyB64?: string; // list key (#/s/ invites only)
}

/** Parse a pasted link OR a bare hash (#/f/…, #/l/…, #/s/…) into an invite. */
export function parseInvite(text: string): ParsedInvite | null {
  const t = (text || "").trim();
  if (!t) return null;
  const h = t.includes("#") ? t.slice(t.indexOf("#")) : t.startsWith("/") ? "#" + t : t;
  const m = h.match(/^#\/([fls])\/([^/]+)\/([^/?#]+)(?:\/([^/?#]+))?/);
  if (!m) return null;
  try {
    const a = decodeURIComponent(m[2]).trim();
    const b = decodeURIComponent(m[3]).trim();
    if (!a || !b) return null;
    if (m[1] === "f") {
      if (!validUsername(a)) return null;
      return { kind: "friend", username: a, name: b };
    }
    const secret = m[4] ? decodeURIComponent(m[4]).trim() : "";
    if (m[1] === "s") {
      if (!secret) return null;
      return { kind: "list", username: b, name: a, keyB64: secret };
    }
    return { kind: "list", username: b, name: a, salt: secret || undefined };
  } catch {
    return null;
  }
}

export function validUsername(u: string): boolean {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test((u || "").trim().replace(/^@/, ""));
}

export function cleanUsername(u: string): string {
  return (u || "").trim().replace(/^@/, "").toLowerCase();
}
