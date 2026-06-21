// Pure tests for the Terminal state machine. No React, no sockets —
// every transition is asserted as a given/when/then triple.

import { describe, it, expect } from 'vitest';
import { computeBackoff, initialState, reduce } from './state';
import {
  DEFAULT_BACKOFF,
  isConnected,
  isReconnecting,
  isTerminal,
  type ConnState,
} from './types';

// Deterministic clock: tests never call Date.now().
const T0 = 1_700_000_000_000;

// Constant RNG: every sample is exactly 0.5 → jitter swing = 0 → no jitter applied.
// Useful for asserting exact backoff values.
const NO_JITTER = () => 0.5;

/** Tiny helper to keep tests terse: reduce from a known state with T0. */
const tick = (state: ConnState, event: Parameters<typeof reduce>[1], now = T0) =>
  reduce(state, event, now, { rng: NO_JITTER });

describe('initial state', () => {
  it('starts in idle', () => {
    expect(initialState).toEqual({ kind: 'idle' });
  });
});

describe('idle transitions', () => {
  it('idle + connect → connecting (attempt=0)', () => {
    expect(tick(initialState, { type: 'connect' })).toEqual({
      kind: 'connecting',
      attempt: 0,
    });
  });

  it('idle + user-connect → connecting (attempt=0)', () => {
    expect(tick(initialState, { type: 'user-connect' })).toEqual({
      kind: 'connecting',
      attempt: 0,
    });
  });

  it('idle + activity is a no-op (stays idle)', () => {
    expect(tick(initialState, { type: 'activity' })).toEqual({ kind: 'idle' });
  });
});

describe('connecting transitions', () => {
  it('connecting + open-success → connected (with since + lastActivity)', () => {
    const next = tick(
      { kind: 'connecting', attempt: 0 },
      { type: 'open-success', sessionId: 'sess-1' },
      T0,
    );
    expect(next).toEqual({
      kind: 'connected',
      sessionId: 'sess-1',
      sinceMs: T0,
      lastActivityMs: T0,
    });
  });

  it('connecting + open-error → disconnected (reason=error, lastError set)', () => {
    const next = tick(
      { kind: 'connecting', attempt: 0 },
      { type: 'open-error', error: 'ECONNREFUSED' },
    );
    expect(next).toEqual({
      kind: 'disconnected',
      reason: 'error',
      lastError: 'ECONNREFUSED',
      lastSessionId: null,
    });
  });

  it('connecting + user-disconnect → closed', () => {
    expect(
      tick({ kind: 'connecting', attempt: 0 }, { type: 'user-disconnect' }),
    ).toEqual({ kind: 'closed' });
  });

  it('connecting + activity is a no-op (does not skip to connected)', () => {
    const s: ConnState = { kind: 'connecting', attempt: 0 };
    expect(tick(s, { type: 'activity' })).toEqual(s);
  });
});

describe('connected transitions', () => {
  const connected: ConnState = {
    kind: 'connected',
    sessionId: 'sess-A',
    sinceMs: T0 - 1000,
    lastActivityMs: T0 - 1000,
  };

  it('connected + disconnect(lost) → reconnecting (attempt=1, lastSessionId preserved)', () => {
    const next = tick(connected, { type: 'disconnect', reason: 'lost' });
    expect(next.kind).toBe('reconnecting');
    if (next.kind === 'reconnecting') {
      expect(next.attempt).toBe(1);
      expect(next.lastSessionId).toBe('sess-A');
      // attempt=1 + NO_JITTER (swing=0) + initial=1000 → T0 + 1000
      expect(next.nextRetryAtMs).toBe(T0 + 1000);
    }
  });

  it('connected + disconnect(error) → reconnecting with lastError carried', () => {
    const next = tick(connected, {
      type: 'disconnect',
      reason: 'error',
      error: 'socket hang up',
    });
    expect(next).toEqual({
      kind: 'reconnecting',
      attempt: 1,
      nextRetryAtMs: T0 + 1000,
      lastSessionId: 'sess-A',
      lastError: 'socket hang up',
    });
  });

  it('connected + user-disconnect → disconnected(reason=user, sessionId preserved)', () => {
    const next = tick(connected, { type: 'user-disconnect' });
    expect(next).toEqual({
      kind: 'disconnected',
      reason: 'user',
      lastSessionId: 'sess-A',
    });
  });

  it('connected + activity updates lastActivityMs but keeps kind and sessionId', () => {
    const later = T0 + 5000;
    const next = tick(connected, { type: 'activity' }, later);
    expect(next).toEqual({
      kind: 'connected',
      sessionId: 'sess-A',
      sinceMs: T0 - 1000,
      lastActivityMs: later,
    });
  });

  it('connected + reset → idle (universal escape hatch)', () => {
    expect(tick(connected, { type: 'reset' })).toEqual({ kind: 'idle' });
  });

  it('connected + unmatched event (user-connect) is a no-op', () => {
    expect(tick(connected, { type: 'user-connect' })).toEqual(connected);
  });
});

