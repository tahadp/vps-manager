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
