//go:build windows

package main

import (
	"fmt"
	"sync"
	"time"

	gopty "github.com/aymanbagabas/go-pty"
)

// goPty wraps aymanbagabas/go-pty's Windows ConPTY handle and
// satisfies the agent's Pty interface (declared in pty.go).
//
// On Windows the underlying ConPTY output is a plain os.Pipe, so
// SetReadDeadline forwards to that pipe and the inner Read pump
// can bound its blocking time. Closing the PTY closes the pipe
// and kills the slave via the Cmd handle.
type goPty struct {
	pty gopty.Pty
	cmd *gopty.Cmd

	mu       sync.Mutex
	closed   bool
	outPipe  deadlineFile // out pipe (for SetReadDeadline) — may be nil
}

// deadlineFile is the small subset of *os.File that we need for
// SetReadDeadline. We accept the interface so the same wrapper
// type works on both platforms (the Unix impl supplies the master
// *os.File; the Windows impl supplies OutputPipe()).
type deadlineFile interface {
	SetReadDeadline(t time.Time) error
}

func newGoPty(p gopty.Pty, c *gopty.Cmd) *goPty {
	g := &goPty{pty: p, cmd: c}
	if cp, ok := p.(gopty.ConPty); ok {
		if out := cp.OutputPipe(); out != nil {
			g.outPipe = out
		}
	}
	return g
}

func (p *goPty) Read(buf []byte) (int, error) {
	return p.pty.Read(buf)
}

func (p *goPty) Write(data []byte) (int, error) {
	return p.pty.Write(data)
}

func (p *goPty) SetReadDeadline(t time.Time) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.outPipe == nil {
		return nil
	}
	return p.outPipe.SetReadDeadline(t)
}

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

// Close terminates the slave (best-effort) and closes the PTY
// handle. Idempotent.
func (p *goPty) Close() error {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil
	}
	p.closed = true
	p.mu.Unlock()

	if p.cmd != nil && p.cmd.Process != nil {
		_ = p.cmd.Process.Kill()
		// Reap the child so it does not leave a zombie. Inline
		// Wait: the process has been signaled, so the kernel will
		// reap it almost immediately. Running Wait in a goroutine
		// and racing on a "done" channel was tried first; it caused
		// goleak-detected goroutine leaks in tests because the
		// reaper was still running when the test finished. Inline
		// Wait is simpler and correct.
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

// startWindowsPty implements the pty.Start factory on Windows using
// aymanbagabas/go-pty's ConPTY-backed PTY. This is the bug fix for
// the historical pipe-backed cmd.exe: ConPTY gives cmd.exe a real
// line discipline, so backspace, arrow keys, and clear-screen
// escape sequences work the way they do on Unix.
func startWindowsPty(opts Options) (Pty, error) {
	if opts.Command == "" {
		return nil, fmt.Errorf("pty: empty Command (Windows impl requires explicit shell path)")
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
		return nil, fmt.Errorf("pty: open ConPTY: %w", err)
	}

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

	return newGoPty(p, cmd), nil
}

func init() {
	Start = startWindowsPty
}
