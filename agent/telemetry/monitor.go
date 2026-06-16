package telemetry

import (
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

type Metrics struct {
	CPUUsage  float64
	RAMUsage  float64
	RAMTotal  float64
	DiskUsage float64
	DiskTotal float64
	NetTx     float64
	NetRx     float64
	Timestamp int64
	Uptime    uint64
}

var (
	lastNet     *net.IOCountersStat
	lastTime    time.Time
	netMu       sync.Mutex
	initialized bool
)

func CollectMetrics() (*Metrics, error) {
	m := &Metrics{Timestamp: time.Now().Unix()}

	hInfo, err := host.Info()
	if err == nil {
		m.Uptime = hInfo.Uptime
	}

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
		m.DiskTotal = float64(dStat.Total)
	}

	// Network — aggregate across all non-loopback interfaces. The
	// gopsutil/per-nic view is correct for per-link dashboards but
	// misleading for a top-of-host throughput metric on multi-NIC
	// servers, so we sum BytesSent/BytesRecv and skip loopback.
	netMu.Lock()
	defer netMu.Unlock()

	netStats, err := net.IOCounters(true)
	if err == nil {
		var totalTx, totalRx uint64
		for _, ni := range netStats {
			nameLower := strings.ToLower(ni.Name)
			if nameLower == "lo" || strings.Contains(nameLower, "loopback") {
				continue
			}
			totalTx += ni.BytesSent
			totalRx += ni.BytesRecv
		}
		now := time.Now()

		if initialized && lastNet != nil {
			duration := now.Sub(lastTime).Seconds()
			if duration > 0 {
				m.NetTx = float64(totalTx-lastNet.BytesSent) / duration
				m.NetRx = float64(totalRx-lastNet.BytesRecv) / duration
			}
		}

		lastNet = &net.IOCountersStat{BytesSent: totalTx, BytesRecv: totalRx}
		lastTime = now
		initialized = true
	}

	return m, nil
}
