import { describe, it, expect } from 'vitest';
import { parseAgentIPs } from './grpcServer';

describe('parseAgentIPs', () => {
  it('returns null for empty input', () => {
    expect(parseAgentIPs('')).toBeNull();
    expect(parseAgentIPs(undefined)).toBeNull();
    expect(parseAgentIPs(null)).toBeNull();
  });
  it('returns null for single IP (no comma)', () => {
    expect(parseAgentIPs('192.168.1.10')).toBeNull();
  });
  it('parses comma-separated multi-IP', () => {
    expect(parseAgentIPs('192.168.1.10,10.0.0.5')).toBe('["192.168.1.10","10.0.0.5"]');
  });
  it('tolerates whitespace', () => {
    expect(parseAgentIPs('192.168.1.10, 10.0.0.5, 172.17.0.2')).toBe(
      '["192.168.1.10","10.0.0.5","172.17.0.2"]',
    );
  });
  it('filters empty segments', () => {
    expect(parseAgentIPs('192.168.1.10,,10.0.0.5,')).toBe('["192.168.1.10","10.0.0.5"]');
  });
});
