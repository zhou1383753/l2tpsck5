package traffic

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

type Snapshot struct {
	UploadTotal   int64
	DownloadTotal int64
	Connections   int64
	NodeUpload    map[string]int64
	NodeDownload  map[string]int64
	At            time.Time
}

type Reader struct {
	controller string
	mu         sync.Mutex
	last       Snapshot
}

func NewReader(controller string) *Reader {
	return &Reader{controller: controller}
}

func (r *Reader) Stats() map[string]any {
	now := time.Now()
	current := r.readSnapshot(now)

	r.mu.Lock()
	previous := r.last
	r.last = current
	r.mu.Unlock()

	intervalMS := int64(3000)
	if !previous.At.IsZero() {
		intervalMS = now.Sub(previous.At).Milliseconds()
		if intervalMS <= 0 {
			intervalMS = 3000
		}
	}
	seconds := float64(intervalMS) / 1000
	uploadRate := rate(current.UploadTotal, previous.UploadTotal, seconds)
	downloadRate := rate(current.DownloadTotal, previous.DownloadTotal, seconds)

	nodes := map[string]any{}
	for tag, up := range current.NodeUpload {
		down := current.NodeDownload[tag]
		prevUp := previous.NodeUpload[tag]
		prevDown := previous.NodeDownload[tag]
		nodes[tag] = map[string]any{
			"upload_rate":    rate(up, prevUp, seconds),
			"download_rate":  rate(down, prevDown, seconds),
			"upload_total":   up,
			"download_total": down,
			"total":          up + down,
			"connections":    0,
		}
	}

	return map[string]any{
		"status":      "success",
		"interval_ms": intervalMS,
		"global": map[string]any{
			"upload_rate":    uploadRate,
			"download_rate":  downloadRate,
			"upload_total":   current.UploadTotal,
			"download_total": current.DownloadTotal,
			"total":          current.UploadTotal + current.DownloadTotal,
			"connections":    current.Connections,
		},
		"nodes": nodes,
	}
}

func rate(current, previous int64, seconds float64) int64 {
	if seconds <= 0 || current < previous {
		return 0
	}
	return int64(float64(current-previous) / seconds)
}

func (r *Reader) readSnapshot(now time.Time) Snapshot {
	s := Snapshot{At: now, NodeUpload: map[string]int64{}, NodeDownload: map[string]int64{}}
	trafficURL := "http://" + r.controller + "/traffic"
	if data, err := getJSON(trafficURL); err == nil {
		s.UploadTotal = int64FromAny(data["uploadTotal"])
		s.DownloadTotal = int64FromAny(data["downloadTotal"])
		if s.UploadTotal == 0 {
			s.UploadTotal = int64FromAny(data["up"])
		}
		if s.DownloadTotal == 0 {
			s.DownloadTotal = int64FromAny(data["down"])
		}
	}
	connectionsURL := "http://" + r.controller + "/connections"
	if data, err := getJSON(connectionsURL); err == nil {
		s.Connections = int64FromAny(data["downloadTotal"])
		if conns, ok := data["connections"].([]any); ok {
			s.Connections = int64(len(conns))
			for _, item := range conns {
				conn, ok := item.(map[string]any)
				if !ok {
					continue
				}
				tag := ""
				if chains, ok := conn["chains"].([]any); ok && len(chains) > 0 {
					tag, _ = chains[len(chains)-1].(string)
				}
				if tag == "" {
					tag, _ = conn["rule"].(string)
				}
				if tag == "" {
					continue
				}
				upload := int64FromAny(conn["upload"])
				download := int64FromAny(conn["download"])
				s.NodeUpload[tag] += upload
				s.NodeDownload[tag] += download
			}
		}
	}
	return s
}

func getJSON(url string) (map[string]any, error) {
	client := http.Client{Timeout: 1200 * time.Millisecond}
	res, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var data map[string]any
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, err
	}
	return data, nil
}

func int64FromAny(v any) int64 {
	switch x := v.(type) {
	case float64:
		return int64(x)
	case int64:
		return x
	case int:
		return int64(x)
	case json.Number:
		n, _ := x.Int64()
		return n
	default:
		return 0
	}
}
