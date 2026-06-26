package ruleset

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"time"
)

const DefaultPath = "rules/geoip-cn.srs"

type SmartRouting struct {
	Available   bool           `json:"available"`
	Path        string         `json:"path"`
	URL         string         `json:"url"`
	UpdatedAt   string         `json:"updated_at"`
	Size        int64          `json:"size"`
	Sha256      string         `json:"sha256"`
	CustomRules []any          `json:"custom_rules"`
}

func Load(baseDir string) SmartRouting {
	result := SmartRouting{
		Path:        DefaultPath,
		CustomRules: []any{},
	}
	fullPath := filepath.Join(baseDir, DefaultPath)
	info, err := os.Stat(fullPath)
	if err != nil {
		return result
	}

	f, err := os.Open(fullPath)
	if err != nil {
		return result
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return result
	}

	result.Available = true
	result.Size = info.Size()
	result.UpdatedAt = info.ModTime().Format(time.RFC3339)
	result.Sha256 = hex.EncodeToString(h.Sum(nil))
	return result
}
