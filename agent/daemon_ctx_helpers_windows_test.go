//go:build windows

package main

import (
	"io"
	"os"
	"testing"
)

// deadlineAware is false on Windows because the pipe-backed reader
// does not support SetReadDeadline; the deadline test is skipped
// and the ctx-cancel test is the only path that exercises shutdown.
const deadlineAware = false

// newDeadlineBoundSessionPlatform returns a shellSession whose Read
// blocks on an os.Pipe read end. The pipe's reader does not natively
// support SetReadDeadline, so on Windows we rely on Close() to unblock
// Read. The pump's ctx-cancel path calls sess.Close() (via
// cleanupShell) which closes the pipe and unblocks Read; this still
// exercises the goroutine-leak fix on Windows.
func newDeadlineBoundSessionPlatform(t *testing.T) *shellSession {
	t.Helper()

	pr, pw := newBlockingPipe()
	t.Cleanup(func() {
		_ = pr.Close()
		_ = pw.Close()
	})

	return &shellSession{
		id:     "deadline-test",
		reader: pr,
		// stdin and cmd are nil; pumpShellOutput does not touch them
		// on the deadline/cancel paths.
	}
}

// newBlockingPipe returns a (reader, writer) pair whose Read blocks
// until the writer is closed. Used as a deterministic blocking source
// for deadline/cancel tests.
func newBlockingPipe() (io.ReadCloser, io.WriteCloser) {
	r, w, err := os.Pipe()
	if err != nil {
		panic(err)
	}
	return r, w
}
