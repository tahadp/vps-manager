//go:build !windows

package main

import (
	"os"
	"os/exec"
	"time"

	"github.com/creack/pty"
)

type shellSession struct {
	id   string
	ptmx *os.File
	cmd  *exec.Cmd
}

func startShell(shell string) (*shellSession, error) {
	cmd := exec.Command(shell)
	cmd.Dir = "/"
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}
	return &shellSession{ptmx: ptmx, cmd: cmd}, nil
}

func (s *shellSession) Write(data []byte) (int, error) {
	return s.ptmx.Write(data)
}

func (s *shellSession) Read(buf []byte) (int, error) {
	return s.ptmx.Read(buf)
}

// SetReadDeadline applies a read deadline to the underlying PTY. The
// inner Read pump uses this to bound how long it will block on a
// quiet shell so a shutdown signal cannot be starved by a silent
// process. Returns nil if the session has no PTY.
func (s *shellSession) SetReadDeadline(t time.Time) error {
	if s.ptmx == nil {
		return nil
	}
	return s.ptmx.SetReadDeadline(t)
}

func (s *shellSession) Close() error {
	if s.ptmx == nil {
		return nil
	}
	return s.ptmx.Close()
}