describe('reconnecting transitions', () => {
  const reconnecting: ConnState = {
    kind: 'reconnecting',
    attempt: 1,
    nextRetryAtMs: T0 + 1000,
    lastSessionId: 'sess-A',
  };

  it('reconnecting + open-success → connected (new sessionId, sinceMs=now)', () => {
    const later = T0 + 1234;
    const next = tick(
      reconnecting,
      { type: 'open-success', sessionId: 'sess-B' },
      later,
    );
    expect(next).toEqual({
      kind: 'connected',
      sessionId: 'sess-B',
      sinceMs: later,
      lastActivityMs: later,
    });
  });

  it('reconnecting + open-error → reconnecting (attempt bumped, new backoff)', () => {
    const next = tick(reconnecting, { type: 'open-error', error: 'again' });
    expect(next).toEqual({
      kind: 'reconnecting',
      attempt: 2,
      // attempt=2 + NO_JITTER + 1000*2^1 = T0 + 2000
      nextRetryAtMs: T0 + 2000,
      lastSessionId: 'sess-A',
    });
  });

  it('reconnecting + connect is idempotent (timer already firing)', () => {
    expect(tick(reconnecting, { type: 'connect' })).toEqual(reconnecting);
  });

  it('reconnecting + reconnect-scheduled updates attempt + nextRetryAtMs', () => {
    const next = tick(reconnecting, {
      type: 'reconnect-scheduled',
      attempt: 5,
      nextRetryAtMs: T0 + 9999,
    });
    expect(next).toEqual({
      kind: 'reconnecting',
      attempt: 5,
      nextRetryAtMs: T0 + 9999,
      lastSessionId: 'sess-A',
    });
  });

  it('reconnecting + user-disconnect → closed', () => {
    expect(tick(reconnecting, { type: 'user-disconnect' })).toEqual({
      kind: 'closed',
    });
  });

  it('reconnecting + unmatched event (user-connect) is a no-op', () => {
    expect(tick(reconnecting, { type: 'user-connect' })).toEqual(reconnecting);
  });
});

describe('disconnected transitions', () => {
  it('disconnected(reason=user) + user-connect → connecting', () => {
    const s: ConnState = {
      kind: 'disconnected',
      reason: 'user',
      lastSessionId: 'sess-A',
    };
    expect(tick(s, { type: 'user-connect' })).toEqual({
      kind: 'connecting',
      attempt: 0,
    });
  });

  it('disconnected(reason=user) + connect is a no-op (no auto-reconnect for user disconnect)', () => {
    const s: ConnState = {
      kind: 'disconnected',
      reason: 'user',
      lastSessionId: 'sess-A',
    };
    expect(tick(s, { type: 'connect' })).toEqual(s);
  });

  it('disconnected(reason=lost) + connect → reconnecting (attempt=1)', () => {
    const s: ConnState = {
      kind: 'disconnected',
      reason: 'lost',
      lastSessionId: 'sess-A',
    };
    const next = tick(s, { type: 'connect' });
    expect(next).toEqual({
      kind: 'reconnecting',
      attempt: 1,
      nextRetryAtMs: T0 + 1000,
      lastSessionId: 'sess-A',
    });
  });

  it('disconnected(reason=error) + connect → reconnecting (lastError preserved)', () => {
    const s: ConnState = {
      kind: 'disconnected',
      reason: 'error',
      lastError: 'boom',
      lastSessionId: 'sess-B',
    };
    expect(tick(s, { type: 'connect' })).toEqual({
      kind: 'reconnecting',
      attempt: 1,
      nextRetryAtMs: T0 + 1000,
      lastSessionId: 'sess-B',
      lastError: 'boom',
    });
  });

  it('disconnected + user-disconnect → closed', () => {
    const s: ConnState = {
      kind: 'disconnected',
      reason: 'lost',
      lastSessionId: null,
    };
    expect(tick(s, { type: 'user-disconnect' })).toEqual({ kind: 'closed' });
  });
});

