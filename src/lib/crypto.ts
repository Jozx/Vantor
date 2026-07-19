/**
 * Lightweight AES-GCM encryption/decryption for API keys stored in SQLite.
 *
 * Uses Web Crypto API (SubtleCrypto) available in all modern browsers
 * and Capacitor WebViews.  The passphrase is derived via PBKDF2 from
 * app-specific constants – not a security panacea, but a massive
 * improvement over plaintext, especially on platforms where the DB
 * file is not encrypted at rest (e.g. web/IndexedDB).
 *
 * Encrypted values are stored as "v1:<base64(iv):base64(ciphertext)>".
 * The prefix makes it trivially easy to distinguish encrypted from
 * legacy plaintext and to rotate the scheme later.
 */

const PASSPHRASE = 'vantor-apikeys-2024-salt';
const SALT = 'vantor-kdf-salt-v1';
const ITERATIONS = 100_000;

const ENC_PREFIX = 'v1:';

let cachedKey: CryptoKey | null = null;

async function deriveKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(PASSPHRASE),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  cachedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(SALT),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return cachedKey;
}

/** Encrypt a plaintext string. Returns a prefixed ciphertext token. */
export async function encryptValue(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;
  try {
    const key = await deriveKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plaintext),
    );
    return ENC_PREFIX + btoa(String.fromCharCode(...iv)) + ':' + btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  } catch {
    // Encryption failed – store plaintext rather than losing data.
    return plaintext;
  }
}

/** Decrypt a ciphertext token. Returns the original plaintext. */
export async function decryptValue(token: string): Promise<string> {
  if (!token || !token.startsWith(ENC_PREFIX)) return token;

  try {
    const raw = token.slice(ENC_PREFIX.length);
    const [ivB64, ctB64] = raw.split(':');
    if (!ivB64 || !ctB64) return token;

    const key = await deriveKey();
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));

    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );

    return new TextDecoder().decode(plainBuf);
  } catch {
    // Decryption failed – return raw token so callers don't crash.
    // This handles environments where SubtleCrypto is unavailable
    // (non-secure contexts) or data is corrupt.
    return token;
  }
}

/** Check if a value is already encrypted (has our prefix). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}
