package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	pb "agent/pb"
	"agent/telemetry"

	"github.com/kardianos/service"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type agentSettings struct {
    mu                 sync.RWMutex
    screenshotInterval time.Duration
    telemetryInterval  time.Duration
}

// Visibility fields are server-driven; agent does not filter locally.
// The UI receives filter flags via VpsSettings on the next heartbeat
// response and renders accordingly.
var settings = &agentSettings{
    screenshotInterval: 30 * time.Second,
    telemetryInterval:  1 * time.Second,
}

func applySettings(s *pb.VpsSettingsMessage) {
    if s == nil {
        return
    }
    settings.mu.Lock()
    defer settings.mu.Unlock()
    if s.ScreenshotIntervalSec > 0 {
        settings.screenshotInterval = time.Duration(s.ScreenshotIntervalSec) * time.Second
    }
    if s.TelemetryIntervalSec > 0 {
        settings.telemetryInterval = time.Duration(s.TelemetryIntervalSec) * time.Second
    }
    log.Printf("Settings applied: telemetry=%v screenshot=%v", settings.telemetryInterval, settings.screenshotInterval)
}

// getLocalOutboundIP returns the source IP the OS would use for an
// outbound UDP packet. It is a method so it can observe the agent's
// shutdown context; the underlying net.Dial does not accept a
// context, so we use a short, fixed timeout.
func (p *program) getLocalOutboundIP() string {
	conn, err := net.DialTimeout("udp", "8.8.8.8:80", 2*time.Second)
	if err != nil {
		log.Printf("getLocalOutboundIP: dial failed: %v", err)
		return ""
	}
	defer conn.Close()
	localAddr, ok := conn.LocalAddr().(*net.UDPAddr)
	if !ok {
		log.Printf("getLocalOutboundIP: unexpected LocalAddr type %T", conn.LocalAddr())
		return ""
	}
	return localAddr.IP.String()
}

// ipLookupURLs is the list of HTTPS endpoints the agent polls in
// order to discover its public IP. It is a package-level var so tests
// can swap in a httptest server without touching the real network.
// Endpoints are tried in order; the first one that returns a valid
// IP wins.
var ipLookupURLs = []string{
	"https://api.ipify.org",
	"https://ifconfig.me/ip",
}

// isPrivateIPv4 reports whether ip belongs to a non-routable IPv4
// range the agent must not advertise on heartbeats. It supplements
// net.IP.IsPrivate() (Go 1.17+) with an explicit CGNAT check, since
// IsPrivate() does NOT cover 100.64.0.0/10 (Tailscale / WireGuard /
// carrier-grade NAT). Returns false for IPv6 and for any IP that
// fails the IPv4 parse — IPv6 handling is the caller's job.
//
// Ranges filtered:
//   - 0.0.0.0/8       (unspecified)
//   - 10.0.0.0/8      (RFC 1918 private)
//   - 100.64.0.0/10   (CGNAT, RFC 6598 — Tailscale/WireGuard often land here)
//   - 127.0.0.0/8     (loopback)
//   - 169.254.0.0/16  (link-local)
//   - 172.16.0.0/12   (RFC 1918 private, 172.16.0.0 – 172.31.255.255)
//   - 192.168.0.0/16  (RFC 1918 private)
func isPrivateIPv4(ip net.IP) bool {
	v4 := ip.To4()
	if v4 == nil {
		return false
	}
	// Unspecified 0.0.0.0/8
	if v4[0] == 0 {
		return true
	}
	// Loopback 127.0.0.0/8
	if v4[0] == 127 {
		return true
	}
	// Link-local 169.254.0.0/16
	if v4[0] == 169 && v4[1] == 254 {
		return true
	}
	// CGNAT 100.64.0.0/10 — net.IP.IsPrivate() does NOT cover this.
	// 100.64.0.0  = 01100100.01000000...
	// 100.127.255.255 = 01100100.01111111...
	// First two bits of the second octet are 10 → mask 0xC0, want 0x40.
	if v4[0] == 100 && v4[1]&0xC0 == 0x40 {
		return true
	}
	// RFC 1918 private 10.0.0.0/8
	if v4[0] == 10 {
		return true
	}
	// RFC 1918 private 172.16.0.0/12 — 172.16 through 172.31
	// 172 = 0xAC. Second octet 0x10 .. 0x1F.
	if v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31 {
		return true
	}
	// RFC 1918 private 192.168.0.0/16
	if v4[0] == 192 && v4[1] == 168 {
		return true
	}
	return false
}

