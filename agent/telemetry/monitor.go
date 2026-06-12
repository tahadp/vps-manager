package telemetry

import (
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

type Metrics struct {
	CPUUsage  float64
	RAMUsage  float64
	RAMTotal  float64
	DiskUsage float64
	NetTx     float64
	NetRx     float64
	Timestamp int64
}

var lastNet *net.IOCountersStat
var lastTime time.Time

func CollectMetrics() (*Metrics, error) {
	m := &Metrics{Timestamp: time.Now().Unix()}

	// CPU
	cpuP, err := cpu.Percent(0, false)
	if err == nil && len(cpuP) > 0 {
		m.CPUUsage = cpuP[0]
	}

	// RAM
	vMem, err := mem.VirtualMemory()
	if err == nil {
		m.RAMUsage = vMem.UsedPercent
		m.RAMTotal = float64(vMem.Total)
	}

	// Disk
	diskPath := "/"
	if runtime.GOOS == "windows" {
		diskPath = "C:\\"
	}
	dStat, err := disk.Usage(diskPath)
	if err == nil {
		m.DiskUsage = dStat.UsedPercent
	}

	// Network
	netStats, err := net.IOCounters(false)
	if err == nil && len(netStats) > 0 {
		currentNet := &netStats[0]
		now := time.Now()

		if lastNet != nil {
			duration := now.Sub(lastTime).Seconds()
			if duration > 0 {
				m.NetTx = float64(currentNet.BytesSent-lastNet.BytesSent) / duration
				m.NetRx = float64(currentNet.BytesRecv-lastNet.BytesRecv) / duration
			}
		}
		
		lastNet = currentNet
		lastTime = now
	}

	return m, nil
}
