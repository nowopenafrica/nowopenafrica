// Encryption at rest for stored OAuth tokens.
//
// social_connections holds long-lived access and refresh tokens for people's
// real Instagram, Facebook, LinkedIn, X and TikTok accounts. RLS already keeps
// the table away from the browser entirely (it has no policies — service role
// only), which stops anyone reading it *through the API*. It does nothing for
// a leaked backup, a snapshot shared with a contractor, or anyone who gets a
// look at the database directly, and those tokens let the holder post as the
// business until they are revoked.
//
// That mattered less when publishing only happened while an owner watched.
// Now that a cron posts unattended, these are long-lived credentials sitting
// in a table, and they get an envelope.
//
// Format: "v1:<base64 iv>:<base64 ciphertext>", AES-256-GCM. Anything that
// does not start with "v1:" is treated as a legacy plaintext value and read
// as-is, so existing rows keep working and are re-wrapped the next time they
// are written.

const ENVELOPE = "v1";
const enc = new TextEncoder();
const dec = new TextDecoder();

let cachedKey: CryptoKey | null = null;
let cachedKeyMaterial = "";

/**
 * The key comes from SOCIAL_TOKEN_KEY. Any length is accepted and hashed to
 * 256 bits, so a project can use a passphrase without us silently truncating
 * it to the wrong number of bytes.
 */
async function getKey(): Promise<CryptoKey | null> {
  const material = Deno.env.get("SOCIAL_TOKEN_KEY") ?? "";
  if (!material) return null;
  if (cachedKey && cachedKeyMaterial === material) return cachedKey;

  const digest = await crypto.subtle.digest("SHA-256", enc.encode(material));
  cachedKey = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  cachedKeyMaterial = material;
  return cachedKey;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** True when this project is configured to encrypt tokens. */
export async function tokenEncryptionEnabled(): Promise<boolean> {
  return (await getKey()) !== null;
}

/**
 * Wrap a token for storage.
 *
 * With no key configured the value is returned unchanged: a project that has
 * not set SOCIAL_TOKEN_KEY keeps working exactly as before rather than writing
 * tokens it will not be able to read back.
 */
export async function encryptToken(plain: string | null | undefined): Promise<string | null> {
  if (!plain) return plain ?? null;
  const key = await getKey();
  if (!key) return plain;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return `${ENVELOPE}:${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
}

/**
 * Unwrap a stored token.
 *
 * Legacy plaintext passes through untouched. A wrapped value that cannot be
 * decrypted throws rather than being handed on as gibberish — a publish that
 * fails loudly is far better than one that posts nothing and reports success,
 * and it is the signal that SOCIAL_TOKEN_KEY has been changed or lost.
 */
export async function decryptToken(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return stored ?? null;
  if (!stored.startsWith(`${ENVELOPE}:`)) return stored; // written before encryption was on

  const key = await getKey();
  if (!key) {
    throw new Error("This connection's token is encrypted but SOCIAL_TOKEN_KEY is not set on this project.");
  }

  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Stored token is malformed.");

  try {
    const iv = fromBase64(parts[1]);
    const cipher = fromBase64(parts[2]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return dec.decode(plain);
  } catch {
    throw new Error("Could not decrypt this connection — SOCIAL_TOKEN_KEY may have changed. Reconnect the account.");
  }
}
