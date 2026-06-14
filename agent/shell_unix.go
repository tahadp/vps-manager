//go:build !windows

package main

import (
	"os"
	"os/exec"
	"github.com/creack/pty"
)

type shellSession struct {
	id   string
	ptmx *os.File
	cmd  *exec.Cmd
}

func startShell(shell string) (*shellSession, error) {
	cmd := exec.Command(shell)
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

func (s *shellSession) Close() error {
	return s.ptmx.Close()
}
