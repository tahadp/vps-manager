//go:build windows

package main

import (
	"io"
	"os/exec"
)

type shellSession struct {
	id     string
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	reader io.ReadCloser
}

func startShell(shell string) (*shellSession, error) {
	cmd := exec.Command(shell)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}

	pr, pw := io.Pipe()
	cmd.Stdout = pw
	cmd.Stderr = pw

	if err := cmd.Start(); err != nil {
		stdin.Close()
		pw.Close()
		pr.Close()
		return nil, err
	}

	go func() {
		_ = cmd.Wait()
		_ = pw.Close()
	}()

	return &shellSession{
		cmd:    cmd,
		stdin:  stdin,
		reader: pr,
	}, nil
}

func (s *shellSession) Write(data []byte) (int, error) {
	return s.stdin.Write(data)
}

func (s *shellSession) Read(buf []byte) (int, error) {
	return s.reader.Read(buf)
}

func (s *shellSession) Close() error {
	_ = s.stdin.Close()
	_ = s.reader.Close()
	return nil
}
