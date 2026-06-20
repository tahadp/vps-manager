import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies that touch DB or Redis BEFORE importing the module under test.
// Each job imports its backing function; mocking them keeps the test hermetic.
vi.mock('../metrics', () => ({
  pruneOldMetrics: vi.fn().mockResolvedValue(0),
}));
vi.mock('../middlewares/audit', () => ({
  startAuditPruneInterval: vi.fn().mockReturnValue({ unref: vi.fn() } as unknown as NodeJS.Timeout),
}));
vi.mock('../agentDispatcher', () => ({
  pruneStaleHeartbeats: vi.fn(),
}));
vi.mock('../alerting', () => ({
  refreshRules: vi.fn().mockResolvedValue(undefined),
}));

import { startAllJobs, stopAllJobs } from './index';

describe('jobs lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    stopAllJobs();
    vi.useRealTimers();
  });

  it('startAllJobs registers without throwing', () => {
    expect(() => startAllJobs()).not.toThrow();
  });

  it('stopAllJobs is idempotent', () => {
    startAllJobs();
    expect(() => stopAllJobs()).not.toThrow();
    expect(() => stopAllJobs()).not.toThrow();
  });
});
