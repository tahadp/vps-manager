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
	cmd.Dir = "C:\\"
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
	var parsed []byte
	for i := 0; i < len(data); i++ {
		if data[i] == '\r' {
			if i+1 < len(data) && data[i+1] == '\n' {
				parsed = append(parsed, '\r', '\n')
				i++
			} else {
				parsed = append(parsed, '\r', '\n')
			}
		} else {
			parsed = append(parsed, data[i])
		}
	}
	return s.stdin.Write(parsed)
}

func (s *shellSession) Read(buf []byte) (int, error) {
	return s.reader.Read(buf)
}

func (s *shellSession) Close() error {
	_ = s.stdin.Close()
	_ = s.reader.Close()
	return nil
}
