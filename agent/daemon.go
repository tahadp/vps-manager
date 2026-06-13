package main

import (
	"context"
	"fmt"
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

type AgentServer struct {
	pb.UnimplementedAgentServiceServer
	vpsID     string
	refreshCh chan struct{}
}

func (s *AgentServer) triggerRefresh() {
	select {
	case s.refreshCh <- struct{}{}:
	default:
	}
}

type agentSettings struct {
	mu                   sync.RWMutex
	screenshotInterval   time.Duration
	telemetryInterval    time.Duration
	ramDiskVisible       bool
	networkVisible       bool
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

func (s *AgentServer) ExecuteCommand(ctx context.Context, req *pb.CommandRequest) (*pb.CommandResponse, error) {
	// Special command: server asked agent to immediately push one telemetry frame + screenshot.
	if req.Command == "__refresh__" {
		s.triggerRefresh()
		return &pb.CommandResponse{Success: true, Output: "Refresh triggered"}, nil
	}

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

	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd = exec.CommandContext(ctx, cmd.Args[0], cmd.Args[1:]...)

	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return &pb.CommandResponse{Success: false, Output: "Command timed out"}, nil
	}
	if err != nil {
		return &pb.CommandResponse{Success: false, Output: fmt.Sprintf("%s: %s", err.Error(), string(out))}, nil
	}
	return &pb.CommandResponse{Success: true, Output: string(out)}, nil
}

func (s *AgentServer) ListDirectory(ctx context.Context, req *pb.DirRequest) (*pb.DirResponse, error) {
	entries, err := os.ReadDir(req.Path)
	if err != nil {
		return &pb.DirResponse{Success: false, Error: err.Error()}, nil
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
	return &pb.DirResponse{Success: true, Files: files}, nil
}

func (s *AgentServer) ReadFile(ctx context.Context, req *pb.FileRequest) (*pb.FileResponse, error) {
	data, err := os.ReadFile(req.Path)
	if err != nil {
		return &pb.FileResponse{Success: false, Error: err.Error()}, nil
	}
	return &pb.FileResponse{Success: true, Content: data}, nil
}

func (s *AgentServer) WriteFile(ctx context.Context, req *pb.WriteRequest) (*pb.WriteResponse, error) {
	err := os.WriteFile(req.Path, req.Content, 0644)
	if err != nil {
		return &pb.WriteResponse{Success: false, Error: err.Error()}, nil
	}
	return &pb.WriteResponse{Success: true}, nil
}

func (s *AgentServer) ShellStream(stream pb.AgentService_ShellStreamServer) error {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd.exe")
	} else {
		cmd = exec.Command("bash")
	}

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return err
	}
	defer ptmx.Close()

	go func() {
		for {
			msg, err := stream.Recv()
			if err != nil {
				ptmx.Close()
				break
			}
			ptmx.Write(msg.Data)
		}
	}()

	buf := make([]byte, 1024)
	for {
		n, err := ptmx.Read(buf)
		if n > 0 {
			stream.Send(&pb.ShellMessage{
				VpsId: s.vpsID,
				Data:  buf[:n],
			})
		}
		if err != nil {
			break
		}
	}

	cmd.Wait()
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
	cfg       *Config
	ctx       context.Context
	cancel    context.CancelFunc
	refreshCh chan struct{}
}

func (p *program) Start(s service.Service) error {
	p.ctx, p.cancel = context.WithCancel(context.Background())
	p.refreshCh = make(chan struct{}, 1)
	go p.run()
	return nil
}

func (p *program) run() {
	log.Println("VPS Agent (Golang) is starting in daemon mode...")

	go func() {
		lis, err := net.Listen("tcp", ":50052")
		if err != nil {
			log.Printf("failed to listen: %v", err)
			return
		}
		grpcServer := grpc.NewServer()
		pb.RegisterAgentServiceServer(grpcServer, &AgentServer{vpsID: p.cfg.VpsID, refreshCh: p.refreshCh})
		log.Printf("Agent gRPC server listening at %v", lis.Addr())

		go func() {
			<-p.ctx.Done()
			grpcServer.Stop()
		}()

		if err := grpcServer.Serve(lis); err != nil {
			log.Printf("failed to serve: %v", err)
		}
	}()

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

	// Heartbeat Loop
	go func() {
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
	}()

	// Telemetry Loop
	go func() {
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

			retryDelay = 1 * time.Second

			for {
				select {
				case <-p.ctx.Done():
					return
				case <-p.refreshCh:
					// Drain: send one immediate telemetry frame
					if metrics, err := telemetry.CollectMetrics(); err == nil {
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
							log.Printf("Refresh telemetry send error: %v", err)
						}
					}
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
	}()

	// Screenshot Loop
	for {
		select {
		case <-p.ctx.Done():
			return
		default:
		}

		// Refresh: take and upload one screenshot immediately (skip headless check)
		select {
		case <-p.refreshCh:
			if !telemetry.IsHeadless() {
				if data, err := telemetry.CaptureScreenBytes(); err == nil {
					if _, err := backendClient.UploadScreenshot(p.ctx, &pb.ScreenshotRequest{
						VpsId:     p.cfg.VpsID,
						ImageData: data,
					}); err != nil {
						log.Printf("Refresh screenshot upload failed: %v", err)
					}
				} else {
					log.Printf("Refresh screenshot capture failed: %v", err)
				}
			}
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

		if telemetry.IsHeadless() {
			log.Println("Headless environment detected, skipping screenshot")
			continue
		}

		data, err := telemetry.CaptureScreenBytes()
		if err != nil {
			log.Printf("Screenshot capture failed: %v", err)
			continue
		}
		_, err = backendClient.UploadScreenshot(p.ctx, &pb.ScreenshotRequest{
			VpsId:     p.cfg.VpsID,
			ImageData: data,
		})
		if err != nil {
			log.Printf("Screenshot upload failed: %v", err)
		}
	}
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

	prg := &program{
		cfg: cfg,
	}

	return service.New(prg, svcConfig)
}
