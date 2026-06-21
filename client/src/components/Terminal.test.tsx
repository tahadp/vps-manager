import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — declared before the component import so vi.mock hoists them.
// ---------------------------------------------------------------------------

const socketMock = {
  connected: false,
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  io: { on: vi.fn(), off: vi.fn() },
  disconnect: vi.fn(),
  connect: vi.fn(),
};

vi.mock('@/lib/socket', () => ({
  useSocket: () => ({
    socket: socketMock,
    connectionStatus: 'connected' as const,
    connectError: null,
  }),
}));

class TerminalMock {
  static last: TerminalMock | null = null;
  writes: (string | Uint8Array)[] = [];
  dataCallbacks: Array<(data: string) => void> = [];
  customKeyHandler: ((e: KeyboardEvent) => boolean) | null = null;
  open() { return this; }
  write(data: string | Uint8Array) { this.writes.push(data); return this; }
  writeln(data: string) { this.writes.push(data + '\r\n'); return this; }
  clear() { this.writes.push('\x1b[2J\x1b[H'); return this; }
  reset() { this.writes.push('\x1bc'); return this; }
  focus() { return this; }
  blur() { return this; }
  hasSelection() { return false; }
  getSelection() { return ''; }
  selectAll() {}
  onData(cb: (data: string) => void) { this.dataCallbacks.push(cb); return this; }
  onTitleChange() { return this; }
  attachCustomKeyEventHandler(h: (e: KeyboardEvent) => boolean) { this.customKeyHandler = h; return this; }
  loadAddon() { return this; }
  dispose() {}
  resize() { return this; }
}

const terminalCtor = vi.fn(function (this: any) {
  const t = new TerminalMock();
  TerminalMock.last = t;
  return t as any;
});
const fitCtor = vi.fn(function (this: any) {
  return Object.assign(this, { fit: vi.fn() });
});
const webglCtor = vi.fn(function (this: any) {
  return Object.assign(this, { dispose: vi.fn() });
});
const webLinksCtor = vi.fn(function (this: any) {
  return Object.assign(this, { dispose: vi.fn() });
});
const searchCtor = vi.fn(function (this: any) {
  return Object.assign(this, {
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clearDecorations: vi.fn(),
    activate: vi.fn(),
    dispose: vi.fn(),
  });
});

vi.mock('xterm', () => ({ Terminal: terminalCtor }));
vi.mock('xterm-addon-fit', () => ({ FitAddon: fitCtor }));
vi.mock('xterm-addon-webgl', () => ({ WebglAddon: webglCtor }));
vi.mock('xterm-addon-web-links', () => ({ WebLinksAddon: webLinksCtor }));
vi.mock('xterm-addon-search', () => ({ SearchAddon: searchCtor }));
vi.mock('xterm/css/xterm.css', () => ({}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn() }),
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = ResizeObserverMock;

