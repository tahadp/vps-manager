//go:build !windows

package main

import (
	"os/exec"
	"testing"

	"github.com/creack/pty"
)

// deadlineAware is true on POSIX because the PTY reader respects
// SetReadDeadline; the deadline-exit test is meaningful here.
const deadlineAware = true

// newDeadlineBoundSessionPlatform returns a real shellSession backed by
// a PTY whose Read will block until SetReadDeadline fires (or the PTY
// is closed). We use pty.Start against `sleep 60` so no output is
// produced and Read blocks indefinitely until deadline.
func newDeadlineBoundSessionPlatform(t *testing.T) *shellSession {
	t.Helper()

	cmd := exec.Command("sleep", "60")
	ptmx, err := pty.Start(cmd)
	if err != nil {
		t.Skipf("pty.Start unavailable in this environment: %v", err)
	}
	t.Cleanup(func() {
		_ = ptmx.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_, _ = cmd.Process.Wait()
		}
	})

	return &shellSession{
		id:   "deadline-test",
		ptmx: ptmx,
		cmd:  cmd,
	}
}
