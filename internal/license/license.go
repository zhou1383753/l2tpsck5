package license

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// FixedResponse 保持原版授权成功响应结构，但不请求远程授权服务。
func FixedResponse() map[string]any {
	now := time.Now()
	expiresAt := now.AddDate(100, 0, 0).Format(time.RFC3339)
	leaseUntil := now.Add(24 * time.Hour).Format(time.RFC3339)
	installID := localInstallID()

	return map[string]any{
		"status":           "authorized",
		"message":          "授权有效",
		"configured":       true,
		"core_allowed":     true,
		"install_id":       installID,
		"device_name":      "本地设备",
		"license_key":      "LOCAL-PERMANENT-LICENSE",
		"public_ip":        "127.0.0.1",
		"country":          "CN",
		"preferred_region": "cn",
		"expires_at":       expiresAt,
		"last_success_at":  now.Format(time.RFC3339),
		"last_check_at":    now.Format(time.RFC3339),
		"grace_until":      leaseUntil,
		"lease_expires_at": leaseUntil,
		"tunnel_endpoint":  "cn.loulan.cloud:5173",
	}
}

func localInstallID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "00000000-0000-4000-8000-000000000000"
	}
	raw := hex.EncodeToString(buf)
	return raw[0:8] + "-" + raw[8:12] + "-4" + raw[13:16] + "-8" + raw[17:20] + "-" + raw[20:32]
}
