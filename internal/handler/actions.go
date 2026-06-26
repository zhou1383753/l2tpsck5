package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"singbox-webui/internal/models"
	"singbox-webui/internal/singbox"
)

func (a *API) handleProxyAction(w http.ResponseWriter, action string, payload map[string]any) bool {
	switch action {
	case "batch_add_socks":
		text, _ := payload["socks_text"].(string)
		nodes, err := singbox.ParseSocksLines(text)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		existing, _ := a.store.LoadNodes()
		existing = append(existing, nodes...)
		if err := a.sb.SaveNodes(existing); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success", "message": fmt.Sprintf("已导入 %d 个节点", len(nodes))})
		return true

	case "add_parsed_nodes":
		rawNodes, ok := payload["nodes"].([]any)
		if !ok || len(rawNodes) == 0 {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "nodes 不能为空"})
			return true
		}
		nodes := make([]map[string]any, 0, len(rawNodes))
		for _, item := range rawNodes {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			nodes = append(nodes, singbox.NormalizeNode(m))
		}
		if err := a.store.AddNodes(nodes); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		if err := a.sb.Apply(); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success", "message": fmt.Sprintf("已导入 %d 个节点", len(nodes))})
		return true

	case "edit_node":
		rawNode, ok := payload["node"].(map[string]any)
		if !ok {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "node 不能为空"})
			return true
		}
		node := singbox.NormalizeNode(rawNode)
		if err := a.store.UpsertNode(node); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		if err := a.sb.Apply(); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true

	case "delete_node":
		tag, _ := payload["tag"].(string)
		if tag == "" {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "tag 不能为空"})
			return true
		}
		if err := a.deleteNodesAndCleanup([]string{tag}); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true

	case "batch_delete_nodes":
		rawTags, ok := payload["tags"].([]any)
		if !ok {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "tags 不能为空"})
			return true
		}
		tags := make([]string, 0, len(rawTags))
		for _, t := range rawTags {
			if s, ok := t.(string); ok && s != "" {
				tags = append(tags, s)
			}
		}
		if err := a.deleteNodesAndCleanup(tags); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true

	case "test_node":
		a.handleTestNode(w, payload)
		return true

	case "real_test_node":
		writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "真实出口测试暂未实现"})
		return true
	}
	return false
}

func (a *API) deleteNodesAndCleanup(tags []string) error {
	if err := a.store.DeleteNodes(tags); err != nil {
		return err
	}
	remove := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		remove[tag] = struct{}{}
	}
	devices, _ := a.store.LoadDeviceModels()
	changed := false
	for i, dev := range devices {
		if _, ok := remove[dev.Proxy]; ok {
			devices[i].Proxy = models.ProxyBlock
			changed = true
		}
	}
	if changed {
		if err := a.store.SaveDeviceModels(devices); err != nil {
			return err
		}
	}
	return a.sb.Apply()
}

func (a *API) handleTestNode(w http.ResponseWriter, payload map[string]any) {
	host, _ := payload["server"].(string)
	port := intFromAny(payload["port"])
	if port == 0 {
		if node, ok := payload["node"].(map[string]any); ok {
			host, _ = node["server"].(string)
			port = intFromAny(node["server_port"])
		}
	}
	if host == "" || port == 0 {
		writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "无效节点地址"})
		return
	}
	start := time.Now()
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, fmt.Sprint(port)), 5*time.Second)
	latency := int(time.Since(start).Milliseconds())
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "success", "latency": -1})
		return
	}
	_ = conn.Close()
	writeJSON(w, http.StatusOK, map[string]any{"status": "success", "latency": latency})
}

