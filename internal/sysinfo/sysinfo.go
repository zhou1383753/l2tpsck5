package sysinfo

import (
	"bufio"
	"os"
	"runtime"
	"strconv"
	"strings"
)

type CPUSample struct {
	Total uint64
	Idle  uint64
	OK    bool
}

func ReadCPUSample() CPUSample {
	file, err := os.Open("/proc/stat")
	if err != nil {
		return CPUSample{}
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if !scanner.Scan() {
		return CPUSample{}
	}
	fields := strings.Fields(scanner.Text())
	if len(fields) < 5 || fields[0] != "cpu" {
		return CPUSample{}
	}
	var values []uint64
	for _, field := range fields[1:] {
		v, err := strconv.ParseUint(field, 10, 64)
		if err != nil {
			return CPUSample{}
		}
		values = append(values, v)
	}
	var total uint64
	for _, v := range values {
		total += v
	}
	idle := values[3]
	if len(values) > 4 {
		idle += values[4]
	}
	return CPUSample{Total: total, Idle: idle, OK: true}
}

func CPUPercent(prev, curr CPUSample) float64 {
	if !prev.OK || !curr.OK || curr.Total <= prev.Total {
		return 0
	}
	totalDelta := curr.Total - prev.Total
	idleDelta := curr.Idle - prev.Idle
	if totalDelta == 0 || idleDelta > totalDelta {
		return 0
	}
	return float64(totalDelta-idleDelta) * 100 / float64(totalDelta)
}

func Memory() (total uint64, used uint64, percent float64) {
	file, err := os.Open("/proc/meminfo")
	if err != nil {
		var m runtime.MemStats
		runtime.ReadMemStats(&m)
		return 0, m.Alloc, 0
	}
	defer file.Close()

	values := map[string]uint64{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		key := strings.TrimSuffix(fields[0], ":")
		value, err := strconv.ParseUint(fields[1], 10, 64)
		if err != nil {
			continue
		}
		values[key] = value * 1024
	}
	total = values["MemTotal"]
	available := values["MemAvailable"]
	if total == 0 {
		return 0, 0, 0
	}
	if available == 0 {
		available = values["MemFree"] + values["Buffers"] + values["Cached"]
	}
	if available > total {
		available = total
	}
	used = total - available
	percent = float64(used) * 100 / float64(total)
	return total, used, percent
}
