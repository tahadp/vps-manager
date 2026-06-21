//go:build windows

package main

import (
	"fmt"
	"time"

	gopty "github.com/aymanbagabas/go-pty"
)

// shellSession is a thin wrapper around a Pty that carries the
// server-assigned session id. The Pty does all real I/O work; this
// type exists so daemon.go can identify sessions in p.shells and so
// future per-session state (e.g. escape sequence sanitizer) has a
// home.
//
// cmd is exposed for daemon.go's cleanup path
// (cleanupShell: sess.cmd.Process.Kill(); sess.cmd.Process.Wait()).
// It is the aymanbagabas/go-pty *Cmd; Process *os.Process is the
// same field exposed by stdlib *exec.Cmd, so the cleanup call site
// is unchanged.
type shellSession struct {
	id  string
	pty Pty
	cmd *gopty.Cmd
}

func startShell(shell string) (*shellSession, error) {
	if Start == nil {
		return nil, fmt.Errorf("pty: Start factory not initialized (unsupported platform?)")
	}
	p, err := Start(Options{Command: shell})
	if err != nil {
		return nil, err
	}
	var cmd *gopty.Cmd
	if c, ok := p.(interface{ Cmd() *gopty.Cmd }); ok {
		cmd = c.Cmd()
	}
	return &shellSession{pty: p, cmd: cmd}, nil
}

func (s *shellSession) Write(data []byte) (int, error) {
	return s.pty.Write(data)
}

func (s *shellSession) Read(buf []byte) (int, error) {
	return s.pty.Read(buf)
}

// SetReadDeadline forwards to the ConPTY output pipe, which is a
// standard *os.File from os.Pipe and therefore supports
// SetReadDeadline natively. The inner Read pump uses this to bound
// how long it will block on a quiet shell so a shutdown signal
// cannot be starved by a silent process.
func (s *shellSession) SetReadDeadline(t time.Time) error {
	return s.pty.SetReadDeadline(t)
}

// SetSize resizes the underlying ConPTY. cols/rows are character
// cell dimensions. The server forwards resize events from the
// xterm.js frontend so a window resize re-flows the slave's idea
// of the terminal geometry (line wraps, status bar width, etc).
func (s *shellSession) SetSize(cols, rows int) error {
	return s.pty.SetSize(cols, rows)
}

func (s *shellSession) Close() error {
	return s.pty.Close()
}