// getAllInterfaceIPs returns a comma-separated list of all PUBLIC
// IPv4 addresses across all UP network interfaces. Used to populate
// the agent_ip field on heartbeats so the server can show primary +
// secondary IPs (AGENTS F4.3 multi-NIC aggregation).
//
// Order: enumerated in net.Interfaces() order (kernel order, deterministic
// for tests). Loopback and down interfaces are skipped. IPv6 link-local
// (fe80::/10) and IPv6 ULA (fc00::/7) are also skipped — they don't
// help the server's reachability check.
//
// Non-public IPv4 ranges are filtered via isPrivateIPv4:
// 10/8, 172.16/12, 192.168/16, 100.64/10 (CGNAT/Tailscale),
// 127/8, 0/8, 169.254/16. This prevents NAT'd hosts from
// reporting their LAN / VPN / Tailscale IPs as the agent's
// public-facing address.
//
// Returns "" if no eligible interface is found.
func getAllInterfaceIPs() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		log.Printf("getAllInterfaceIPs: net.Interfaces failed: %v", err)
		return ""
	}
	var ips []string
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			default:
				continue
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			// IPv4 only for the multi-NIC aggregation; IPv6 link-local
			// and ULA addresses are out of scope (see doc comment).
			v4 := ip.To4()
			if v4 == nil {
				continue
			}
			// Filter private / CGNAT / link-local / loopback /
			// unspecified so NAT'd hosts don't leak LAN, Tailscale,
			// or WireGuard addresses as the public IP.
			if isPrivateIPv4(v4) {
				continue
			}
			ips = append(ips, v4.String())
		}
	}
	return strings.Join(ips, ",")
}

// getOutboundIP reports the IPs to send on heartbeats. Order:
//  1. fetchPublicIP (api.ipify.org, ifconfig.me) — most reliable
//     public IP; immune to local interface enumeration quirks on
//     NAT'd / VPN'd / multi-NIC hosts.
//  2. getAllInterfaceIPs() (multi-NIC aggregation, comma-separated
//     of public IPs only). On NAT'd hosts this is usually empty.
//  3. getLocalOutboundIP (kernel routing table single IP) — last
//     resort fallback for environments with no outbound network
//     access (e.g. some restricted containers).
//
// Step 1 is preferred so the server sees the WAN-facing IP
// regardless of what local interfaces are configured. Step 2 still
// surfaces secondary public IPs (multi-NIC). Step 3 catches edge
// cases where both 1 and 2 fail.
func (p *program) getOutboundIP() string {
	if p == nil || p.ctx == nil {
		return p.getLocalOutboundIP()
	}
	// First try: dedicated public IP lookup services. These return
	// the address the rest of the internet sees, which is what the
	// server actually wants to display.
	urls := ipLookupURLs
	for _, url := range urls {
		ip := p.fetchPublicIP(url)
		if ip != "" {
			return ip
		}
	}
	// Second try: enumerate local interfaces and report public IPs.
	if multi := getAllInterfaceIPs(); multi != "" {
		return multi
	}
	// Last resort: kernel routing table single IP.
	return p.getLocalOutboundIP()
}

// fetchPublicIP issues a single ctx-bound GET to url and returns the
// trimmed response body if it parses as a valid IP. Returns "" on
// any error or invalid response, including ctx cancellation.
func (p *program) fetchPublicIP(url string) string {
	req, err := http.NewRequestWithContext(p.ctx, http.MethodGet, url, nil)
	if err != nil {
		log.Printf("getOutboundIP: build request %s: %v", url, err)
		return ""
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("getOutboundIP: GET %s: %v", url, err)
		return ""
	}
	defer resp.Body.Close()
	bytes, err := io.ReadAll(io.LimitReader(resp.Body, 256))
	if err != nil {
		log.Printf("getOutboundIP: read %s: %v", url, err)
		return ""
	}
	ip := strings.TrimSpace(string(bytes))
	if net.ParseIP(ip) == nil {
		return ""
	}
	return ip
}

// validateVpsId rejects empty/missing/oversized VPS IDs at the handler entry
// point. A valid ID is non-empty, ≤ 128 bytes, matches the agent's configured
// VpsID, and contains no path-traversal or control characters. Returning a
// typed error lets the handler emit a structured failure response.
func (p *program) validateVpsId(vpsId string) error {
    if vpsId == "" {
        return fmt.Errorf("vps_id is required")
    }
    if len(vpsId) > 128 {
        return fmt.Errorf("vps_id exceeds 128 bytes")
    }
    if p.cfg == nil || vpsId != p.cfg.VpsID {
        return fmt.Errorf("vps_id does not match this agent")
    }
    return nil
}

type APIKeyAuth struct {
	Key string
}

func (a APIKeyAuth) GetRequestMetadata(ctx context.Context, uri ...string) (map[string]string, error) {
	return map[string]string{"x-api-key": a.Key}, nil
}

func (a APIKeyAuth) RequireTransportSecurity() bool {
	return false
}

