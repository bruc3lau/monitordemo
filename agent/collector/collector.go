package collector

import (
	"bytes"
	"math"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

// NetworkStats holds the rate of upload/download in bytes per second
type NetworkStats struct {
	BytesRecvPerSec uint64 `json:"bytes_recv_per_sec"`
	BytesSentPerSec uint64 `json:"bytes_sent_per_sec"`
}

type GPUMetrics struct {
	Index       int    `json:"index"`
	Name        string `json:"name"`
	Utilization int    `json:"utilization"`
	MemoryUsed  int    `json:"memory_used"`
	MemoryTotal int    `json:"memory_total"`
}

var lastNetStats *net.IOCountersStat
var lastNetTime time.Time

func CollectAll() (map[string]interface{}, error) {
	metrics := make(map[string]interface{})

	// 1. CPU
	cpuPercents, err := cpu.Percent(0, false)
	if err == nil && len(cpuPercents) > 0 {
		metrics["cpu"] = math.Round(cpuPercents[0]*10) / 10 // rounded to 1 decimal
	}

	// 2. Memory
	vMem, err := mem.VirtualMemory()
	if err == nil {
		metrics["memory"] = map[string]interface{}{
			"total":       vMem.Total,
			"used":        vMem.Used,
			"usedPercent": math.Round(vMem.UsedPercent*10) / 10,
		}
	}

	// 3. Network
	netIOs, err := net.IOCounters(false) // false to get aggregated total
	if err == nil && len(netIOs) > 0 {
		currentStats := &netIOs[0]
		now := time.Now()
		
		if lastNetStats != nil {
			deltaSecs := now.Sub(lastNetTime).Seconds()
			if deltaSecs > 0 {
				bytesRecvRate := float64(currentStats.BytesRecv-lastNetStats.BytesRecv) / deltaSecs
				bytesSentRate := float64(currentStats.BytesSent-lastNetStats.BytesSent) / deltaSecs
				metrics["network"] = NetworkStats{
					BytesRecvPerSec: uint64(bytesRecvRate),
					BytesSentPerSec: uint64(bytesSentRate),
				}
			}
		}
		
		lastNetStats = currentStats
		lastNetTime = now
	}

	// 4. Nvidia GPU (parsing nvidia-smi)
	gpuMetrics := collectGPU()
	if gpuMetrics != nil {
		metrics["gpu"] = gpuMetrics
	}

	return metrics, nil
}

func collectGPU() []GPUMetrics {
	cmd := exec.Command("nvidia-smi", "--query-gpu=index,name,utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits")
	var out bytes.Buffer
	cmd.Stdout = &out
	err := cmd.Run()
	if err != nil {
		return nil // GPU probably not available or nvidia-smi missing
	}

	/*
		Sample output:
		0, NVIDIA GeForce RTX 3060 Laptop GPU, 4, 3424, 6144
	*/

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	var gpus []GPUMetrics
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.Split(line, ",")
		if len(parts) >= 5 {
			idx, _ := strconv.Atoi(strings.TrimSpace(parts[0]))
			name := strings.TrimSpace(parts[1])
			util, _ := strconv.Atoi(strings.TrimSpace(parts[2]))
			memUsed, _ := strconv.Atoi(strings.TrimSpace(parts[3]))
			memTotal, _ := strconv.Atoi(strings.TrimSpace(parts[4]))

			gpus = append(gpus, GPUMetrics{
				Index:       idx,
				Name:        name,
				Utilization: util,
				MemoryUsed:  memUsed,
				MemoryTotal: memTotal,
			})
		}
	}
	return gpus
}
