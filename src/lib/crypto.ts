import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for `portfolio_connections.oauth_token_enc` — the column was
 * always named `_enc`, so this is what actually honors that rather than
 * storing Dribbble's bearer token in plaintext.
 *
 * `PORTFOLIO_TOKEN_KEY` is a base64-encoded 32-byte key (`openssl rand -base64 32`).
 * Missing/malformed key throws rather than silently storing plaintext or a
 * weak fallback — a portfolio token is a real credential to a third-party
 * account, not something worth a dev-only insecure default the way
 * SESSION_SECRET has one.
 */

const IV_BYTES = 12; // GCM standard nonce size
const AUTH_TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.PORTFOLIO_TOKEN_KEY;
  if (!raw) {
    throw new Error("PORTFOLIO_TOKEN_KEY is not set — required to store a portfolio connection's token.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("PORTFOLIO_TOKEN_KEY must decode to 32 bytes — generate with `openssl rand -base64 32`.");
  }
  return key;
}

/** iv + authTag + ciphertext, base64-joined with "." so it's one text column value. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((b) => b.toString("base64")).join(".");
}

export function decryptToken(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted token.");

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  if (authTag.length !== AUTH_TAG_BYTES) throw new Error("Malformed encrypted token.");

  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Whether PORTFOLIO_TOKEN_KEY is present and well-formed, without throwing. */
export function hasPortfolioTokenKey(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}
