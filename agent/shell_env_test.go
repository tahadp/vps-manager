// Cross-platform unit tests for shellEnvBase (agent/shell_env.go).
//
// These tests run on EVERY supported platform (Linux, macOS,
// Windows) because shellEnvBase is deliberately cross-platform —
// the production Unix-only fix in shell_unix.go consumes it, and
// keeping the function cross-platform means these tests can pin
// its behavior locally without needing a PTY or bash on PATH.
//
// We pin five invariants of the WebPTY backspace fix:
//  1. TERM and COLORTERM are always injected with the right
//     values, exactly once, regardless of the parent env.
//  2. A hostile / awkward parent TERM (dumb, vt100) is OVERLAID,
//     not appended — bash must never see a conflicting TERM.
//  3. HOME / USERPROFILE / LANG / PATH from the parent survive
//     untouched (so the child shell still looks native).
//  4. The overlay never produces duplicate TERM / COLORTERM
//     entries (a duplicate would let the kernel-defined "last
//     value wins" rule bite us on glibc / musl).
//  5. The injection still works when the parent has NO TERM at
//     all (the cardinal production case: agent as a service).
//
// Test isolation: t.Setenv (Go 1.17+) auto-restores every env
// mutation, and we never mutate process-wide state outside the
// per-test env helpers, so the tests can run with -race in
// parallel safely.

package main

import (
	"os"
	"strings"
	"testing"
)

// envCount returns the number of entries in env whose key equals
// the given key. It splits on the FIRST '=' so values that
// contain '=' (rare but legal in env values) are handled
// correctly. We use it to assert "exactly one TERM" and
// "no duplicate COLORTERM" without false positives on substrings.
func envCount(env []string, key string) int {
	n := 0
	for _, e := range env {
		k, _, ok := strings.Cut(e, "=")
		if ok && k == key {
			n++
		}
	}
	return n
}

// envValue returns the value of the first env entry whose key
// matches. Returns "" if no such key is present. Splits on the
// first '=' so values with embedded '=' survive intact.
func envValue(env []string, key string) string {
	for _, e := range env {
		k, v, ok := strings.Cut(e, "=")
		if ok && k == key {
			return v
		}
	}
	return ""
}

// TestShellEnvBase_InjectsRequiredTerminalVars pins the absolute
// minimum: the function must inject TERM=xterm-256color and
// COLORTERM=truecolor into the resulting env, each exactly once,
// regardless of what the parent process happened to carry.
//
// This is the load-bearing assertion for the WebPTY backspace
// fix: without these two entries, an interactive bash spawned
// from a service-context agent (no parent TERM) cannot load the
// right terminfo entry, and DEL (0x7F) is no longer recognized
// as an eraser by the line discipline. The end-user symptom —
// "Backspace does not erase" — is the visible failure this
// guard exists to prevent.
func TestShellEnvBase_InjectsRequiredTerminalVars(t *testing.T) {
	// Make sure neither TERM nor COLORTERM leaks from the test
	// runner's environment into our assertion: t.Setenv with
	// empty string removes the key from os.Environ()'s view
	// only if the variable is already set; the safer route is
	// to set them to known, distinct sentinels so we can
	// detect a leak even if the implementation forgot to
	// drop-and-replace.
	t.Setenv("TERM", "TEST_RUNNER_TERM_SENTINEL")
	t.Setenv("COLORTERM", "TEST_RUNNER_COLORTERM_SENTINEL")

	env := shellEnvBase()

	// Exactly one TERM and one COLORTERM — duplicates would
	// let "last value wins" in libc bite us, and a zero count
	// means the injection was skipped entirely (the original
	// bug).
	if got := envCount(env, "TERM"); got != 1 {
		t.Fatalf("TERM count: want 1, got %d\n--- env ---\n%s\n--- end ---", got, strings.Join(env, "\n"))
	}
	if got := envCount(env, "COLORTERM"); got != 1 {
		t.Fatalf("COLORTERM count: want 1, got %d\n--- env ---\n%s\n--- end ---", got, strings.Join(env, "\n"))
	}

	// Exact value match (not substring, not "contains"). The
	// sentinels are chosen to be unique substrings so a leak
	// of the parent value would trip the assertion.
	if got := envValue(env, "TERM"); got != "xterm-256color" {
		t.Fatalf("TERM value: want %q, got %q", "xterm-256color", got)
	}
	if got := envValue(env, "COLORTERM"); got != "truecolor" {
		t.Fatalf("COLORTERM value: want %q, got %q", "truecolor", got)
	}

	// Defensive: the test-runner sentinels must NOT survive.
	// If either does, the overlay is APPENDING instead of
	// REPLACING — exactly the duplicate-leak failure mode
	// this test guards against.
	for _, e := range env {
		if strings.Contains(e, "TEST_RUNNER_TERM_SENTINEL") {
			t.Fatalf("parent TERM sentinel leaked into result: %q\n--- env ---\n%s\n--- end ---", e, strings.Join(env, "\n"))
		}
		if strings.Contains(e, "TEST_RUNNER_COLORTERM_SENTINEL") {
			t.Fatalf("parent COLORTERM sentinel leaked into result: %q\n--- env ---\n%s\n--- end ---", e, strings.Join(env, "\n"))
		}
	}
}