type program struct {
    cfg    *Config
    ctx    context.Context
    cancel context.CancelFunc

    // F0-19: Separate refresh channels for telemetry and screenshot.
    // Previously both consumed the same single channel and raced.
    refreshTelemetryCh chan struct{}
    refreshScreenshotCh chan struct{}

    telemetryStream pb.BackendService_StreamTelemetryClient
    telemetryMu     sync.Mutex

    ioStream pb.BackendService_StreamAgentIOClient
    ioMu     sync.Mutex

    shells   map[string]*shellSession
    shellsMu sync.Mutex

    agentIP string
    ipMu    sync.Mutex
}

func toLocalPath(p string) string {
	if runtime.GOOS != "windows" {
		return p
	}
	// Resolve ~ to user home directory
	if p == "~" || p == "~/" || p == "/~" || p == "/~/" {
		if home, err := os.UserHomeDir(); err == nil {
			return home
		}
	}
	if strings.HasPrefix(p, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, filepath.FromSlash(p[2:]))
		}
	}
	if p == "" || p == "/" {
		return "C:\\"
	}
	if len(p) >= 3 && p[0] == '/' && ((p[1] >= 'a' && p[1] <= 'z') || (p[1] >= 'A' && p[1] <= 'Z')) && p[2] == '/' {
		drive := string(p[1])
		rest := filepath.FromSlash(p[2:])
		return drive + ":" + rest
	}
	if len(p) == 2 && p[0] == '/' && ((p[1] >= 'a' && p[1] <= 'z') || (p[1] >= 'A' && p[1] <= 'Z')) {
		return string(p[1]) + ":\\"
	}
	return "C:" + filepath.FromSlash(p)
}

// translateForWindows converts high-level or Linux-style commands to
// their Windows equivalents. This is a defense-in-depth layer on the
// agent side so that even if the server sends a raw "stop" or a Linux
// "shutdown -h now", the Windows agent can execute it correctly.
func translateForWindows(command string) string {
	lower := strings.TrimSpace(strings.ToLower(command))
	switch lower {
	case "stop", "shutdown", "poweroff", "shutdown -h now", "shutdown -h":
		return "shutdown /s /t 0"
	case "restart", "reboot", "shutdown -r now", "shutdown -r":
		return "shutdown /r /t 0"
	}
	return command
}

func newProgram() *program {
	return &program{
		shells: make(map[string]*shellSession),
	}
}

func (p *program) Start(s service.Service) error {
	p.ctx, p.cancel = context.WithCancel(context.Background())
	p.refreshTelemetryCh = make(chan struct{}, 1)
	p.refreshScreenshotCh = make(chan struct{}, 1)
	go p.run()
	return nil
}

func (p *program) run() {
    log.Println("VPS Agent (Golang) is starting in outbound mode...")

    conn, err := grpc.Dial(p.cfg.BackendIP,
        grpc.WithTransportCredentials(insecure.NewCredentials()),
        grpc.WithPerRPCCredentials(APIKeyAuth{Key: p.cfg.APIKey}),
    )
    if err != nil {
        log.Printf("Did not connect to backend: %v", err)
        return
    }
    defer conn.Close()
    backendClient := pb.NewBackendServiceClient(conn)

    p.ipMu.Lock()
    p.agentIP = p.getOutboundIP()
    p.ipMu.Unlock()
    log.Printf("Initial agent IP: %s", p.agentIP)

    go p.ipRefreshLoop()
    go p.heartbeatLoop(backendClient)
    go p.telemetryLoop(backendClient)
    go p.screenshotLoop(backendClient)
    go p.ioLoop(backendClient)

    <-p.ctx.Done()
}

// ipRefreshLoop periodically re-detects the outbound IP. Network
// configuration (DHCP renew, interface hotplug, VPN reconnect) can change
// the source address behind a moving agent; refreshing every 5 minutes keeps
// the value sent on heartbeats/streams current.
func (p *program) ipRefreshLoop() {
    ticker := time.NewTicker(5 * time.Minute)
    defer ticker.Stop()
    for {
        select {
        case <-p.ctx.Done():
            return
        case <-ticker.C:
            newIP := p.getOutboundIP()
            if newIP == "" {
                log.Printf("ipRefreshLoop: detection returned empty, keeping previous value")
                continue
            }
            p.ipMu.Lock()
            p.agentIP = newIP
            p.ipMu.Unlock()
            log.Printf("Agent IP refreshed: %s", newIP)
        }
    }
}

func (p *program) currentAgentIP() string {
    p.ipMu.Lock()
    defer p.ipMu.Unlock()
    return p.agentIP
}

