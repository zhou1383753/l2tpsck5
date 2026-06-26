package singbox

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"singbox-webui/internal/models"
	"singbox-webui/internal/ruleset"
)

type BuildInput struct {
	BaseDir      string
	DNS          string
	DNSMode      string
	Nodes        []map[string]any
	Devices      []models.Device
	CustomRules  []models.CustomSmartRule
}

func BuildConfig(in BuildInput) (map[string]any, error) {
	basePath := filepath.Join(in.BaseDir, "config.json")
	raw, err := os.ReadFile(basePath)
	if err != nil {
		return nil, fmt.Errorf("读取 config.json 失败: %w", err)
	}

	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("解析 config.json 失败: %w", err)
	}

	applyDNS(cfg, in.DNS, in.DNSMode)

	outbounds := []any{
		map[string]any{"type": "direct", "tag": "direct"},
		map[string]any{"type": "block", "tag": "block"},
	}

	nodeTags := make([]string, 0, len(in.Nodes))
	for _, node := range in.Nodes {
		outbound := nodeToOutbound(node)
		if outbound == nil {
			continue
		}
		tag, _ := outbound["tag"].(string)
		if tag != "" {
			nodeTags = append(nodeTags, tag)
		}
		outbounds = append(outbounds, outbound)
	}

	if len(nodeTags) > 0 {
		outbounds = append(outbounds, map[string]any{
			"type":      "selector",
			"tag":       "proxy",
			"outbounds": append(nodeTags, "direct"),
		})
	}

	cfg["outbounds"] = outbounds
	cfg["route"] = buildRoute(in, nodeTags)
	return cfg, nil
}

func applyDNS(cfg map[string]any, dns string, dnsMode string) {
	if dns == "" {
		dns = "223.5.5.5"
	}
	dnsObj, ok := cfg["dns"].(map[string]any)
	if !ok {
		dnsObj = map[string]any{}
	}
	dnsObj["servers"] = []any{
		map[string]any{
			"tag":    "remote-dns",
			"type":   "udp",
			"server": dns,
		},
	}
	dnsObj["final"] = "remote-dns"
	if strings.EqualFold(dnsMode, "fake") {
		dnsObj["fakeip"] = map[string]any{
			"enabled":     true,
			"inet4_range": "198.18.0.0/15",
		}
	} else {
		delete(dnsObj, "fakeip")
	}
	cfg["dns"] = dnsObj
}

func buildRoute(in BuildInput, nodeTags []string) map[string]any {
	rules := []any{
		map[string]any{"action": "sniff"},
		map[string]any{"port": 53, "action": "hijack-dns"},
		map[string]any{"protocol": "dns", "action": "hijack-dns"},
		map[string]any{"network": "udp", "port": 443, "outbound": "block"},
	}

	for _, rule := range in.CustomRules {
		if !rule.Enabled {
			continue
		}
		item := map[string]any{"outbound": mapCustomOutbound(rule.Outbound)}
		target := strings.TrimSpace(rule.Target)
		if target == "" {
			continue
		}
		switch rule.Type {
		case "domain", "domain_suffix", "domain_keyword", "domain_regex":
			item["domain"] = []any{target}
		case "ip", "ip_cidr":
			item["ip_cidr"] = []any{target}
		default:
			if strings.Contains(target, "/") || strings.Count(target, ".") == 3 {
				item["ip_cidr"] = []any{target}
			} else {
				item["domain"] = []any{target}
			}
		}
		rules = append(rules, item)
	}

	smartAvailable := ruleset.Load(in.BaseDir).Available
	ruleSets := []any{}
	if smartAvailable {
		ruleSets = append(ruleSets, map[string]any{
			"tag":    "geoip-cn",
			"type":   "local",
			"format": "binary",
			"path":   ruleset.DefaultPath,
		})
	}

	for _, dev := range in.Devices {
		if dev.Proxy == models.ProxyBlock || dev.Proxy == "" {
			continue
		}
		cidr := normalizeDeviceCIDR(dev.IP)
		if cidr == "" {
			continue
		}
		if dev.Policy == models.PolicySmart && smartAvailable {
			rules = append(rules, map[string]any{
				"source_ip_cidr": []any{cidr},
				"rule_set":       []any{"geoip-cn"},
				"outbound":       "direct",
			})
		}
		rules = append(rules, map[string]any{
			"source_ip_cidr": []any{cidr},
			"outbound":       dev.Proxy,
		})
	}

	route := map[string]any{
		"rules":                   rules,
		"auto_detect_interface":   true,
		"final":                   "block",
	}
	if len(ruleSets) > 0 {
		route["rule_set"] = ruleSets
	}
	return route
}

func mapCustomOutbound(outbound string) string {
	if outbound == "direct" {
		return "direct"
	}
	return "proxy"
}

func normalizeDeviceCIDR(ip string) string {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return ""
	}
	if strings.Contains(ip, "/") {
		return ip
	}
	return ip + "/32"
}

func nodeToOutbound(node map[string]any) map[string]any {
	node = NormalizeNode(node)
	tag, _ := node["tag"].(string)
	if tag == "" {
		return nil
	}
	out := map[string]any{"tag": tag}
	for k, v := range node {
		if k == "tag" {
			continue
		}
		out[k] = v
	}
	if _, ok := out["type"]; !ok {
		out["type"] = "socks"
	}
	return out
}

func BuildRouteRulesView(devices []models.Device) []map[string]any {
	out := make([]map[string]any, 0, len(devices))
	for _, dev := range devices {
		if dev.Proxy == models.ProxyBlock || dev.Proxy == "" {
			continue
		}
		cidr := normalizeDeviceCIDR(dev.IP)
		out = append(out, map[string]any{
			"source_ip_cidr": []any{cidr},
			"outbound":       dev.Proxy,
			"policy":         dev.Policy,
		})
	}
	return out
}

func WriteConfig(path string, cfg map[string]any) error {
	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o644)
}