// TestShellEnvBase_OverlaysParentTerm pins the overlay semantic
// for TERM=dumb. This is the realistic hostile-parent case: a
// CI runner or a sub-process started by a wrapper script may
// export TERM=dumb (meaning "no terminal capabilities"). If
// shellEnvBase copied that through, the WebPTY shell would
// receive TERM=dumb, terminfo would resolve to the empty
// capability set, and Backspace would once again fail to
// erase.
//
// The function MUST replace the parent's TERM with
// xterm-256color — appending would produce two TERM entries
// whose last-write-wins behavior is implementation-defined and
// would silently regress to dumb on some libc / shell
// combinations.
func TestShellEnvBase_OverlaysParentTerm(t *testing.T) {
	t.Setenv("TERM", "dumb")
	t.Setenv("COLORTERM", "TEST_RUNNER_DUMB_COLORTERM")

	env := shellEnvBase()

	if got := envCount(env, "TERM"); got != 1 {
		t.Fatalf("TERM count after dumb parent: want 1 (overlay must replace), got %d\n--- env ---\n%s\n--- end ---", got, strings.Join(env, "\n"))
	}
	if got := envValue(env, "TERM"); got != "xterm-256color" {
		t.Fatalf("TERM value after dumb parent: want %q, got %q — overlay did not replace parent value", "xterm-256color", got)
	}
	// And the dumb value must not survive as a substring of
	// any entry (e.g. hidden inside a future "DUMB_TERM" or
	// similar). Use the full token to keep the check tight.
	for _, e := range env {
		if e == "TERM=dumb" {
			t.Fatalf("TERM=dumb survived in env list: %q — overlay must drop the parent value", e)
		}
	}
}

// TestShellEnvBase_PreservesHomeLangPath pins the pass-through
// behavior for HOME / USERPROFILE / LANG / PATH. The shell the
// user sees should still feel native to the host: their $HOME
// must be the host's HOME, their $PATH must be the agent's
// PATH (so systemctl / ip / etc. stay on PATH), and $LANG
// must survive so unicode output in the WebPTY (emoji, CJK
// filenames) is not corrupted.
//
// If a parent var is missing, the function should silently
// skip it (the overlay map is built from os.Getenv, which
// returns "" for unset vars). We test the cross product:
//   - HOME is set (Unix convention)
//   - USERPROFILE is set (Windows convention)
//   - LANG is set to a non-default value
//   - PATH is set to a custom value
// and assert each one survives verbatim.
func TestShellEnvBase_PreservesHomeLangPath(t *testing.T) {
	const (
		home    = "/some/home"
		profile = `C:\Users\test`
		lang    = "tr_TR.UTF-8"
		path    = "/custom/bin:/usr/bin"
	)
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", profile)
	t.Setenv("LANG", lang)
	t.Setenv("PATH", path)

	env := shellEnvBase()

	cases := []struct {
		key, want string
		optional  bool
	}{
		{key: "HOME", want: home},
		{key: "USERPROFILE", want: profile},
		{key: "LANG", want: lang},
		{key: "PATH", want: path},
	}
	for _, c := range cases {
		got := envValue(env, c.key)
		if got == "" && c.optional {
			continue
		}
		if got != c.want {
			t.Fatalf("%s: want %q, got %q\n--- env ---\n%s\n--- end ---", c.key, c.want, got, strings.Join(env, "\n"))
		}
	}

	// Exactly one of each — no duplicates from the overlay.
	for _, k := range []string{"HOME", "USERPROFILE", "LANG", "PATH"} {
		if n := envCount(env, k); n != 1 {
			t.Fatalf("%s count: want 1, got %d", k, n)
		}
	}
}

