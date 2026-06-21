// Cross-platform helpers for the WebPTY shell environment.
//
// This file deliberately has no build tag: the env-construction
// logic it houses is platform-agnostic (it just reads os.Environ()
// and overlays a few well-known variables) and we want the unit
// tests in shell_env_test.go to compile and run on every platform
// the agent supports (Linux, macOS, Windows). Keeping the function
// here also means the production Unix fix (Unix-only startShell
// wiring) and the tests stay in lockstep — the tests pin the
// behavior the production caller depends on.
package main

import (
	"os"
	"strings"
)

// shellEnvBase returns the minimum environment for an interactive
// login-style shell spawned by the WebPTY. The bug this fixes:
//
// When the agent runs as a systemd / kardianos-service / launchd
// unit, its own environment typically does NOT carry TERM (no
// terminal ever attached to the parent process). Without TERM, an
// interactive bash (the production default at handleShellOpen)
// does not load the right terminfo entry, and the readline / line
// discipline mapping for DEL (0x7F, the byte xterm.js sends for
// Backspace) is inconsistent — backspace silently fails to erase
// the previous character. Pre-seeding TERM, COLORTERM, and a
// couple of standard locale / path defaults gives bash a sane
// terminfo context so Backspace, arrow keys, and clear-screen
// ANSI sequences all behave like a real terminal.
//
// We seed the agent's process env first (PATH, HOME, LANG) so the
// child has the same look-and-feel as a login shell would, and
// then overlay the terminal-required variables so they always
// win — even if the parent's TERM happens to be "dumb" (which
// would be worse than absent for a TUI session).
func shellEnvBase() []string {
	env := os.Environ()

	// Always overlay these — never trust the parent's value for
	// terminal behavior, because the parent may run as a daemon
	// with TERM=dumb or TERM=vt100.
	overlay := map[string]string{
		"TERM":      "xterm-256color",
		"COLORTERM": "truecolor",
	}
	// Keep HOME / LANG / PATH from the parent when present so
	// the shell feels native to the host. USERPROFILE is the
	// Windows equivalent of HOME; carrying it through keeps
	// Windows shells (cmd.exe, powershell) happy.
	for _, k := range []string{"HOME", "USERPROFILE", "LANG", "LC_ALL", "PATH"} {
		if v := os.Getenv(k); v != "" {
			overlay[k] = v
		}
	}
	// Drop any key we are about to overlay from the inherited
	// env so the overlay is authoritative — otherwise HOME,
	// LANG, etc. would appear TWICE in the result (once from
	// the parent, once from the overlay map). Duplicates
	// confuse downstream consumers: glibc takes the LAST
	// duplicate on getenv, but a shell that does its own
	// parsing (or a misbehaving terminfo lookup) may take
	// the FIRST — implementation-defined, never what you
	// want in production.
	filtered := env[:0]
	for _, e := range env {
		key, _, _ := strings.Cut(e, "=")
		if _, isOverlay := overlay[key]; isOverlay {
			continue
		}
		filtered = append(filtered, e)
	}
	out := make([]string, 0, len(filtered)+len(overlay))
	out = append(out, filtered...)
	for k, v := range overlay {
		out = append(out, k+"="+v)
	}
	return out
}