describe('closed transitions', () => {
  it('closed + user-connect → connecting', () => {
    expect(tick({ kind: 'closed' }, { type: 'user-connect' })).toEqual({
      kind: 'connecting',
      attempt: 0,
    });
  });

  it('closed + connect is a no-op (only user-connect revives closed)', () => {
    expect(tick({ kind: 'closed' }, { type: 'connect' })).toEqual({
      kind: 'closed',
    });
  });
});

describe('authenticating transitions', () => {
  it('authenticating + open-success → connected', () => {
    const next = tick(
      { kind: 'authenticating', attempt: 0 },
      { type: 'open-success', sessionId: 'sess-X' },
    );
    expect(next).toEqual({
      kind: 'connected',
      sessionId: 'sess-X',
      sinceMs: T0,
      lastActivityMs: T0,
    });
  });

  it('authenticating + open-error → disconnected(reason=error)', () => {
    const next = tick(
      { kind: 'authenticating', attempt: 0 },
      { type: 'open-error', error: 'auth failed' },
    );
    expect(next).toEqual({
      kind: 'disconnected',
      reason: 'error',
      lastError: 'auth failed',
      lastSessionId: null,
    });
  });

  it('authenticating + user-disconnect → closed', () => {
    expect(
      tick({ kind: 'authenticating', attempt: 0 }, { type: 'user-disconnect' }),
    ).toEqual({ kind: 'closed' });
  });

  it('authenticating + unmatched event (activity) is a no-op', () => {
    const s: ConnState = { kind: 'authenticating', attempt: 0 };
    expect(tick(s, { type: 'activity' })).toEqual(s);
  });
});

describe('reset is universal', () => {
  it('reset works from closed', () => {
    expect(tick({ kind: 'closed' }, { type: 'reset' })).toEqual({ kind: 'idle' });
  });

  it('reset works from disconnected', () => {
    const s: ConnState = {
      kind: 'disconnected',
      reason: 'error',
      lastError: 'x',
      lastSessionId: 'sess',
    };
    expect(tick(s, { type: 'reset' })).toEqual({ kind: 'idle' });
  });
});

describe('computeBackoff', () => {
  it('attempt 1 returns initialMs (no jitter, no growth)', () => {
    const at = computeBackoff(1, DEFAULT_BACKOFF, T0, NO_JITTER);
    expect(at - T0).toBe(1000);
  });

  it('attempt 2 doubles: initialMs * multiplier', () => {
    const at = computeBackoff(2, DEFAULT_BACKOFF, T0, NO_JITTER);
    expect(at - T0).toBe(2000);
  });

  it('attempt 5 is capped at maxMs (30000) even though 1000 * 2^4 = 16000', () => {
    // attempt 5 → 1000 * 2^4 = 16000 (still under cap, but attempt 6 = 32000 → cap)
    const at5 = computeBackoff(5, DEFAULT_BACKOFF, T0, NO_JITTER);
    expect(at5 - T0).toBe(16000);
    // attempt 6 → 1000 * 2^5 = 32000 → capped at 30000
    const at6 = computeBackoff(6, DEFAULT_BACKOFF, T0, NO_JITTER);
    expect(at6 - T0).toBe(30000);
    // attempt 100 must also be capped
    const at100 = computeBackoff(100, DEFAULT_BACKOFF, T0, NO_JITTER);
    expect(at100 - T0).toBe(30000);
  });

  it('jitter stays within ±jitter fraction of the base delay', () => {
    const cfg = DEFAULT_BACKOFF; // jitter = 0.2 → ±20%
    // Sample a few RNG extremes deterministically
    const samples = [0, 0.25, 0.5, 0.75, 1 - Number.EPSILON];
    for (const r of samples) {
      const at = computeBackoff(3, cfg, T0, () => r);
      // base for attempt 3 = 1000 * 2^2 = 4000
      const base = 4000;
      const low = base * (1 - cfg.jitter);
      const high = base * (1 + cfg.jitter);
      const delay = at - T0;
      expect(delay).toBeGreaterThanOrEqual(Math.floor(low));
      expect(delay).toBeLessThanOrEqual(Math.floor(high));
    }
  });

  it('uses Math.random by default (smoke test — just does not throw)', () => {
    // We don't assert on a value because Math.random is non-deterministic,
    // only that the function runs and returns a future timestamp.
    const at = computeBackoff(2, DEFAULT_BACKOFF, T0);
    expect(at).toBeGreaterThanOrEqual(T0);
    expect(at).toBeLessThanOrEqual(T0 + 30_000);
  });

  it('clamps attempt < 1 to attempt=1', () => {
    const at0 = computeBackoff(0, DEFAULT_BACKOFF, T0, NO_JITTER);
    const atNeg = computeBackoff(-5, DEFAULT_BACKOFF, T0, NO_JITTER);
    expect(at0 - T0).toBe(1000);
    expect(atNeg - T0).toBe(1000);
  });
});

