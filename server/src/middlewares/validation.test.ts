import { describe, it, expect } from 'vitest';
import { schemas } from './validation';

describe('passwordComplexity', () => {
  const validPassword = 'Abcdef123456';

  it('accepts password with all complexity rules (min 12, lower, upper, digit)', () => {
    const result = schemas.register.safeParse({
      email: 'user@example.com',
      password: validPassword,
    });
    expect(result.success).toBe(true);
  });

  it('rejects password shorter than 12 characters', () => {
    const result = schemas.register.safeParse({
      email: 'user@example.com',
      password: 'Abcdefg1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('Password must be at least 12 characters');
    }
  });

  it('rejects password missing a lowercase letter', () => {
    const result = schemas.register.safeParse({
      email: 'user@example.com',
      password: 'ABCDEF123456',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('Password must contain a lowercase letter');
    }
  });

  it('rejects password missing an uppercase letter', () => {
    const result = schemas.register.safeParse({
      email: 'user@example.com',
      password: 'abcdef123456',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('Password must contain an uppercase letter');
    }
  });

  it('rejects password missing a digit', () => {
    const result = schemas.register.safeParse({
      email: 'user@example.com',
      password: 'Abcdefghijkl',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('Password must contain a digit');
    }
  });
});

describe('createVps schema', () => {
  it('accepts a valid vps with required name', () => {
    const result = schemas.createVps.safeParse({ name: 'web-server' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('web-server');
    }
  });

  it('accepts a valid vps with all optional fields', () => {
    const result = schemas.createVps.safeParse({
      name: 'db',
      id: 'vps-1',
      ipAddress: '10.0.0.5',
      os: 'LINUX',
      customOsName: 'Ubuntu 24',
      userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = schemas.createVps.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 100 characters', () => {
    const result = schemas.createVps.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid userId', () => {
    const result = schemas.createVps.safeParse({ name: 'srv', userId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
