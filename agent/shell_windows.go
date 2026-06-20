//go:build windows

package main

import (
	"io"
	"os/exec"
	"time"
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

// SetReadDeadline is a no-op on Windows because the pipe-backed reader
// does not support deadlines. Shutdown unblocks Read via Close()
// instead. Returning nil keeps the pump loop's error-handling uniform
// across platforms; returning a non-nil error would falsely signal
// an I/O failure.
func (s *shellSession) SetReadDeadline(time.Time) error {
	return nil
}

func (s *shellSession) Close() error {
	if s.stdin != nil {
		_ = s.stdin.Close()
	}
	if s.reader != nil {
		_ = s.reader.Close()
	}
	return nil
}
