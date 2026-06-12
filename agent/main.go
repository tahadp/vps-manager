package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	pb "agent/pb"
	"agent/telemetry"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

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

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout // Merge stderr to stdout

	if err := cmd.Start(); err != nil {
		return err
	}

	// Read from stream -> Write to stdin
	go func() {
		for {
			msg, err := stream.Recv()
			if err != nil {
				stdin.Close()
				break
			}
			stdin.Write(msg.Data)
		}
	}()

	// Read from stdout -> Write to stream
	buf := make([]byte, 1024)
	for {
		n, err := stdout.Read(buf)
		if n > 0 {
			stream.Send(&pb.ShellMessage{
				VpsId: "agent",
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
	// Görüntü alma işlemi için bir kütüphane kullanılmalı (örn: github.com/kbinani/screenshot).
	// Burada demo amaçlı boş byte dizisi dönüyoruz veya basit bir CLI aracına call atabiliriz.
	return []byte("fake_screenshot_data")
}

func main() {
	vpsID := "x0o0ckog4cco4gco0sk8wk8w" // Fake UUID for testing, match it with DB if testing locally

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
	conn, err := grpc.Dial("127.0.0.1:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("Did not connect to backend: %v", err)
	}
	defer conn.Close()
	backendClient := pb.NewBackendServiceClient(conn)

	// Telemetry Loop
	go func() {
		for {
			metrics, err := telemetry.CollectMetrics()
			if err != nil {
				log.Printf("Metrics error: %v", err)
				time.Sleep(1 * time.Second)
				continue
			}

			// Stream telemetry
			stream, err := backendClient.StreamTelemetry(context.Background())
			if err == nil {
				req := &pb.TelemetryRequest{
					VpsId:     vpsID,
					CpuUsage:  float32(metrics.CPUUsage),
					RamUsage:  float32(metrics.RAMUsage),
					RamTotal:  float32(100), // Fake
					DiskUsage: 50.0,
					NetTx:     float32(metrics.NetTx),
					NetRx:     0.0,
					Timestamp: time.Now().Unix(),
				}
				stream.Send(req)
				stream.CloseAndRecv() // Close immediately since we just send one per interval and reconnect, or keep alive
			}
			
			time.Sleep(1 * time.Second)
		}
	}()

	// Screenshot Loop
	for {
		time.Sleep(30 * time.Second) // Every 30 seconds
		data := takeScreenshot()
		_, err := backendClient.UploadScreenshot(context.Background(), &pb.ScreenshotRequest{
			VpsId:     vpsID,
			ImageData: data,
		})
		if err != nil {
			log.Printf("Screenshot upload failed: %v", err)
		}
	}
}
