// Pure types for the Terminal connection state machine.
// No React, no socket.io, no xterm — keeps the reducer trivially testable.

export type ConnState =
  | { kind: 'idle' }
  | { kind: 'connecting'; attempt: number }
  | { kind: 'authenticating'; attempt: number }
  | {
      kind: 'connected';
      sessionId: string;
      sinceMs: number;
      lastActivityMs: number;
    }
  | {
      kind: 'reconnecting';
      attempt: number;
      nextRetryAtMs: number;
      lastSessionId: string | null;
    }
  | {
      kind: 'disconnected';
      reason: 'user' | 'lost' | 'error';
      lastError?: string;
      lastSessionId: string | null;
    }
  | { kind: 'closed' };

export type ConnEvent =
  | { type: 'connect' }
  | { type: 'open-success'; sessionId: string }
  | { type: 'open-error'; error: string }
  | { type: 'disconnect'; reason: 'lost' | 'error'; error?: string }
  | {
      type: 'reconnect-scheduled';
      attempt: number;
      nextRetryAtMs: number;
    }
  | { type: 'user-disconnect' }
  | { type: 'user-connect' }
  | { type: 'activity' }
  | { type: 'reset' };

export interface BackoffConfig {
  /** Initial delay for the first retry, in ms. */
  initialMs: number;
  /** Cap on the delay between retries, in ms. */
  maxMs: number;
  /** Exponential growth factor. */
  multiplier: number;
  /** Symmetric jitter fraction, e.g. 0.2 = ±20%. */
  jitter: number;
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  initialMs: 1000,
  maxMs: 30000,
  multiplier: 2,
  jitter: 0.2,
};

/**
 * Type guard helpers — useful for consumers and exhaustive `switch` checks.
 * Kept here (not in `state.ts`) so the reducer can stay focused on transitions.
 */
export const isConnected = (s: ConnState): s is Extract<ConnState, { kind: 'connected' }> =>
  s.kind === 'connected';

export const isReconnecting = (
  s: ConnState,
): s is Extract<ConnState, { kind: 'reconnecting' }> => s.kind === 'reconnecting';

export const isTerminal = (s: ConnState): boolean =>
  s.kind === 'disconnected' || s.kind === 'closed';