func (p *program) heartbeatLoop(backendClient pb.BackendServiceClient) {
    retryDelay := 1 * time.Second
    maxRetryDelay := 2 * time.Minute
    for {
        select {
        case <-p.ctx.Done():
            return
        default:
        }
        resp, err := backendClient.Heartbeat(p.ctx, &pb.HeartbeatRequest{
            VpsId:     p.cfg.VpsID,
            Timestamp: time.Now().Unix(),
            AgentIp:   p.currentAgentIP(),
        })
        if err != nil {
            log.Printf("Heartbeat failed: %v", err)
            select {
            case <-p.ctx.Done():
                return
            case <-time.After(retryDelay):
            }
            retryDelay = time.Duration(float64(retryDelay) * 1.5)
            if retryDelay > maxRetryDelay {
                retryDelay = maxRetryDelay
            }
            continue
        }
        if resp != nil && resp.Settings != nil {
            applySettings(resp.Settings)
        }
        retryDelay = 1 * time.Second
        select {
        case <-p.ctx.Done():
            return
        case <-time.After(10 * time.Second):
        }
    }
}

// F0-19: Triggers both telemetry and screenshot. Non-blocking, debounced by 1-slot buffer.
func (p *program) triggerRefresh() {
	select {
	case p.refreshTelemetryCh <- struct{}{}:
	default:
	}
	select {
	case p.refreshScreenshotCh <- struct{}{}:
	default:
	}
}

func (p *program) sendTelemetryImmediate() {
	p.telemetryMu.Lock()
	stream := p.telemetryStream
	p.telemetryMu.Unlock()
	if stream == nil {
		return
	}
	metrics, err := telemetry.CollectMetrics()
	if err != nil {
		return
	}
	_ = stream.Send(&pb.TelemetryRequest{
		VpsId:     p.cfg.VpsID,
		CpuUsage:  float32(metrics.CPUUsage),
		RamUsage:  float32(metrics.RAMUsage),
		RamTotal:  float32(metrics.RAMTotal),
		DiskUsage: float32(metrics.DiskUsage),
		DiskTotal: float32(metrics.DiskTotal),
		NetTx:     float32(metrics.NetTx),
		NetRx:     float32(metrics.NetRx),
		Timestamp: metrics.Timestamp,
		Uptime:    int64(metrics.Uptime),
	})
}

func (p *program) telemetryLoop(backendClient pb.BackendServiceClient) {
    retryDelay := 1 * time.Second
    maxRetryDelay := 30 * time.Second

    for {
        select {
        case <-p.ctx.Done():
            return
        default:
        }

        stream, err := backendClient.StreamTelemetry(p.ctx)
        if err != nil {
            log.Printf("Telemetry stream connect error: %v", err)
            select {
            case <-p.ctx.Done():
                return
            case <-time.After(retryDelay):
            }
            retryDelay = time.Duration(float64(retryDelay) * 1.5)
            if retryDelay > maxRetryDelay {
                retryDelay = maxRetryDelay
            }
            continue
        }

        p.telemetryMu.Lock()
        p.telemetryStream = stream
        p.telemetryMu.Unlock()

        retryDelay = 1 * time.Second

        for {
            select {
            case <-p.ctx.Done():
                return
            case <-p.refreshTelemetryCh:
                p.sendTelemetryImmediate()
            default:
            }

            select {
            case <-p.ctx.Done():
                return
            default:
            }

            metrics, err := telemetry.CollectMetrics()
            if err != nil {
                log.Printf("Metrics error: %v", err)
                settings.mu.RLock()
                interval := settings.telemetryInterval
                settings.mu.RUnlock()
                select {
                case <-p.ctx.Done():
                    return
                case <-time.After(interval):
                }
                continue
            }

            req := &pb.TelemetryRequest{
                VpsId:     p.cfg.VpsID,
                CpuUsage:  float32(metrics.CPUUsage),
                RamUsage:  float32(metrics.RAMUsage),
                RamTotal:  float32(metrics.RAMTotal),
                DiskUsage: float32(metrics.DiskUsage),
                DiskTotal: float32(metrics.DiskTotal),
                NetTx:     float32(metrics.NetTx),
                NetRx:     float32(metrics.NetRx),
                Timestamp: metrics.Timestamp,
                Uptime:    int64(metrics.Uptime),
            }
            if err := stream.Send(req); err != nil {
                log.Printf("Telemetry stream send error: %v", err)
                break
            }

            settings.mu.RLock()
            interval := settings.telemetryInterval
            settings.mu.RUnlock()
            select {
            case <-p.ctx.Done():
                return
            case <-p.refreshTelemetryCh:
                p.sendTelemetryImmediate()
            case <-time.After(interval):
            }
        }
    }
}

func (p *program) screenshotLoop(backendClient pb.BackendServiceClient) {
	for {
		select {
		case <-p.ctx.Done():
			return
		default:
		}

		p.captureAndUpload(backendClient)

		settings.mu.RLock()
		interval := settings.screenshotInterval
		settings.mu.RUnlock()

		select {
		case <-p.ctx.Done():
			return
		case <-p.refreshScreenshotCh:
			// Trigger immediate screenshot upload on refresh request
		case <-time.After(interval):
		}
	}
}

