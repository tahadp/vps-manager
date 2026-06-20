package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go.uber.org/goleak"
)

// ipLookupURLs is defined in daemon.go and swapped here so tests
// redirect public-IP lookups at a local httptest server.

func Test_getOutboundIP_cancelsOnContextDone(t *testing.T) {
	defer goleak.VerifyNone(t)

	// Given: a slow HTTP server that blocks until its request context
	// is cancelled (simulates a public-IP service hanging in a
	// closed-network scenario).
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()

	originalURLs := ipLookupURLs
	ipLookupURLs = []string{srv.URL, srv.URL}
	defer func() { ipLookupURLs = originalURLs }()

	// And: a program whose context is already cancelled.
	p := newProgram()
	p.ctx, p.cancel = context.WithCancel(context.Background())
	p.cancel()

	// When: we ask for the outbound IP.
	done := make(chan string, 1)
	start := time.Now()
	go func() { done <- p.getOutboundIP() }()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatalf("getOutboundIP did not return within 3s after ctx cancel; likely blocking on HTTP")
	}

	// Then: return is well under the 2s per-request HTTP timeout
	// (because ctx cancel preempts the in-flight request).
	if elapsed := time.Since(start); elapsed > 2500*time.Millisecond {
		t.Fatalf("getOutboundIP took %v after ctx cancel; expected <2.5s", elapsed)
	}
}

func Test_getOutboundIP_respectsContextDeadline(t *testing.T) {
	defer goleak.VerifyNone(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()

	originalURLs := ipLookupURLs
	ipLookupURLs = []string{srv.URL, srv.URL}
	defer func() { ipLookupURLs = originalURLs }()

	p := newProgram()
	p.ctx, p.cancel = context.WithCancel(context.Background())
	defer p.cancel()

	// Cancel after 100ms to simulate fast shutdown.
	go func() {
		time.Sleep(100 * time.Millisecond)
		p.cancel()
	}()

	done := make(chan string, 1)
	start := time.Now()
	go func() { done <- p.getOutboundIP() }()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatalf("getOutboundIP did not return within 3s; ctx cancel did not preempt HTTP")
	}
	if elapsed := time.Since(start); elapsed > 2500*time.Millisecond {
		t.Fatalf("getOutboundIP took %v; expected <2.5s after ctx cancel", elapsed)
	}
}

// Test_pumpShellOutput_exitsOnDeadline verifies the inner Read pump
// returns within the SetReadDeadline budget. Guards against a goroutine
// leak where the inner loop blocks on Read forever after the agent
// is asked to shut down.
//
// Unix-only: the Windows pipe-backed reader does not implement
// SetReadDeadline, so the deadline path is exercised only on POSIX
// platforms where the PTY is a real deadline-aware *os.File.
// Windows equivalent: the ctx-cancel path below (Close unblocks
// the pipe).
func Test_pumpShellOutput_exitsOnDeadline(t *testing.T) {
	if !deadlineAware {
		t.Skip("SetReadDeadline is a no-op on this platform; covered by Test_pumpShellOutput_exitsOnContextCancel")
	}
	defer goleak.VerifyNone(t)

	sess := newDeadlineBoundSession(t)
	defer sess.Close()

	p := newProgram()
	p.ctx, p.cancel = context.WithCancel(context.Background())
	defer p.cancel()
	p.shells = make(map[string]*shellSession)
	const sessionID = "test-deadline"
	p.shells[sessionID] = sess

	done := make(chan struct{})
	go func() {
		p.pumpShellOutput(nil, sessionID, sess)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(7 * time.Second):
		t.Fatalf("pumpShellOutput did not return within 7s; deadline exit not working")
	}
}

func Test_pumpShellOutput_exitsOnContextCancel(t *testing.T) {
	defer goleak.VerifyNone(t)

	sess := newDeadlineBoundSession(t)
	defer sess.Close()

	p := newProgram()
	p.ctx, p.cancel = context.WithCancel(context.Background())
	p.shells = make(map[string]*shellSession)
	const sessionID = "test-cancel"
	p.shells[sessionID] = sess

	done := make(chan struct{})
	go func() {
		p.pumpShellOutput(nil, sessionID, sess)
		close(done)
	}()

	// Give the inner goroutine a moment to enter Read.
	time.Sleep(50 * time.Millisecond)
	p.cancel()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatalf("pumpShellOutput did not return within 3s of ctx cancel")
	}
}

// newDeadlineBoundSession returns a platform-specific shellSession
// whose Read blocks until SetReadDeadline fires (or the underlying
// handle is closed). Implementations live in
// daemon_ctx_helpers_unix_test.go and daemon_ctx_helpers_windows_test.go.
func newDeadlineBoundSession(t *testing.T) *shellSession {
	t.Helper()
	return newDeadlineBoundSessionPlatform(t)
}
