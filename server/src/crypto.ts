import nacl from 'tweetnacl';
import { randomBytes } from 'crypto';

let cachedKey: Uint8Array | null = null;
let cachedKeySource: string | null = null;

function getKey(): Uint8Array {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw && raw === cachedKeySource && cachedKey) return cachedKey;
  if (!raw) throw new Error('ENCRYPTION_KEY env var is required (32-byte base64)');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error(`ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`);
  cachedKey = new Uint8Array(key);
  cachedKeySource = raw;
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  const nonce = randomBytes(24);
  const ct = nacl.secretbox(new TextEncoder().encode(plaintext), nonce, getKey());
  // Layout: 24-byte nonce || ciphertext
  return Buffer.concat([nonce, Buffer.from(ct)]).toString('base64');
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  try {
    const buf = Buffer.from(payload, 'base64');
    if (buf.length < 24) return payload; // plain text fallback (legacy tokens)
    const nonce = buf.subarray(0, 24);
    const ct = buf.subarray(24);
    const pt = nacl.secretbox.open(ct, nonce, getKey());
    if (pt === null) return payload; // not a NaCl box → plain text
    return new TextDecoder().decode(pt);
  } catch {
    return payload; // not base64 or other decode error → plain text
  }
}