func (a *API) handleDeviceAction(w http.ResponseWriter, action string, payload map[string]any) bool {
	switch action {
	case "add_devices":
		tag, _ := payload["tag"].(string)
		policy, _ := payload["policy"].(string)
		if policy == "" {
			policy = models.PolicyAllProxy
		}
		ips := stringList(payload["ips"])
		if len(ips) == 0 {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "ips 不能为空"})
			return true
		}
		if tag == "" {
			tag = models.ProxyBlock
		}
		for _, ip := range ips {
			if err := a.store.BindDevice(ip, tag, policy); err != nil {
				writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
				return true
			}
		}
		if err := a.sb.Apply(); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true

	case "batch_bind_devices":
		raw, ok := payload["assignments"].([]any)
		if !ok {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "assignments 不能为空"})
			return true
		}
		for _, item := range raw {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			ip, _ := m["ip"].(string)
			tag, _ := m["tag"].(string)
			policy, _ := m["policy"].(string)
			if err := a.store.BindDevice(ip, tag, policy); err != nil {
				writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
				return true
			}
		}
		if err := a.sb.Apply(); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true

	case "change_proxy":
		ip, _ := payload["ip"].(string)
		tag, _ := payload["tag"].(string)
		policy, _ := payload["policy"].(string)
		if err := a.sb.BindDevice(ip, tag, policy); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true

	case "change_device_policy":
		ip, _ := payload["ip"].(string)
		policy, _ := payload["policy"].(string)
		dev, ok := a.store.GetDevice(ip)
		if !ok {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "设备不存在"})
			return true
		}
		dev.Policy = policy
		if err := a.store.UpsertDevice(dev); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		if err := a.sb.Apply(); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true

	case "edit_device":
		oldIP, _ := payload["ip"].(string)
		newIP, _ := payload["new_ip"].(string)
		tag, _ := payload["tag"].(string)
		policy, _ := payload["policy"].(string)
		dev, ok := a.store.GetDevice(oldIP)
		if !ok {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "设备不存在"})
			return true
		}
		if err := a.store.DeleteDevice(oldIP); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		if newIP == "" {
			newIP = oldIP
		}
		if tag == "" {
			tag = dev.Proxy
		}
		if policy == "" {
			policy = dev.Policy
		}
		if err := a.sb.BindDevice(newIP, tag, policy); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true

	case "delete_device":
		ip, _ := payload["ip"].(string)
		if err := a.store.DeleteDevice(ip); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		if err := a.sb.Apply(); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true

	case "update_dns_settings":
		dns, _ := payload["dns"].(string)
		dnsMode, _ := payload["dns_mode"].(string)
		if dns == "" {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "dns 不能为空"})
			return true
		}
		if err := a.sb.SaveDNS(dns, dnsMode); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success", "message": "DNS 配置已保存并重载"})
		return true

	case "add_custom_smart_rule":
		target := strings.TrimSpace(fmt.Sprint(payload["target"]))
		targetType := strings.TrimSpace(fmt.Sprint(payload["target_type"]))
		outbound := strings.TrimSpace(fmt.Sprint(payload["outbound"]))
		if target == "" {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "target 不能为空"})
			return true
		}
		if outbound == "" {
			outbound = "proxy"
		}
		if targetType == "" || targetType == "auto" {
			targetType = detectTargetType(target)
		}
		rules, _ := a.store.LoadCustomRuleModels()
		rules = append(rules, models.CustomSmartRule{
			ID:       newRuleID(),
			Target:   target,
			Type:     targetType,
			Outbound: outbound,
			Enabled:  true,
		})
		if err := a.sb.SaveCustomRules(rules); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true

	case "delete_custom_smart_rule":
		ruleID := fmt.Sprint(payload["rule_id"])
		rules, _ := a.store.LoadCustomRuleModels()
		out := make([]models.CustomSmartRule, 0, len(rules))
		for _, rule := range rules {
			if rule.ID == ruleID {
				continue
			}
			out = append(out, rule)
		}
		if err := a.sb.SaveCustomRules(out); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true

	case "toggle_custom_smart_rule":
		ruleID := fmt.Sprint(payload["rule_id"])
		enabled, _ := payload["enabled"].(bool)
		rules, _ := a.store.LoadCustomRuleModels()
		found := false
		for i, rule := range rules {
			if rule.ID == ruleID {
				rules[i].Enabled = enabled
				found = true
				break
			}
		}
		if !found {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "规则不存在"})
			return true
		}
		if err := a.sb.SaveCustomRules(rules); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return true
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success"})
		return true
	}
	return false
}

func detectTargetType(target string) string {
	if strings.Contains(target, "/") || strings.Count(target, ".") == 3 {
		return "ip"
	}
	return "domain"
}

func newRuleID() string {
	buf := make([]byte, 6)
	_, _ = rand.Read(buf)
	return "rule-" + hex.EncodeToString(buf)
}

func stringList(v any) []string {
	raw, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, strings.TrimSpace(s))
		}
	}
	return out
}

func intFromAny(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case json.Number:
		i, _ := n.Int64()
		return int(i)
	default:
		return 0
	}
}

func devicesToAny(devices []models.Device) []any {
	out := make([]any, 0, len(devices))
	for _, dev := range devices {
		out = append(out, map[string]any{
			"ip":     dev.IP,
			"proxy":  dev.Proxy,
			"policy": dev.Policy,
		})
	}
	return out
}

func customRulesToAny(rules []models.CustomSmartRule) []any {
	out := make([]any, 0, len(rules))
	for _, rule := range rules {
		out = append(out, map[string]any{
			"id":       rule.ID,
			"target":   rule.Target,
			"type":     rule.Type,
			"outbound": rule.Outbound,
			"enabled":  rule.Enabled,
		})
	}
	return out
}
