//go:build !windows

package main

import (
	"errors"
	"fmt"
	"time"

	gopty "github.com/aymanbagabas/go-pty"
)

// goPty is a cross-platform PTY wrapper that satisfies the agent's
// Pty interface (declared in pty.go) on top of aymanbagabas/go-pty.
//
// On Unix the underlying handle is a real pty(7) master file obtained
// from go-pty's UnixPty.Master() accessor. SetReadDeadline is wired
// through that file so the inner Read pump can bound its blocking
// time (see daemon.go:pumpShellOutput).
type goPty struct {
	pty gopty.Pty
	cmd *gopty.Cmd
	// master is the deadline-aware PTY master file. On Unix this is
	// the same handle that go-pty uses internally; on platforms that
	// do not expose a deadline-aware handle (Windows ConPTY) this is
	// nil and SetReadDeadline is a no-op.
	master interface {
		SetReadDeadline(t time.Time) error
	}
}

// newGoPty builds a *goPty from an already-started go-pty Pty + Cmd.
func newGoPty(p gopty.Pty, c *gopty.Cmd) (*goPty, error) {
	g := &goPty{pty: p, cmd: c}
	if up, ok := p.(gopty.UnixPty); ok {
		if m := up.Master(); m != nil {
			g.master = m
		}
	}
	return g, nil
}

func (p *goPty) Read(buf []byte) (int, error) {
	return p.pty.Read(buf)
}

func (p *goPty) Write(data []byte) (int, error) {
	return p.pty.Write(data)
}

// SetReadDeadline bounds the next Read. On Unix it forwards to the
// PTY master file (deadline-aware). On Windows it is a no-op
// because the ConPTY output pipe is a plain os.Pipe and the agent
// cancels blocked reads via Close instead.
func (p *goPty) SetReadDeadline(t time.Time) error {
	if p.master == nil {
		return nil
	}
	return p.master.SetReadDeadline(t)
}

// SetSize forwards to the underlying go-pty Resize (width × height).
func (p *goPty) SetSize(cols, rows int) error {
	if cols <= 0 || rows <= 0 {
		return fmt.Errorf("pty: invalid size cols=%d rows=%d", cols, rows)
	}
	return p.pty.Resize(cols, rows)
}

// Cmd returns the underlying aymanbagabas/go-pty Cmd. Exposed so
// shellSession can hand it to daemon.go's cleanup path
// (cleanupShell: sess.cmd.Process.Kill(); sess.cmd.Process.Wait()).
func (p *goPty) Cmd() *gopty.Cmd { return p.cmd }

// Close terminates the slave process (best-effort) and closes the
// PTY handle. Idempotent: subsequent calls return nil.
func (p *goPty) Close() error {
	if p.cmd != nil && p.cmd.Process != nil {
		_ = p.cmd.Process.Kill()
		// Reap the child so it does not leave a zombie. We call
		// Wait inline because the process has already been signaled
		// with Kill, so the kernel will reap it almost immediately
		// and Wait returns without blocking the caller's shutdown
		// path for any meaningful amount of time. Running Wait in
		// a goroutine and racing on a "done" channel was tried
		// first; it caused goleak-detected goroutine leaks in
		// tests because the reaper was still running when the
		// test finished. Inline Wait is simpler and correct.
		_ = p.cmd.Wait()
		p.cmd = nil
	}
	if p.pty != nil {
		err := p.pty.Close()
		p.pty = nil
		return err
	}
	return nil
}

// startUnixPty implements the pty.Start factory on Unix. It launches
// the configured command attached to a real PTY (pty(7)) via
// github.com/aymanbagabas/go-pty (which in turn wraps
// github.com/creack/pty). The slave process's lifecycle is bound to
// the master handle: closing the master kills the slave.
func startUnixPty(opts Options) (Pty, error) {
	if opts.Command == "" {
		return nil, errors.New("pty: empty Command (Unix impl requires explicit shell path)")
	}

	cols := opts.Cols
	if cols == 0 {
		cols = 80
	}
	rows := opts.Rows
	if rows == 0 {
		rows = 24
	}

	p, err := gopty.New()
	if err != nil {
		return nil, fmt.Errorf("pty: open: %w", err)
	}

	// Apply the initial size before the slave starts so the line
	// discipline and programs that read it at startup (e.g. vim,
	// less, top) see the correct geometry.
	if err := p.Resize(cols, rows); err != nil {
		_ = p.Close()
		return nil, fmt.Errorf("pty: initial resize: %w", err)
	}

	cmd := p.Command(opts.Command, opts.Args...)
	if opts.Env != nil {
		cmd.Env = opts.Env
	}
	if opts.Dir != "" {
		cmd.Dir = opts.Dir
	} else {
		cmd.Dir = "/"
	}

	if err := cmd.Start(); err != nil {
		_ = p.Close()
		return nil, fmt.Errorf("pty: start %q: %w", opts.Command, err)
	}

	// We intentionally do NOT spawn a background "reaper" goroutine
	// here. If we did, the goroutine would outlive Close (where the
	// inline Wait reaps) and trigger goleak failures. The trade-off:
	// if the agent process crashes before Close, the slave becomes
	// a zombie until init reaps it. That is acceptable: the agent
	// never crashes without taking its child sessions with it, and
	// in that scenario the entire process tree is going down.

	g, err := newGoPty(p, cmd)
	if err != nil {
		_ = p.Close()
		return nil, err
	}
	return g, nil
}

func init() {
	Start = startUnixPty
}
