package singbox

import (
	"fmt"
	"strings"
)

func ParseSocksLines(text string) ([]map[string]any, error) {
	lines := strings.Split(text, "\n")
	nodes := make([]map[string]any, 0)
	usedTags := make(map[string]int)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		node, err := parseSocksLine(line)
		if err != nil {
			return nil, fmt.Errorf("解析失败 %q: %w", line, err)
		}
		tag := fmt.Sprint(node["tag"])
		if n, ok := usedTags[tag]; ok {
			n++
			usedTags[tag] = n
			node["tag"] = fmt.Sprintf("%s-%d", tag, n)
		} else {
			usedTags[tag] = 1
		}
		nodes = append(nodes, node)
	}
	if len(nodes) == 0 {
		return nil, fmt.Errorf("没有可导入的 Socks 节点")
	}
	return nodes, nil
}

func parseSocksLine(line string) (map[string]any, error) {
	parts := strings.Split(line, ":")
	if len(parts) < 2 {
		return nil, fmt.Errorf("格式应为 host:port 或 host:port:user:pass")
	}

	host := parts[0]
	port := parts[1]
	user := ""
	pass := ""
	if len(parts) >= 4 {
		user = parts[2]
		pass = strings.Join(parts[3:], ":")
	}

	tag := fmt.Sprintf("SOCKS-%s-%s", host, port)
	node := map[string]any{
		"type":        "socks",
		"tag":         tag,
		"server":      host,
		"server_port": atoiDefault(port, 0),
	}
	if user != "" {
		node["username"] = user
		node["password"] = pass
	}
	if node["server_port"] == 0 {
		return nil, fmt.Errorf("无效端口")
	}
	return node, nil
}

func NormalizeNode(node map[string]any) map[string]any {
	out := make(map[string]any, len(node)+2)
	for k, v := range node {
		switch k {
		case "selected", "expanded", "testing", "latency", "realTesting", "realTestResult":
			continue
		default:
			out[k] = v
		}
	}

	nodeType, _ := out["type"].(string)
	switch strings.ToLower(nodeType) {
	case "ss":
		out["type"] = "shadowsocks"
	case "hy2":
		out["type"] = "hysteria2"
	case "", "socks5":
		out["type"] = "socks"
	}

	if _, ok := out["tag"]; !ok {
		server, _ := out["server"].(string)
		port := fmt.Sprint(out["server_port"])
		out["tag"] = fmt.Sprintf("%s-%s", strings.ToUpper(fmt.Sprint(out["type"])), server+":"+port)
	}
	return out
}

func atoiDefault(s string, def int) int {
	var n int
	_, err := fmt.Sscanf(strings.TrimSpace(s), "%d", &n)
	if err != nil || n <= 0 {
		return def
	}
	return n
}
