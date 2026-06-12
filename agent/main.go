package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"runtime"
	"time"

	pb "agent/pb"
	"agent/telemetry"

	"github.com/creack/pty"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var (
	vpsID     = flag.String("vps-id", os.Getenv("VPS_ID"), "VPS ID")
	backendIP = flag.String("backend-ip", os.Getenv("BACKEND_IP"), "Backend IP Address")
	apiKey    = flag.String("api-key", os.Getenv("API_KEY"), "API Key for gRPC Auth")
)

// APIKeyAuth implements credentials.PerRPCCredentials
type APIKeyAuth struct {
	Key string
}

func (a APIKeyAuth) GetRequestMetadata(ctx context.Context, uri ...string) (map[string]string, error) {
	return map[string]string{"api_key": a.Key}, nil
}

func (a APIKeyAuth) RequireTransportSecurity() bool {
	return false
}

// AgentServer implements pb.AgentServiceServer
type AgentServer struct {
	pb.UnimplementedAgentServiceServer
}

func (s *AgentServer) ExecuteCommand(ctx context.Context, req *pb.CommandRequest) (*pb.CommandResponse, error) {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", req.Command)
	} else {
		cmd = exec.Command("sh", "-c", req.Command)
	}

	out, err := cmd.CombinedOutput()
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

	// Read from stream -> Write to pty
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

	// Read from pty -> Write to stream
	buf := make([]byte, 1024)
	for {
		n, err := ptmx.Read(buf)
		if n > 0 {
			stream.Send(&pb.ShellMessage{
				VpsId: *vpsID,
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

func takeScreenshot() []byte {
	data, err := telemetry.CaptureScreenBytes()
	if err != nil {
		log.Printf("Screenshot capture failed: %v", err)
		return []byte("fake_screenshot_data")
	}
	return data
}

func main() {
	flag.Parse()

	if *vpsID == "" {
		*vpsID = "x0o0ckog4cco4gco0sk8wk8w" // Default fallback
	}
	if *backendIP == "" {
		*backendIP = "127.0.0.1:50051"
	}

	log.Println("VPS Agent (Golang) is starting...")

	// 1. Start gRPC Server for Backend -> Agent communication (Commands, Files, Shell)
	go func() {
		lis, err := net.Listen("tcp", ":50052")
		if err != nil {
			log.Fatalf("failed to listen: %v", err)
		}
		grpcServer := grpc.NewServer()
		pb.RegisterAgentServiceServer(grpcServer, &AgentServer{})
		log.Printf("Agent gRPC server listening at %v", lis.Addr())
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("failed to serve: %v", err)
		}
	}()

	// 2. Connect to Backend for Telemetry & Screenshots
	conn, err := grpc.Dial(*backendIP, 
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithPerRPCCredentials(APIKeyAuth{Key: *apiKey}),
	)
	if err != nil {
		log.Fatalf("Did not connect to backend: %v", err)
	}
	defer conn.Close()
	backendClient := pb.NewBackendServiceClient(conn)

	// Telemetry Loop
	go func() {
		for {
			stream, err := backendClient.StreamTelemetry(context.Background())
			if err != nil {
				log.Printf("Telemetry stream connect error: %v", err)
				time.Sleep(5 * time.Second)
				continue
			}

			for {
				metrics, err := telemetry.CollectMetrics()
				if err != nil {
					log.Printf("Metrics error: %v", err)
					time.Sleep(1 * time.Second)
					continue
				}

				req := &pb.TelemetryRequest{
					VpsId:     *vpsID,
					CpuUsage:  float32(metrics.CPUUsage),
					RamUsage:  float32(metrics.RAMUsage),
					RamTotal:  float32(metrics.RAMTotal),
					DiskUsage: float32(metrics.DiskUsage),
					NetTx:     float32(metrics.NetTx),
					NetRx:     float32(metrics.NetRx),
					Timestamp: metrics.Timestamp,
				}
				if err := stream.Send(req); err != nil {
					log.Printf("Telemetry stream send error: %v", err)
					break // reconnect
				}
				
				time.Sleep(1 * time.Second)
			}
		}
	}()

	// Screenshot Loop
	for {
		time.Sleep(30 * time.Second) // Every 30 seconds
		data := takeScreenshot()
		_, err := backendClient.UploadScreenshot(context.Background(), &pb.ScreenshotRequest{
			VpsId:     *vpsID,
			ImageData: data,
		})
		if err != nil {
			log.Printf("Screenshot upload failed: %v", err)
		}
	}
}
