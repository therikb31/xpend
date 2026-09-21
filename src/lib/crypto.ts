// WebCrypto AES-256-GCM + PBKDF2 — verbatim port of legacy `C`.
// Requires a secure context (https / localhost); check sup() before use.

function b64(u: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000)
    s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

function unb(b: string): Uint8Array {
  const s = atob(b);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

function rand(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function der(pass: string, salt: string): Promise<CryptoKey> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pass),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: unb(salt), iterations: 210000, hash: "SHA-256" },
    k,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

async function enc(key: CryptoKey, str: string): Promise<{ iv: string; ct: string }> {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(str));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

async function dec(key: CryptoKey, iv: string, ct: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb(iv) }, key, unb(ct));
  return new TextDecoder().decode(pt);
}

export function sup(): boolean {
  return !!(window.crypto && window.crypto.subtle && crypto.getRandomValues);
}

export const C = { b64, unb, rand, der, enc, dec, sup };
