package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"time"

	pb "agent/pb"
	"agent/telemetry"

	"github.com/creack/pty"
	"github.com/kardianos/service"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type agentSettings struct {
	mu                 sync.RWMutex
	screenshotInterval time.Duration
	telemetryInterval  time.Duration
	ramDiskVisible     bool
	networkVisible     bool
}

var settings = &agentSettings{
	screenshotInterval: 30 * time.Second,
	telemetryInterval:  1 * time.Second,
	ramDiskVisible:     true,
	networkVisible:     true,
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
	settings.ramDiskVisible = s.RamDiskVisible
	settings.networkVisible = s.NetworkVisible
	log.Printf("Settings applied: telemetry=%v screenshot=%v", settings.telemetryInterval, settings.screenshotInterval)
}

func getOutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		log.Printf("getOutboundIP failed: %v", err)
		return ""
	}
	defer conn.Close()
	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
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
}

type shellSession struct {
	id   string
	ptmx *os.File
	cmd  *exec.Cmd
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

	go p.heartbeatLoop(backendClient)
	go p.telemetryLoop(backendClient)
	go p.screenshotLoop(backendClient)
	go p.ioLoop(backendClient)

	<-p.ctx.Done()
}

func (p *program) heartbeatLoop(backendClient pb.BackendServiceClient) {
	retryDelay := 1 * time.Second
	maxRetryDelay := 2 * time.Minute
	agentIP := getOutboundIP()
	for {
		select {
		case <-p.ctx.Done():
			return
		default:
		}
		resp, err := backendClient.Heartbeat(p.ctx, &pb.HeartbeatRequest{
			VpsId:     p.cfg.VpsID,
			Timestamp: time.Now().Unix(),
			AgentIp:   agentIP,
		})
		if err != nil {
			log.Printf("Heartbeat failed: %v", err)
			time.Sleep(retryDelay)
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
			time.Sleep(retryDelay)
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
				time.Sleep(interval)
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
			}
			if err := stream.Send(req); err != nil {
				log.Printf("Telemetry stream send error: %v", err)
				break
			}

			settings.mu.RLock()
			interval := settings.telemetryInterval
			settings.mu.RUnlock()
			time.Sleep(interval)
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

		select {
		case <-p.refreshScreenshotCh:
			p.captureAndUpload(backendClient)
		default:
		}

		settings.mu.RLock()
		interval := settings.screenshotInterval
		settings.mu.RUnlock()

		select {
		case <-p.ctx.Done():
			return
		case <-time.After(interval):
		}

		p.captureAndUpload(backendClient)
	}
}

func (p *program) captureAndUpload(backendClient pb.BackendServiceClient) {
	if telemetry.IsHeadless() {
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
	agentIP := getOutboundIP()

	for {
		select {
		case <-p.ctx.Done():
			return
		default:
		}

		stream, err := backendClient.StreamAgentIO(p.ctx)
		if err != nil {
			log.Printf("StreamAgentIO connect error: %v", err)
			time.Sleep(retryDelay)
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
					AgentIp: agentIP,
				},
			},
		}); err != nil {
			log.Printf("Register send failed: %v", err)
			stream.CloseSend()
			time.Sleep(retryDelay)
			continue
		}

		log.Printf("StreamAgentIO connected (vps=%s ip=%s)", p.cfg.VpsID, agentIP)
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
		p.handleShellInput(body.ShellInput)
	case *pb.ServerMessage_ShellClose:
		p.handleShellClose(stream, body.ShellClose)
	case *pb.ServerMessage_Refresh:
		go p.handleRefresh(stream, msg.RequestId)
	default:
		log.Printf("Unhandled server message body type")
	}
}

func (p *program) handleExec(stream pb.BackendService_StreamAgentIOClient, requestId string, req *pb.CommandRequest) {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", req.Command)
	} else {
		cmd = exec.Command("sh", "-c", req.Command)
	}
	timeout := 30 * time.Second
	if req.TimeoutSeconds > 0 {
		timeout = time.Duration(req.TimeoutSeconds) * time.Second
	}
	ctx, cancel := context.WithTimeout(p.ctx, timeout)
	defer cancel()
	cmd = exec.CommandContext(ctx, cmd.Args[0], cmd.Args[1:]...)
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
	entries, err := os.ReadDir(req.Path)
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
	data, err := os.ReadFile(req.Path)
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
	err := os.WriteFile(req.Path, req.Content, 0644)
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
	shell := req.Shell
	if shell == "" {
		if runtime.GOOS == "windows" {
			shell = "cmd.exe"
		} else {
			shell = "bash"
		}
	}
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command(shell)
	} else {
		cmd = exec.Command(shell)
	}
	ptmx, err := pty.Start(cmd)
	if err != nil {
		_ = stream.Send(&pb.AgentMessage{
			RequestId: requestId,
			Body: &pb.AgentMessage_ShellOpened{
				ShellOpened: &pb.ShellOpenedResponse{SessionId: req.SessionId, Success: false, Error: err.Error()},
			},
		})
		return
	}

	p.shellsMu.Lock()
	p.shells[req.SessionId] = &shellSession{id: req.SessionId, ptmx: ptmx, cmd: cmd}
	p.shellsMu.Unlock()

	_ = stream.Send(&pb.AgentMessage{
		RequestId: requestId,
		Body: &pb.AgentMessage_ShellOpened{
			ShellOpened: &pb.ShellOpenedResponse{SessionId: req.SessionId, Success: true},
		},
	})

	go p.pumpShellOutput(stream, req.SessionId, ptmx)
}

func (p *program) pumpShellOutput(stream pb.BackendService_StreamAgentIOClient, sessionId string, ptmx *os.File) {
	buf := make([]byte, 4096)
	for {
		n, err := ptmx.Read(buf)
		if n > 0 {
			if !p.sendIO(&pb.AgentMessage{
				Body: &pb.AgentMessage_ShellOutput{
					ShellOutput: &pb.ShellOutput{SessionId: sessionId, Data: append([]byte(nil), buf[:n]...)},
				},
			}) {
				return
			}
		}
		if err != nil {
			p.cleanupShell(sessionId)
			return
		}
	}
}

func (p *program) handleShellInput(req *pb.ShellInputRequest) {
	p.shellsMu.Lock()
	sess := p.shells[req.SessionId]
	p.shellsMu.Unlock()
	if sess == nil {
		return
	}
	_, _ = sess.ptmx.Write(req.Data)
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
	_ = sess.ptmx.Close()
	if sess.cmd != nil && sess.cmd.Process != nil {
		_ = sess.cmd.Process.Kill()
		_, _ = sess.cmd.Process.Wait()
	}
}

func (p *program) handleRefresh(stream pb.BackendService_StreamAgentIOClient, requestId string) {
	p.triggerRefresh()
	_ = stream.Send(&pb.AgentMessage{
		RequestId: requestId,
		Body:      &pb.AgentMessage_RefreshAck{RefreshAck: &pb.RefreshAck{Success: true}},
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