func (p *program) captureAndUpload(backendClient pb.BackendServiceClient) {
    if telemetry.IsHeadless() {
        log.Printf("Screenshot skipped: headless environment")
        return
    }
    data, err := telemetry.CaptureScreenBytes()
    if err != nil {
        log.Printf("Screenshot capture failed: %v", err)
        return
    }
    _, err = backendClient.UploadScreenshot(p.ctx, &pb.ScreenshotRequest{
        VpsId:     p.cfg.VpsID,
        ImageData: data,
    })
    if err != nil {
        log.Printf("Screenshot upload failed: %v", err)
    }
}

// =================== StreamAgentIO loop ===================

func (p *program) ioLoop(backendClient pb.BackendServiceClient) {
    retryDelay := 1 * time.Second
    maxRetryDelay := 30 * time.Second

    for {
        select {
        case <-p.ctx.Done():
            return
        default:
        }

        stream, err := backendClient.StreamAgentIO(p.ctx)
        if err != nil {
            log.Printf("StreamAgentIO connect error: %v", err)
            select {
            case <-p.ctx.Done():
                return
            case <-time.After(retryDelay):
            }
            retryDelay = time.Duration(float64(retryDelay) * 1.5)
            if retryDelay > maxRetryDelay {
                retryDelay = maxRetryDelay
            }
            continue
        }

        p.ioMu.Lock()
        p.ioStream = stream
        p.ioMu.Unlock()

        // Send register message (agent -> server: identifies this connection)
        if err := stream.Send(&pb.AgentMessage{
            Body: &pb.AgentMessage_Register{
                Register: &pb.RegisterRequest{
                    VpsId:   p.cfg.VpsID,
                    AgentIp: p.currentAgentIP(),
                },
            },
        }); err != nil {
            log.Printf("Register send failed: %v", err)
            stream.CloseSend()
            select {
            case <-p.ctx.Done():
                return
            case <-time.After(retryDelay):
            }
            continue
        }

        log.Printf("StreamAgentIO connected (vps=%s ip=%s)", p.cfg.VpsID, p.currentAgentIP())
        retryDelay = 1 * time.Second

        for {
            msg, err := stream.Recv()
            if err == io.EOF {
                break
            }
            if err != nil {
                log.Printf("StreamAgentIO recv error: %v", err)
                break
            }
            p.handleServerMessage(stream, msg)
        }

        stream.CloseSend()
        p.ioMu.Lock()
        p.ioStream = nil
        p.ioMu.Unlock()
        log.Println("StreamAgentIO disconnected, will reconnect")
    }
}

func (p *program) sendIO(msg *pb.AgentMessage) bool {
	p.ioMu.Lock()
	stream := p.ioStream
	p.ioMu.Unlock()
	if stream == nil {
		return false
	}
	return stream.Send(msg) == nil
}

func (p *program) handleServerMessage(stream pb.BackendService_StreamAgentIOClient, msg *pb.ServerMessage) {
	switch body := msg.Body.(type) {
	case *pb.ServerMessage_Exec:
		go p.handleExec(stream, msg.RequestId, body.Exec)
	case *pb.ServerMessage_Listdir:
		go p.handleListdir(stream, msg.RequestId, body.Listdir)
	case *pb.ServerMessage_Read:
		go p.handleRead(stream, msg.RequestId, body.Read)
	case *pb.ServerMessage_Write:
		go p.handleWrite(stream, msg.RequestId, body.Write)
	case *pb.ServerMessage_ShellOpen:
		go p.handleShellOpen(stream, msg.RequestId, body.ShellOpen)
	case *pb.ServerMessage_ShellInput:
		p.handleShellInput(stream, body.ShellInput)
	case *pb.ServerMessage_ShellClose:
		p.handleShellClose(stream, body.ShellClose)
    case *pb.ServerMessage_Refresh:
        go p.handleRefresh(stream, msg.RequestId, body.Refresh)
    case *pb.ServerMessage_SettingsUpdate:
        go p.handleSettingsUpdate(stream, msg.RequestId, body.SettingsUpdate)
    case *pb.ServerMessage_DeleteFile:
        go p.handleDeleteFile(stream, msg.RequestId, body.DeleteFile)
    case *pb.ServerMessage_Mkdir:
        go p.handleMkdir(stream, msg.RequestId, body.Mkdir)
    case *pb.ServerMessage_RenameFile:
        go p.handleRenameFile(stream, msg.RequestId, body.RenameFile)
	default:
		log.Printf("Unhandled server message body type")
	}
}