describe('integration: full lifecycle', () => {
  it('idle → connect → connecting → open-success → connected → disconnect(lost) → reconnecting → open-success → connected (new session)', () => {
    let s: ConnState = initialState;
    s = tick(s, { type: 'connect' });
    expect(s).toEqual({ kind: 'connecting', attempt: 0 });
    s = tick(s, { type: 'open-success', sessionId: 'first' }, T0);
    expect(s.kind).toBe('connected');
    s = tick(s, { type: 'disconnect', reason: 'lost' }, T0 + 100);
    expect(s.kind).toBe('reconnecting');
    s = tick(s, { type: 'open-success', sessionId: 'second' }, T0 + 200);
    if (s.kind === 'connected') {
      expect(s.sessionId).toBe('second');
      expect(s.sinceMs).toBe(T0 + 200);
    } else {
      throw new Error('expected connected');
    }
  });

  it('reduce() uses Math.random as the default rng when none is supplied', () => {
    // Smoke test: omitting the options arg should not throw and should still
    // produce a valid `reconnecting` state on disconnect.
    const connected: ConnState = {
      kind: 'connected',
      sessionId: 'sess',
      sinceMs: T0,
      lastActivityMs: T0,
    };
    const next = reduce(connected, { type: 'disconnect', reason: 'lost' }, T0);
    expect(next.kind).toBe('reconnecting');
    if (next.kind === 'reconnecting') {
      expect(next.attempt).toBe(1);
      expect(next.nextRetryAtMs).toBeGreaterThanOrEqual(T0);
      // Capped at 30s even with jitter
      expect(next.nextRetryAtMs).toBeLessThanOrEqual(T0 + 30_000);
    }
  });
});

describe('type guards', () => {
  it('isConnected narrows to connected kind', () => {
    const c: ConnState = {
      kind: 'connected',
      sessionId: 'x',
      sinceMs: 0,
      lastActivityMs: 0,
    };
    expect(isConnected(c)).toBe(true);
    expect(isConnected({ kind: 'idle' })).toBe(false);
  });

  it('isReconnecting narrows to reconnecting kind', () => {
    const r: ConnState = {
      kind: 'reconnecting',
      attempt: 1,
      nextRetryAtMs: 0,
      lastSessionId: null,
    };
    expect(isReconnecting(r)).toBe(true);
    expect(isReconnecting({ kind: 'idle' })).toBe(false);
  });

  it('isTerminal is true for disconnected and closed, false otherwise', () => {
    expect(isTerminal({ kind: 'disconnected', reason: 'user', lastSessionId: null })).toBe(true);
    expect(isTerminal({ kind: 'disconnected', reason: 'lost', lastSessionId: null })).toBe(true);
    expect(isTerminal({ kind: 'closed' })).toBe(true);
    expect(isTerminal({ kind: 'idle' })).toBe(false);
    expect(
      isTerminal({ kind: 'connecting', attempt: 0 }),
    ).toBe(false);
  });
});
