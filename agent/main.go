package main

import (
	"log"
	"time"
	"agent/telemetry"
	// pb "agent/pb" // Gerekli proto paketleri derlendiğinde aktif edilecek
)

func main() {
	log.Println("VPS Agent (Golang) is starting...")
	
	vpsID := "test-vps-123"

	// Telemetry Loop (Saniyelik akış)
	go func() {
		for {
			metrics, err := telemetry.CollectMetrics()
			if err != nil {
				log.Printf("Metrics error: %v", err)
				continue
			}

			log.Printf("[Telemetry] CPU: %.2f%%, RAM: %.2f%%, TX: %.2f B/s", metrics.CPUUsage, metrics.RAMUsage, metrics.NetTx)
			
			// TODO: gRPC stream ile Server'a aktarılacak
			// client.StreamTelemetry(...)
			
			time.Sleep(1 * time.Second) // Düşük gecikmeli, 1 saniye aralıklarla
		}
	}()

	// Heartbeat Loop (Server bağlantı kontrolü)
	for {
		log.Printf("[Heartbeat] VPS %s sunucuya ping gönderiyor...", vpsID)
		time.Sleep(10 * time.Second)
	}
}