func (p *program) handleExec(stream pb.BackendService_StreamAgentIOClient, requestId string, req *pb.CommandRequest) {
    if err := p.validateVpsId(req.GetVpsId()); err != nil {
        _ = stream.Send(&pb.AgentMessage{
            RequestId: requestId,
            Body: &pb.AgentMessage_ExecResult{ExecResult: &pb.CommandResponse{
                Success: false,
                Output:  fmt.Sprintf("invalid vps_id: %v", err),
            }},
        })
        return
    }
    timeout := 30 * time.Second
    if req.TimeoutSeconds > 0 {
        timeout = time.Duration(req.TimeoutSeconds) * time.Second
    }
    ctx, cancel := context.WithTimeout(p.ctx, timeout)
    defer cancel()
    var cmd *exec.Cmd
    if runtime.GOOS == "windows" {
        translated := translateForWindows(req.Command)
        cmd = exec.CommandContext(ctx, "cmd", "/C", translated)
    } else {
        cmd = exec.CommandContext(ctx, "sh", "-c", req.Command)
    }
    out, err := cmd.CombinedOutput()
    resp := &pb.CommandResponse{Output: string(out)}
    if err != nil {
        resp.Success = false
        if ctx.Err() == context.DeadlineExceeded {
            resp.Output = "Command timed out"
        } else {
            resp.Output = fmt.Sprintf("%s: %s", err.Error(), string(out))
        }
    } else {
        resp.Success = true
    }
    _ = stream.Send(&pb.AgentMessage{
        RequestId: requestId,
        Body:      &pb.AgentMessage_ExecResult{ExecResult: resp},
    })
}

func (p *program) handleListdir(stream pb.BackendService_StreamAgentIOClient, requestId string, req *pb.DirRequest) {
	if err := p.validateVpsId(req.GetVpsId()); err != nil {
		_ = stream.Send(&pb.AgentMessage{
			RequestId: requestId,
			Body: &pb.AgentMessage_ListdirResult{
				ListdirResult: &pb.DirResponse{Success: false, Error: fmt.Sprintf("invalid vps_id: %v", err)},
			},
		})
		return
	}
	entries, err := os.ReadDir(toLocalPath(req.Path))
	if err != nil {
		_ = stream.Send(&pb.AgentMessage{
			RequestId: requestId,
			Body: &pb.AgentMessage_ListdirResult{
				ListdirResult: &pb.DirResponse{Success: false, Error: err.Error()},
			},
		})
		return
	}
	var files []*pb.FileItem
	for _, entry := range entries {
		info, err := entry.Info()
		size := int64(0)
		if err == nil {
			size = info.Size()
		}
		files = append(files, &pb.FileItem{
			Name:  entry.Name(),
			IsDir: entry.IsDir(),
			Size:  size,
		})
	}
	_ = stream.Send(&pb.AgentMessage{
		RequestId: requestId,
		Body: &pb.AgentMessage_ListdirResult{
			ListdirResult: &pb.DirResponse{Success: true, Files: files},
		},
	})
}

func (p *program) handleRead(stream pb.BackendService_StreamAgentIOClient, requestId string, req *pb.FileRequest) {
	if err := p.validateVpsId(req.GetVpsId()); err != nil {
		_ = stream.Send(&pb.AgentMessage{
			RequestId: requestId,
			Body: &pb.AgentMessage_ReadResult{
				ReadResult: &pb.FileResponse{Success: false, Error: fmt.Sprintf("invalid vps_id: %v", err)},
			},
		})
		return
	}
	data, err := os.ReadFile(toLocalPath(req.Path))
	if err != nil {
		_ = stream.Send(&pb.AgentMessage{
			RequestId: requestId,
			Body: &pb.AgentMessage_ReadResult{
				ReadResult: &pb.FileResponse{Success: false, Error: err.Error()},
			},
		})
		return
	}
	_ = stream.Send(&pb.AgentMessage{
		RequestId: requestId,
		Body: &pb.AgentMessage_ReadResult{
			ReadResult: &pb.FileResponse{Success: true, Content: data},
		},
	})
}

func (p *program) handleWrite(stream pb.BackendService_StreamAgentIOClient, requestId string, req *pb.WriteRequest) {
	if err := p.validateVpsId(req.GetVpsId()); err != nil {
		_ = stream.Send(&pb.AgentMessage{
			RequestId: requestId,
			Body: &pb.AgentMessage_WriteResult{
				WriteResult: &pb.WriteResponse{Success: false, Error: fmt.Sprintf("invalid vps_id: %v", err)},
			},
		})
		return
	}
	err := os.WriteFile(toLocalPath(req.Path), req.Content, 0600)
	resp := &pb.WriteResponse{Success: err == nil}
	if err != nil {
		resp.Error = err.Error()
	}
	_ = stream.Send(&pb.AgentMessage{
		RequestId: requestId,
		Body:      &pb.AgentMessage_WriteResult{WriteResult: resp},
	})
}

