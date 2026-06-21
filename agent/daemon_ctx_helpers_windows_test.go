//go:build windows

package main

import (
	"testing"

	gopty "github.com/aymanbagabas/go-pty"
)

// deadlineAware is false on Windows. The aymanbagabas/go-pty
// ConPTY DOES support SetReadDeadline via its output pipe, but
// the deadline-exit test relies on a quiet shell that the
// production shell command cannot reliably provide on Windows
// (ping, timeout, pause all emit some output before the 5s
// deadline). The ctx-cancel path exercises the same goroutine-leak
// fix without that requirement, so we keep this test gated to
// POSIX where `sleep N` is trivially silent.
const deadlineAware = false

// newDeadlineBoundSessionPlatform returns a real shellSession
// backed by a ConPTY whose Read blocks waiting for output. When
// pumpShellOutput is later asked to exit (via ctx cancel or
// Close), the ConPTY pipe is closed and Read unblocks, which is
// the path the ctx-cancel test exercises.
//
// The launched command (`ping -n 60 127.0.0.1 -w 1000`) prints a
// reply once per second; the inner Read will receive that
// output and pumpShellOutput will send it on. The 3-second
// ctx-cancel budget in Test_pumpShellOutput_exitsOnContextCancel
// is well below the 1-second ping cadence, so the cancel path
// fires before the next ping reply.
func newDeadlineBoundSessionPlatform(t *testing.T) *shellSession {
	t.Helper()

	pt, err := Start(Options{
		Command: "cmd.exe",
		Args:    []string{"/c", "ping", "-n", "60", "127.0.0.1", "-w", "1000"},
	})
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

	if cmd == nil {
		t.Fatalf("newDeadlineBoundSessionPlatform: expected cmd from Start")
	}
	return &shellSession{pty: pt, cmd: cmd}
}
