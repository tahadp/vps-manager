// Package pty_start (file agent/pty.go) provides the cross-platform
// pseudo-terminal abstraction for the vps-agent.
//
// On Unix it wraps github.com/creack/pty (real PTY via pty(7)).
// On Windows it wraps ConPTY (Windows 10 1809+) for a real interactive
// terminal experience — essential for cmd.exe to interpret backspace,
// arrow keys, and clear-screen ANSI escape sequences correctly.
//
// The file is package main (same dir as daemon.go) so it can be used
// directly from the agent's shell session code. The "pty" name is
// conceptual — Go disallows a separate package in the same directory
// as package main. Callers that need a typed handle use the Pty
// interface defined here.
package main

import "time"

// Pty is a cross-platform pseudo-terminal handle.
type Pty interface {
	// Read blocks until data is available, deadline elapses, or the
	// PTY is closed. Returns os.ErrDeadlineExceeded if the deadline
	// set via SetReadDeadline fires before data arrives (callers should
	// treat that as a non-terminal "no data yet" signal).
	Read(p []byte) (n int, err error)
	// Write sends data to the slave process's stdin.
	Write(p []byte) (n int, err error)
	// SetReadDeadline bounds the next Read call. A zero-time deadline
	// disables the timeout.
	SetReadDeadline(t time.Time) error
	// SetSize resizes the PTY. cols/rows are character cell dimensions.
	SetSize(cols, rows int) error
	// Close releases the PTY handle and (best-effort) terminates the
	// slave process. Idempotent.
	Close() error
}

// Options configures a new PTY-bound subprocess.
type Options struct {
	Command string   // executable path; empty -> default shell
	Args    []string // additional arguments
	Env     []string // environment variables (key=value); nil = inherit
	Dir     string   // working directory; empty -> default
	Cols    int      // initial column count; 0 -> 80
	Rows    int      // initial row count; 0 -> 24
}

// Start launches the configured command attached to a new PTY and
// returns the master handle. The slave process's lifecycle is bound
// to the returned Pty: closing the PTY kills the slave.
//
// The function pointer is initialized in pty_unix.go (creack/pty) and
// pty_windows.go (ConPTY placeholder). Callers should treat Start as
// the only supported way to create a Pty.
var Start func(opts Options) (Pty, error)