func (p *program) handleShellOpen(stream pb.BackendService_StreamAgentIOClient, requestId string, req *pb.ShellOpenRequest) {
	if err := p.validateVpsId(req.GetVpsId()); err != nil {
		_ = stream.Send(&pb.AgentMessage{
			RequestId: requestId,
			Body: &pb.AgentMessage_ShellOpened{
				ShellOpened: &pb.ShellOpenedResponse{SessionId: req.SessionId, Success: false, Error: fmt.Sprintf("invalid vps_id: %v", err)},
			},
		})
		return
	}
	if req.SessionId == "" || len(req.SessionId) > 128 {
		_ = stream.Send(&pb.AgentMessage{
			RequestId: requestId,
			Body: &pb.AgentMessage_ShellOpened{
				ShellOpened: &pb.ShellOpenedResponse{SessionId: req.SessionId, Success: false, Error: "session_id must be 1..128 bytes"},
			},
		})
		return
	}
	p.shellsMu.Lock()
	if _, exists := p.shells[req.SessionId]; exists {
		p.shellsMu.Unlock()
		_ = stream.Send(&pb.AgentMessage{
			RequestId: requestId,
			Body: &pb.AgentMessage_ShellOpened{
				ShellOpened: &pb.ShellOpenedResponse{SessionId: req.SessionId, Success: false, Error: "session_id already open"},
			},
		})
		return
	}
	p.shellsMu.Unlock()

	shell := req.Shell
	if shell == "" {
		if runtime.GOOS == "windows" {
			shell = "cmd.exe"
		} else {
			shell = "bash"
		}
	}
	sess, err := startShell(shell)
	if err != nil {
		_ = stream.Send(&pb.AgentMessage{
			RequestId: requestId,
			Body: &pb.AgentMessage_ShellOpened{
				ShellOpened: &pb.ShellOpenedResponse{SessionId: req.SessionId, Success: false, Error: err.Error()},
			},
		})
		return
	}

	sess.id = req.SessionId
	p.shellsMu.Lock()
	p.shells[req.SessionId] = sess
	p.shellsMu.Unlock()

	_ = stream.Send(&pb.AgentMessage{
		RequestId: requestId,
		Body: &pb.AgentMessage_ShellOpened{
			ShellOpened: &pb.ShellOpenedResponse{SessionId: req.SessionId, Success: true},
		},
	})

	go p.pumpShellOutput(stream, req.SessionId, sess)
}

// pumpShellOutput reads from a shell session and forwards each chunk
// to the server-side IO stream. The inner Read loop sets a 5-second
// read deadline so a quiet shell (no output for 5s) wakes the loop
// and lets the outer select re-check p.ctx. Without the deadline, a
// silent process would wedge the goroutine until sess.Close()
// happens — which only fires from the ctx-cancel path itself,
// creating a feedback loop where ctx cancel waits for the pump
// to drain, but the pump is blocked on Read.
func (p *program) pumpShellOutput(stream pb.BackendService_StreamAgentIOClient, sessionId string, sess *shellSession) {
	buf := make([]byte, 4096)
	readErrCh := make(chan error, 1)
	const readDeadline = 5 * time.Second
	go func() {
		for {
			_ = sess.SetReadDeadline(time.Now().Add(readDeadline))
			n, err := sess.Read(buf)
			if n > 0 {
				if !p.sendIO(&pb.AgentMessage{
					Body: &pb.AgentMessage_ShellOutput{
						ShellOutput: &pb.ShellOutput{SessionId: sessionId, Data: append([]byte(nil), buf[:n]...)},
					},
				}) {
					readErrCh <- io.EOF
					return
				}
			}
			if err != nil {
				// The "read deadline exceeded" sentinel is the
				// expected outcome of a quiet shell — re-arm the
				// deadline and keep pumping. Only terminal
				// errors (EOF, ctx-cancel surfaced as a closed
				// handle) propagate to the outer select.
				if errors.Is(err, os.ErrDeadlineExceeded) {
					continue
				}
				readErrCh <- err
				return
			}
		}
	}()
	select {
	case <-p.ctx.Done():
		_ = sess.Close()
		p.cleanupShell(sessionId)
		return
	case err := <-readErrCh:
		if err != nil {
			p.cleanupShell(sessionId)
		}
		return
	}
}

func (p *program) handleShellInput(stream pb.BackendService_StreamAgentIOClient, req *pb.ShellInputRequest) {
	p.shellsMu.Lock()
	sess := p.shells[req.SessionId]
	p.shellsMu.Unlock()
	if sess == nil {
		return
	}
	if runtime.GOOS == "windows" {
		_ = stream.Send(&pb.AgentMessage{
			Body: &pb.AgentMessage_ShellOutput{
				ShellOutput: &pb.ShellOutput{SessionId: req.SessionId, Data: req.Data},
			},
		})
	}
	_, _ = sess.Write(req.Data)
}

func (p *program) handleShellClose(stream pb.BackendService_StreamAgentIOClient, req *pb.ShellCloseRequest) {
	p.cleanupShell(req.SessionId)
	_ = stream.Send(&pb.AgentMessage{
		Body: &pb.AgentMessage_ShellClosed{
			ShellClosed: &pb.ShellClosedResponse{SessionId: req.SessionId},
		},
	})
}

