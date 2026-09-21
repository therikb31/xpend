// GitHub link — token-based (OAuth device flow is impossible from a
// browser page: github.com/login/* sends no CORS headers, so only a
// proxy backend could call it — rejected: it would see your token).
// Instead: paste a classic token (gist scope) once; the app verifies it
// via GET /user (api.github.com allows browser CORS), stores it like the
// backup key cache, and uses it for API + escrow. Same passphrase-free
// outcome, zero new infrastructure.

const LS_TOKEN = "xpend:gh";

let token: string | null = null;

export function ghLinked(): boolean {
  return !!token;
}

/** Raw OAuth token for API use (null when unlinked). */
export function ghToken(): string | null {
  return token;
}

function cacheToken(t: string | null): void {
  token = t;
  try {
    if (t) localStorage.setItem(LS_TOKEN, t);
    else localStorage.removeItem(LS_TOKEN);
  } catch {
    /* ignore */
  }
}

export function ghLoadToken(): boolean {
  try {
    const t = localStorage.getItem(LS_TOKEN);
    if (t) {
      token = t;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function ghUnlink(): void {
  cacheToken(null);
}

async function ghFetch(t: string, path: string): Promise<unknown> {
  const r = await fetch("https://api.github.com" + path, {
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + t },
  });
  if (r.status === 401) throw new Error("token-rejected");
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(j.message || "HTTP " + r.status);
  }
  return r.json();
}

/** Verify a pasted token (must read the login) and link it. */
export async function linkWithToken(pat: string): Promise<string> {
  const t = (pat || "").trim();
  if (!t) throw new Error("empty-token");
  const u = (await ghFetch(t, "/user")) as { login?: string };
  if (!u || !u.login) throw new Error("No login");
  cacheToken(t);
  return u.login;
}

/** Authed GitHub API via the linked token (throws when unlinked). */
export async function ghApi(method: string, path: string, body?: unknown): Promise<unknown> {
  if (!token) throw new Error("not-linked");
  const t = token;
  const r = await fetch("https://api.github.com" + path, {
    method,
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + t },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) throw new Error("token-rejected");
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(j.message || "HTTP " + r.status);
  }
  return r.status === 204 ? null : r.json();
}

export async function ghWhoami(): Promise<string> {
  const u = (await ghApi("GET", "/user")) as { login?: string };
  if (!u || !u.login) throw new Error("No login");
  return u.login;
}
