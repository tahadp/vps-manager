import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'crypto';
import nacl from 'tweetnacl';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

// Import after env set
import { encryptSecret, decryptSecret } from './crypto';

describe('crypto', () => {
  it('roundtrips', () => {
    const ct = encryptSecret('123456789:ABCDEFG_token');
    expect(ct).not.toBe('123456789:ABCDEFG_token');
    expect(decryptSecret(ct)).toBe('123456789:ABCDEFG_token');
  });
  it('empty input', () => {
    expect(encryptSecret('')).toBe('');
    expect(decryptSecret('')).toBe('');
  });
  it('plaintext passthrough', () => {
    expect(decryptSecret('123456789:ABC')).toBe('123456789:ABC');
  });
  it('rejects wrong key length', () => {
    const orig = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'short';
    expect(() => encryptSecret('x')).toThrow();
    process.env.ENCRYPTION_KEY = orig;
  });
});
