package main

import (
	"net"
	"strings"
	"testing"
)

// Test_getAllInterfaceIPs_skipsLoopback validates that the comma-separated
// IP list returned for heartbeats never contains loopback addresses
// (127.0.0.0/8, ::1), non-IPv4 entries, or empty fragments. The
// multi-NIC aggregation feeds the agent_ip field that the server
// parses server-side, so a stray loopback would leak through and
// pollute the VPS IP list shown in the UI.
func Test_getAllInterfaceIPs_skipsLoopback(t *testing.T) {
	got := getAllInterfaceIPs()
	if got == "" {
		t.Skip("no non-loopback interfaces available in this test env")
	}
	for _, ip := range strings.Split(got, ",") {
		if ip == "" {
			t.Fatalf("empty element in comma-separated output %q", got)
		}
		parsed := net.ParseIP(ip)
		if parsed == nil {
			t.Fatalf("invalid IP %q in output %q", ip, got)
		}
		if parsed.IsLoopback() {
			t.Fatalf("loopback IP %q leaked into output %q", ip, got)
		}
		if parsed.To4() == nil {
			t.Fatalf("non-IPv4 %q in output %q (only IPv4 supported)", ip, got)
		}
	}
}

// Test_getAllInterfaceIPs_noPanic is a smoke test: the function must
// never panic regardless of host network state. We can't force
// net.Interfaces() to fail without breaking the real network, so the
// only meaningful invariant here is "callable, returns string,
// no panic".
func Test_getAllInterfaceIPs_noPanic(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("getAllInterfaceIPs panicked: %v", r)
		}
	}()
	_ = getAllInterfaceIPs()
}

// Test_isPrivateIPv4 validates the range table that powers the
// private/CGNAT filter in getAllInterfaceIPs. Table-driven so adding
// a new range is one row. CGNAT (100.64/10) is the critical case
// because Go's net.IP.IsPrivate() does NOT cover it; this test would
// fail if the helper ever regressed to IsPrivate() alone.
func Test_isPrivateIPv4(t *testing.T) {
	cases := []struct {
		ip   string
		want bool
		why  string
	}{
		// Public — must pass through
		{"88.244.17.158", false, "Turkish public IP from the bug report"},
		{"1.1.1.1", false, "Cloudflare DNS"},
		{"8.8.8.8", false, "Google DNS"},
		{"203.0.113.5", false, "TEST-NET-3 documentation range"},

		// RFC 1918 private
		{"10.0.0.1", true, "RFC 1918 10/8"},
		{"10.255.255.255", true, "RFC 1918 10/8 upper bound"},
		{"172.16.0.1", true, "RFC 1918 172.16/12 lower bound"},
		{"172.31.255.255", true, "RFC 1918 172.16/12 upper bound"},
		{"172.29.160.1", true, "Docker/Hyper-V default from the bug report"},
		{"172.32.0.1", false, "just outside 172.16/12 — must be public"},
		{"172.15.0.1", false, "just below 172.16/12 — must be public"},
		{"192.168.1.108", true, "LAN IP from the bug report"},
		{"192.168.0.0", true, "RFC 1918 192.168/16 lower bound"},
		{"192.168.255.255", true, "RFC 1918 192.168/16 upper bound"},

		// CGNAT (the case IsPrivate() misses)
		{"100.64.0.0", true, "CGNAT 100.64/10 lower bound (RFC 6598)"},
		{"100.71.84.109", true, "Tailscale CGNAT IP from the bug report"},
		{"100.127.255.255", true, "CGNAT 100.64/10 upper bound"},
		{"100.63.255.255", false, "just below CGNAT range — must be public"},
		{"100.128.0.0", false, "just above CGNAT range — must be public"},

		// Loopback / link-local / unspecified
		{"127.0.0.1", true, "loopback"},
		{"127.255.255.255", true, "loopback upper bound"},
		{"169.254.1.1", true, "link-local"},
		{"169.254.255.255", true, "link-local upper bound"},
		{"0.0.0.0", true, "unspecified"},

		// IPv6 must return false (out of scope for this helper)
		{"::1", false, "IPv6 loopback — caller handles separately"},
		{"fe80::1", false, "IPv6 link-local — caller handles separately"},
	}
	for _, tc := range cases {
		t.Run(tc.ip, func(t *testing.T) {
			parsed := net.ParseIP(tc.ip)
			if parsed == nil {
				t.Fatalf("test setup: net.ParseIP(%q) returned nil", tc.ip)
			}
			if got := isPrivateIPv4(parsed); got != tc.want {
				t.Fatalf("isPrivateIPv4(%q) = %v, want %v (%s)", tc.ip, got, tc.want, tc.why)
			}
		})
	}
}

// Test_isPrivateIPv4_stringInput covers the convenience form used in
// the spec's example: isPrivateIPv4("100.71.84.109") -> true. The
// daemon helper itself takes net.IP, so this wraps ParseIP for the
// reader-friendly call style.
func Test_isPrivateIPv4_stringInput(t *testing.T) {
	if !isPrivateIPv4(net.ParseIP("100.71.84.109")) {
		t.Fatal("100.71.84.109 (Tailscale CGNAT) must be reported as private")
	}
	if isPrivateIPv4(net.ParseIP("88.244.17.158")) {
		t.Fatal("88.244.17.158 (public) must NOT be reported as private")
	}
	if !isPrivateIPv4(net.ParseIP("10.0.0.1")) {
		t.Fatal("10.0.0.1 (RFC 1918) must be reported as private")
	}
	if !isPrivateIPv4(net.ParseIP("192.168.1.1")) {
		t.Fatal("192.168.1.1 (RFC 1918) must be reported as private")
	}
	if !isPrivateIPv4(net.ParseIP("172.29.160.1")) {
		t.Fatal("172.29.160.1 (Docker/Hyper-V) must be reported as private")
	}
}

// Test_getAllInterfaceIPs_skipsPrivateAndCGNAT extends the loopback
// filter invariant: the comma-separated output must also exclude
// every RFC 1918 / CGNAT / link-local / unspecified IPv4 address.
// Mirrors the user symptom from the bug report — a NAT'd host with
// Tailscale (100.71.84.109) + LAN (192.168.1.108) + Docker
// (172.29.160.1) must not see any of those leak into the heartbeat.
func Test_getAllInterfaceIPs_skipsPrivateAndCGNAT(t *testing.T) {
	got := getAllInterfaceIPs()
	if got == "" {
		t.Skip("no eligible interfaces available in this test env")
	}
	for _, ip := range strings.Split(got, ",") {
		if ip == "" {
			t.Fatalf("empty element in comma-separated output %q", got)
		}
		parsed := net.ParseIP(ip)
		if parsed == nil {
			t.Fatalf("invalid IP %q in output %q", ip, got)
		}
		if parsed.IsLoopback() {
			t.Fatalf("loopback IP %q leaked into output %q", ip, got)
		}
		if parsed.To4() == nil {
			t.Fatalf("non-IPv4 %q in output %q (only IPv4 supported)", ip, got)
		}
		if isPrivateIPv4(parsed) {
			t.Fatalf("private/CGNAT IP %q leaked into output %q", ip, got)
		}
	}
}
