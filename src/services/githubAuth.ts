// GitHub OAuth (device flow) — "Link GitHub account" without a client
// secret or redirect URI, so it works from a static page. The token (gist
// scope) signs API calls and fetches the key-escrow gist; it is cached in
// localStorage with the same posture as the backup key cache.
// The OAuth app client_id is public by design: baked-in default + override.

const LS_TOKEN = "xpend:gh";
const LS_CID = "xpend:ghcid";

// TODO(user): register an OAuth App (Settings → Developer settings →
// OAuth Apps, homepage = this app's URL) and paste the client_id here.
export const GH_CLIENT_ID = "";

export function ghClientId(): string {
  try {
    return localStorage.getItem(LS_CID) || GH_CLIENT_ID;
  } catch {
    return GH_CLIENT_ID;
  }
}

export function setGhClientId(id: string): void {
  try {
    localStorage.setItem(LS_CID, (id || "").trim());
  } catch {
    /* ignore */
  }
}

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

async function ghPost(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return (await r.json()) as Record<string, unknown>;
}

export interface DeviceGrant {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

/** Step 1: get a user code for github.com/device. */
export async function deviceStart(): Promise<DeviceGrant> {
  const cid = ghClientId();
  if (!cid) throw new Error("no-client-id");
  const j = await ghPost("https://github.com/login/device/code", {
    client_id: cid,
    scope: "gist",
  });
  if (!j.device_code || !j.user_code || !j.verification_uri)
    throw new Error(String(j.error_description || j.error || "device-flow-failed"));
  return {
    deviceCode: String(j.device_code),
    userCode: String(j.user_code),
    verificationUri: String(j.verification_uri),
    expiresIn: Number(j.expires_in || 900),
    interval: Number(j.interval || 5),
  };
}

export type PollResult =
  | { status: "ok"; token: string }
  | { status: "pending" }
  | { status: "denied" | "expired"; error: string };

/** Step 2: poll until the user approves/denies or the code expires. */
export async function devicePoll(deviceCode: string): Promise<PollResult> {
  const j = await ghPost("https://github.com/login/oauth/access_token", {
    client_id: ghClientId(),
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });
  if (j.access_token) {
    cacheToken(String(j.access_token));
    return { status: "ok", token: String(j.access_token) };
  }
  const err = String(j.error || "");
  if (err === "authorization_pending") return { status: "pending" };
  if (err === "slow_down") return { status: "pending" };
  if (err === "expired_token") return { status: "expired", error: err };
  if (err === "access_denied") return { status: "denied", error: err };
  throw new Error(String(j.error_description || err || "poll-failed"));
}

/** Authed GitHub API via the OAuth token (throws when unlinked). */
export async function ghApi(method: string, path: string, body?: unknown): Promise<unknown> {
  if (!token) throw new Error("not-linked");
  const r = await fetch("https://api.github.com" + path, {
    method,
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token },
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