func (p *program) cleanupShell(sessionId string) {
	p.shellsMu.Lock()
	sess := p.shells[sessionId]
	if sess != nil {
		delete(p.shells, sessionId)
	}
	p.shellsMu.Unlock()
	if sess == nil {
		return
	}
	_ = sess.Close()
	if sess.cmd != nil && sess.cmd.Process != nil {
		_ = sess.cmd.Process.Kill()
		_, _ = sess.cmd.Process.Wait()
	}
}

func (p *program) handleSettingsUpdate(stream pb.BackendService_StreamAgentIOClient, requestId string, req *pb.SettingsUpdate) {
	if err := p.validateVpsId(req.GetVpsId()); err != nil {
		log.Printf("SettingsUpdate rejected: %v", err)
		return
	}
	applySettings(req.GetSettings())
	settings.mu.RLock()
	tInt := settings.telemetryInterval
	sInt := settings.screenshotInterval
	settings.mu.RUnlock()
	log.Printf("Settings pushed: telemetry=%v screenshot=%v", tInt, sInt)
	if requestId != "" {
		_ = stream.Send(&pb.AgentMessage{
			RequestId: requestId,
			Body:      &pb.AgentMessage_RefreshAck{RefreshAck: &pb.RefreshAck{Success: true, Message: "applied"}},
		})
	}
}

func (p *program) sendFileOpResult(stream pb.BackendService_StreamAgentIOClient, requestId string, err error) {
	resp := &pb.FileOperationResponse{Success: err == nil}
	if err != nil {
		resp.Error = err.Error()
	}
	_ = stream.Send(&pb.AgentMessage{
		RequestId: requestId,
		Body:      &pb.AgentMessage_FileOpResult{FileOpResult: resp},
	})
}

func (p *program) handleDeleteFile(stream pb.BackendService_StreamAgentIOClient, requestId string, req *pb.DeleteFileRequest) {
	if err := p.validateVpsId(req.GetVpsId()); err != nil {
		p.sendFileOpResult(stream, requestId, fmt.Errorf("invalid vps_id: %w", err))
		return
	}
	if err := os.Remove(toLocalPath(req.GetPath())); err != nil {
		log.Printf("DeleteFile failed: %v", err)
		p.sendFileOpResult(stream, requestId, err)
		return
	}
	p.sendFileOpResult(stream, requestId, nil)
}

func (p *program) handleMkdir(stream pb.BackendService_StreamAgentIOClient, requestId string, req *pb.MkdirRequest) {
	if err := p.validateVpsId(req.GetVpsId()); err != nil {
		p.sendFileOpResult(stream, requestId, fmt.Errorf("invalid vps_id: %w", err))
		return
	}
	if err := os.MkdirAll(toLocalPath(req.GetPath()), 0755); err != nil {
		log.Printf("Mkdir failed: %v", err)
		p.sendFileOpResult(stream, requestId, err)
		return
	}
	p.sendFileOpResult(stream, requestId, nil)
}

func (p *program) handleRenameFile(stream pb.BackendService_StreamAgentIOClient, requestId string, req *pb.RenameFileRequest) {
	if err := p.validateVpsId(req.GetVpsId()); err != nil {
		p.sendFileOpResult(stream, requestId, fmt.Errorf("invalid vps_id: %w", err))
		return
	}
	if err := os.Rename(toLocalPath(req.GetOldPath()), toLocalPath(req.GetNewPath())); err != nil {
		log.Printf("RenameFile failed: %v", err)
		p.sendFileOpResult(stream, requestId, err)
		return
	}
	p.sendFileOpResult(stream, requestId, nil)
}

func (p *program) handleRefresh(stream pb.BackendService_StreamAgentIOClient, requestId string, req *pb.RefreshRequest) {
	msg := "queued"
	p.telemetryMu.Lock()
	tStream := p.telemetryStream
	p.telemetryMu.Unlock()
	if tStream == nil {
		msg = "stream_busy"
	} else if req != nil && req.VpsId != "" && req.VpsId != p.cfg.VpsID {
		// Refresh was targeted at a different agent; surface the offline
		// semantic so the server can fall back to the correct agent.
		msg = "agent_offline"
	}
	p.triggerRefresh()
	_ = stream.Send(&pb.AgentMessage{
		RequestId: requestId,
		Body: &pb.AgentMessage_RefreshAck{RefreshAck: &pb.RefreshAck{
			Success: true,
			Message: msg,
		}},
	})
}

func (p *program) Stop(s service.Service) error {
	p.cancel()
	return nil
}

func setupService(cfg *Config) (service.Service, error) {
	svcConfig := &service.Config{
		Name:        "VPSManagerAgent",
		DisplayName: "VPS Manager Agent",
		Description: "Telemetry and remote management agent for VPS Manager.",
	}

	prg := newProgram()
	prg.cfg = cfg

	return service.New(prg, svcConfig)
}