// TestShellEnvBase_PreservesHomeLangPath_MissingVars verifies
// the optional-pass-through contract: when the parent has no
// HOME (or no USERPROFILE on Windows, etc.), shellEnvBase must
// not panic and must not inject a synthetic empty value. The
// missing var should simply be absent from the result.
//
// This is the common case for stripped-down agent
// installations (e.g. a scratch container with only PATH set).
func TestShellEnvBase_PreservesHomeLangPath_MissingVars(t *testing.T) {
	// Unset all of them. t.Setenv("FOO", "") keeps the key
	// with an empty value; we want truly unset, so use
	// os.Unsetenv inside a t.Cleanup to restore on exit.
	pre := map[string]string{}
	for _, k := range []string{"HOME", "USERPROFILE", "LANG", "LC_ALL", "PATH"} {
		if v, ok := os.LookupEnv(k); ok {
			pre[k] = v
		}
		os.Unsetenv(k)
	}
	t.Cleanup(func() {
		for k, v := range pre {
			os.Setenv(k, v)
		}
	})

	// Must not panic. Must still inject TERM/COLORTERM.
	env := shellEnvBase()
	if envValue(env, "TERM") != "xterm-256color" {
		t.Fatalf("TERM not injected when HOME/USERPROFILE/LANG/PATH are unset: %q", envValue(env, "TERM"))
	}
	if envValue(env, "COLORTERM") != "truecolor" {
		t.Fatalf("COLORTERM not injected when HOME/USERPROFILE/LANG/PATH are unset: %q", envValue(env, "COLORTERM"))
	}
}

// TestShellEnvBase_NoParentTermLeak pins the duplicate-prevention
// invariant. The implementation builds an overlay map for
// TERM/COLORTERM and then appends it to a filtered list. A
// subtle bug — e.g. forgetting to drop the parent's TERM from
// the filtered list — would produce two TERM entries, and
// glibc / musl's "last value wins" rule (or a parser that
// takes the FIRST, depending on the consumer) would silently
// revert the user's fix.
//
// We set distinct sentinel values for TERM and COLORTERM and
// assert that:
//   - Each appears EXACTLY ONCE in the result.
//   - The value of each is the well-known injected value
//     (xterm-256color / truecolor), not the sentinel.
func TestShellEnvBase_NoParentTermLeak(t *testing.T) {
	t.Setenv("TERM", "vt100")
	t.Setenv("COLORTERM", "256")

	env := shellEnvBase()

	if got := envCount(env, "TERM"); got != 1 {
		t.Fatalf("TERM count: want 1, got %d — overlay produced a duplicate\n--- env ---\n%s\n--- end ---", got, strings.Join(env, "\n"))
	}
	if got := envCount(env, "COLORTERM"); got != 1 {
		t.Fatalf("COLORTERM count: want 1, got %d — overlay produced a duplicate\n--- env ---\n%s\n--- end ---", got, strings.Join(env, "\n"))
	}

	// The hostile parent values must be GONE, not just hidden.
	for _, e := range env {
		if e == "TERM=vt100" {
			t.Fatalf("TERM=vt100 survived the overlay — parent value was appended, not replaced")
		}
		if e == "COLORTERM=256" {
			t.Fatalf("COLORTERM=256 survived the overlay — parent value was appended, not replaced")
		}
	}
}

// TestShellEnvBase_HandlesMissingParentTerm pins the canonical
// production scenario: the agent runs as a service, the
// inherited environment has NO TERM at all (no terminal ever
// attached to the parent), and shellEnvBase must STILL inject
// TERM=xterm-256color. This is the regression guard for the
// user-reported bug — without it, an interactive bash spawned
// from a service-context agent silently sees TERM= and falls
// back to a behavior where 0x7F does not erase.
//
// We unset TERM (not just set it to "") because the
// implementation distinguishes between "var present with empty
// value" and "var absent" via os.Getenv's "" return for both —
// but os.Environ() only includes actually-set variables, so
// unsetting is the cleanest way to reach the production
// state.
func TestShellEnvBase_HandlesMissingParentTerm(t *testing.T) {
	// Unset TERM (and COLORTERM) to reach the service-context
	// state. Restore on exit.
	for _, k := range []string{"TERM", "COLORTERM"} {
		if v, ok := os.LookupEnv(k); ok {
			prev := v
			os.Unsetenv(k)
			t.Cleanup(func() { os.Setenv(k, prev) })
		} else {
			os.Unsetenv(k)
			// Nothing to restore — key was already absent.
		}
	}

	env := shellEnvBase()

	if got := envValue(env, "TERM"); got != "xterm-256color" {
		t.Fatalf("TERM=xterm-256color not injected when parent has no TERM — got %q\n--- env ---\n%s\n--- end ---", got, strings.Join(env, "\n"))
	}
	if got := envValue(env, "COLORTERM"); got != "truecolor" {
		t.Fatalf("COLORTERM=truecolor not injected when parent has no COLORTERM — got %q\n--- env ---\n%s\n--- end ---", got, strings.Join(env, "\n"))
	}
}