if (typeof (globalThis as any).matchMedia !== 'function') {
  (globalThis as any).matchMedia = (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

import WebPTY from '@/components/Terminal';

const waitMicro = (ms = 50) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait until the component's async useEffect has finished wiring the
 * socket event listeners AND the xterm Terminal constructor has been
 * invoked. This is the readiness signal for the rest of the assertions.
 */
async function waitForBoot() {
  for (let i = 0; i < 50; i++) {
    await act(async () => { await waitMicro(50); });
    if (
      socketMock.on.mock.calls.some((c) => c[0] === 'shell:opened') &&
      terminalCtor.mock.calls.length > 0
    ) {
      return;
    }
  }
}

function fireShellOpened(sessionId: string) {
  const h = socketMock.on.mock.calls.find((c) => c[0] === 'shell:opened')?.[1];
  if (!h) throw new Error('shell:opened handler not registered yet');
  h({ sessionId });
}
function fireDisconnect(reason: string) {
  const h = socketMock.on.mock.calls.find((c) => c[0] === 'disconnect')?.[1];
  if (!h) throw new Error('disconnect handler not registered yet');
  h(reason);
}
function fireShellOutput(text: string) {
  const h = socketMock.on.mock.calls.find((c) => c[0] === 'shell:output')?.[1];
  if (!h) throw new Error('shell:output handler not registered yet');
  h({ sessionId: 'sess', data: btoa(text) });
}

beforeEach(() => {
  // Defensive: drop any leftover fake-timer state.
  vi.useRealTimers();
  socketMock.connected = false;
  // Use mockClear (NOT mockReset) so the mock implementations survive.
  socketMock.emit.mockClear();
  socketMock.on.mockClear();
  socketMock.off.mockClear();
  socketMock.io.on.mockClear();
  socketMock.io.off.mockClear();
  TerminalMock.last = null;
  terminalCtor.mockClear();
  fitCtor.mockClear();
  webglCtor.mockClear();
  webLinksCtor.mockClear();
  searchCtor.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests — ORDER MATTERS.
// Real-timer tests run FIRST; fake-timer tests run LAST. Mixing them in a
// single suite without ordering causes the next real-timer test to inherit
// pending microtasks from the previous fake-timer test, which prevents the
// async useEffect from ever reaching the `socket.on('shell:opened', ...)`
// registration and looks like a flaky timeout.
// ---------------------------------------------------------------------------

describe('WebPTY', () => {
  it('renders the initial disconnected state with a Connect button', async () => {
    socketMock.connected = false;
    render(<WebPTY vpsId="vps-123" active />);
    await waitForBoot();
    const btn = screen.getByRole('button', { name: /connect/i });
    expect(btn).toBeInTheDocument();
  });

  it('Clicking Connect (or auto-connect on mount) emits shell:open with the vpsId', async () => {
    socketMock.connected = true;
    render(<WebPTY vpsId="vps-xyz" active />);
    await waitForBoot();
    expect(socketMock.emit).toHaveBeenCalledWith('shell:open', { vpsId: 'vps-xyz' });
    const btn = screen.getByRole('button', { name: /connect|disconnect/i });
    expect(btn).toBeInTheDocument();
  });

  it('User keystrokes typed into xterm are forwarded to shell:input with the active sessionId', async () => {
    socketMock.connected = true;
    render(<WebPTY vpsId="vps-abc" active />);
    await waitForBoot();
    const term = TerminalMock.last!;
    expect(term).toBeTruthy();
    act(() => { fireShellOpened('sess-001'); });
    act(() => {
      for (const cb of term.dataCallbacks) cb('ls\n');
    });
    const inputCall = socketMock.emit.mock.calls.find(
      (c) => c[0] === 'shell:input' && c[1]?.sessionId === 'sess-001',
    );
    expect(inputCall).toBeDefined();
    expect((inputCall as any)[1].data).toBe('ls\n');
  });

  it('Backspace keypress emits a 0x7F byte (terminal-native, not the browser default)', async () => {
    socketMock.connected = true;
    render(<WebPTY vpsId="vps-abc" active />);
    await waitForBoot();
    const term = TerminalMock.last!;
    act(() => { fireShellOpened('sess-bs'); });
    act(() => {
      for (const cb of term.dataCallbacks) cb('\x7f');
    });
    const inputCall = socketMock.emit.mock.calls.find(
      (c) => c[0] === 'shell:input' && c[1]?.sessionId === 'sess-bs',
    );
    expect(inputCall).toBeDefined();
    expect((inputCall as any)[1].data).toBe('\x7f');
  });

  it('shell:output from the server is base64-decoded and written to xterm', async () => {
    socketMock.connected = true;
    render(<WebPTY vpsId="vps-abc" active />);
    await waitForBoot();
    const term = TerminalMock.last!;
    act(() => { fireShellOpened('sess-out'); });
    term.writes.length = 0;
    act(() => { fireShellOutput('hello world'); });
    const last = term.writes[term.writes.length - 1];
    expect(last).toBeDefined();
    const decoded = new TextDecoder().decode(last as Uint8Array);
    expect(decoded).toBe('hello world');
  });

  it('Search shortcut opens the search bar (Ctrl+Shift+F)', async () => {
    socketMock.connected = true;
    render(<WebPTY vpsId="vps-search" active />);
    await waitForBoot();
    act(() => { fireShellOpened('sess-s'); });
    fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true });
    const searchInput = screen.getByPlaceholderText(/search/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('Clears the terminal buffer when the Clear button is clicked', async () => {
    socketMock.connected = true;
    render(<WebPTY vpsId="vps-clr" active />);
    await waitForBoot();
    act(() => { fireShellOpened('sess-c'); });
    const term = TerminalMock.last!;
    term.writes.length = 0;
    const clearBtn = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearBtn);
    expect(term.writes.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Fake-timer tests — must run LAST. See suite-level comment above.
  // -----------------------------------------------------------------------

  it('[fake timers] Socket disconnect triggers an automatic reconnect attempt after the backoff window', async () => {
    vi.useFakeTimers();
    socketMock.connected = true;
    render(<WebPTY vpsId="vps-recon" active />);
    // waitForBoot uses real setTimeout; under fake timers we must manually
    // advance time. 200ms is comfortably enough for the async useEffect
    // (dynamic imports + a 50ms inner setTimeout) to complete.
    for (let i = 0; i < 30; i++) {
      await act(async () => { vi.advanceTimersByTime(50); });
      if (
        socketMock.on.mock.calls.some((c) => c[0] === 'shell:opened') &&
        terminalCtor.mock.calls.length > 0
      ) {
        break;
      }
    }
    act(() => { fireShellOpened('sess-r'); });
    socketMock.emit.mockClear();
    act(() => { fireDisconnect('transport close'); });
    expect(socketMock.emit).not.toHaveBeenCalledWith('shell:open', expect.anything());
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(
      socketMock.emit.mock.calls.some(
        (c) => c[0] === 'shell:open' && (c[1] as any)?.vpsId === 'vps-recon',
      ),
    ).toBe(true);
  });

  it('[fake timers] Manual disconnect stops the auto-reconnect loop', async () => {
    vi.useFakeTimers();
    socketMock.connected = true;
    render(<WebPTY vpsId="vps-manual" active />);
    for (let i = 0; i < 30; i++) {
      await act(async () => { vi.advanceTimersByTime(50); });
      if (
        socketMock.on.mock.calls.some((c) => c[0] === 'shell:opened') &&
        terminalCtor.mock.calls.length > 0
      ) {
        break;
      }
    }
    act(() => { fireShellOpened('sess-m'); });
    const btn = screen.getByRole('button', { name: /disconnect|connect/i });
    fireEvent.click(btn);
    socketMock.emit.mockClear();
    act(() => { fireDisconnect('transport close'); });
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(socketMock.emit).not.toHaveBeenCalledWith('shell:open', expect.anything());
  });
});
