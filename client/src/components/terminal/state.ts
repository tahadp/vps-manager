// Pure reducer for the Terminal connection state machine.
// All time-dependent values come in via the `now` parameter; all randomness
// comes in via the optional `rng` (defaults to `Math.random`). No side effects,
// no React, no socket.io, no xterm — call this from a hook, a worker, a test.

import type {
  BackoffConfig,
  ConnEvent,
  ConnState,
} from './types';
import { DEFAULT_BACKOFF } from './types';

export const initialState: ConnState = { kind: 'idle' };

/**
 * Compute the next retry timestamp (ms) using capped exponential backoff
 * with symmetric jitter.
 *
 * `attempt` is 1-indexed: attempt=1 → initialMs, attempt=2 → initialMs*multiplier, etc.
 * Result is `floor(base * (1 ± jitter * (rng()*2 - 1)))` then added to `now`.
 *
 * The jitter is intentionally symmetric around `base` (not just additive) so that
 * the average delay matches the base schedule. Using a custom `rng` makes the
 * function fully deterministic for tests.
 */
export function computeBackoff(
  attempt: number,
  cfg: BackoffConfig,
  now: number,
  rng: () => number = Math.random,
): number {
  // Guard: attempt < 1 collapses to attempt 1 so a buggy caller cannot get a
  // sub-millisecond retry.
  const safeAttempt = Math.max(1, attempt);
  const base = Math.min(
    cfg.initialMs * Math.pow(cfg.multiplier, safeAttempt - 1),
    cfg.maxMs,
  );
  // rng() in [0, 1) → uniform in (-1, +1) → multiplier in (1 - jitter, 1 + jitter)
  const swing = rng() * 2 - 1;
  const jittered = base * (1 + cfg.jitter * swing);
  return now + Math.max(0, Math.floor(jittered));
}

interface ReduceOptions {
  /** Backoff schedule used for reconnect timers. */
  backoff?: BackoffConfig;
  /** Custom RNG for deterministic tests. Defaults to `Math.random`. */
  rng?: () => number;
}

/**
 * Reduce a `ConnState` given a `ConnEvent` and a wall-clock `now` (ms).
 * Returns the next state. Unknown event/state combinations return the input
 * state unchanged — the reducer never throws on no-op transitions.
 */
export function reduce(
  state: ConnState,
  event: ConnEvent,
  now: number,
  options: ReduceOptions = {},
): ConnState {
  const cfg = options.backoff ?? DEFAULT_BACKOFF;
  const rng = options.rng ?? Math.random;

  // `reset` is the universal escape hatch — always works, no matter where we are.
  if (event.type === 'reset') {
    return initialState;
  }

  switch (state.kind) {
    case 'idle': {
      if (event.type === 'connect' || event.type === 'user-connect') {
        return { kind: 'connecting', attempt: 0 };
      }
      return state;
    }

    case 'connecting': {
      if (event.type === 'open-success') {
        return {
          kind: 'connected',
          sessionId: event.sessionId,
          sinceMs: now,
          lastActivityMs: now,
        };
      }
      if (event.type === 'open-error') {
        return {
          kind: 'disconnected',
          reason: 'error',
          lastError: event.error,
          lastSessionId: null,
        };
      }
      if (event.type === 'user-disconnect') {
        return { kind: 'closed' };
      }
      return state;
    }

    case 'authenticating': {
      if (event.type === 'open-success') {
        return {
          kind: 'connected',
          sessionId: event.sessionId,
          sinceMs: now,
          lastActivityMs: now,
        };
      }
      if (event.type === 'open-error') {
        return {
          kind: 'disconnected',
          reason: 'error',
          lastError: event.error,
          lastSessionId: null,
        };
      }
      if (event.type === 'user-disconnect') {
        return { kind: 'closed' };
      }
      return state;
    }

    case 'connected': {
      if (event.type === 'disconnect') {
        // Both 'lost' and 'error' trigger an automatic reconnect.
        // lastError only carried when the reason was 'error' (caller supplied it).
        return {
          kind: 'reconnecting',
          attempt: 1,
          nextRetryAtMs: computeBackoff(1, cfg, now, rng),
          lastSessionId: state.sessionId,
          ...(event.error ? { lastError: event.error } : {}),
        };
      }
      if (event.type === 'user-disconnect') {
        return {
          kind: 'disconnected',
          reason: 'user',
          lastSessionId: state.sessionId,
        };
      }
      if (event.type === 'activity') {
        return { ...state, lastActivityMs: now };
      }
      return state;
    }

    case 'reconnecting': {
      if (event.type === 'reconnect-scheduled') {
        return {
          ...state,
          attempt: event.attempt,
          nextRetryAtMs: event.nextRetryAtMs,
        };
      }
      if (event.type === 'connect') {
        // Idempotent — the backoff timer is already in flight, no-op.
        return state;
      }
      if (event.type === 'open-success') {
        return {
          kind: 'connected',
          sessionId: event.sessionId,
          sinceMs: now,
          lastActivityMs: now,
        };
      }
      if (event.type === 'user-disconnect') {
        return { kind: 'closed' };
      }
      if (event.type === 'open-error') {
        const nextAttempt = state.attempt + 1;
        return {
          kind: 'reconnecting',
          attempt: nextAttempt,
          nextRetryAtMs: computeBackoff(nextAttempt, cfg, now, rng),
          lastSessionId: state.lastSessionId,
        };
      }
      return state;
    }

    case 'disconnected': {
      if (event.type === 'user-connect') {
        return { kind: 'connecting', attempt: 0 };
      }
      if (event.type === 'connect' && state.reason !== 'user') {
        // Auto-reconnect path: lost | error
        return {
          kind: 'reconnecting',
          attempt: 1,
          nextRetryAtMs: computeBackoff(1, cfg, now, rng),
          lastSessionId: state.lastSessionId,
          ...(state.lastError ? { lastError: state.lastError } : {}),
        };
      }
      if (event.type === 'user-disconnect') {
        return { kind: 'closed' };
      }
      return state;
    }

    case 'closed': {
      if (event.type === 'user-connect') {
        return { kind: 'connecting', attempt: 0 };
      }
      return state;
    }
  }
}
