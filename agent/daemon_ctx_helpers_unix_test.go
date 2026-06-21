//go:build !windows

package main

import (
	"testing"

	gopty "github.com/aymanbagabas/go-pty"
)

// deadlineAware is true on POSIX because the PTY reader respects
// SetReadDeadline; the deadline-exit test is meaningful here.
const deadlineAware = true

// newDeadlineBoundSessionPlatform returns a real shellSession backed
// by a PTY whose Read will block until SetReadDeadline fires (or the
// PTY is closed). We launch `sleep 60` via the production Start
// factory so no output is produced and Read blocks indefinitely
// until deadline.
func newDeadlineBoundSessionPlatform(t *testing.T) *shellSession {
	t.Helper()

	pt, err := Start(Options{Command: "sleep", Args: []string{"60"}})
	if err != nil {
		t.Skipf("Start unavailable in this environment: %v", err)
	}
	var cmd *gopty.Cmd
	if c, ok := pt.(interface{ Cmd() *gopty.Cmd }); ok {
		cmd = c.Cmd()
	}

	t.Cleanup(func() {
		// pt.Close reaps the slave (Kill + inline Wait). Calling
		// cmd.Process.Wait() again would fail with "process already
		// waited on" so we deliberately do not double-reap here.
		_ = pt.Close()
	})

	// Touch cmd once so a future refactor that drops it trips the
	// test compile rather than silently passing.
	if cmd == nil {
		t.Fatalf("newDeadlineBoundSessionPlatform: expected cmd from Start")
	}
	return &shellSession{pty: pt, cmd: cmd}
}
