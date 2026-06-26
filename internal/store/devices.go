package store

import (
	"fmt"
	"strings"

	"singbox-webui/internal/models"
)

func normalizeIP(ip string) string {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return ip
	}
	if strings.Contains(ip, "/") {
		return ip
	}
	return ip + "/32"
}

func deviceKey(ip string) string {
	return strings.TrimSpace(strings.Split(ip, "/")[0])
}

func (s *Store) LoadDeviceModels() ([]models.Device, error) {
	raw, err := s.LoadDevices()
	if err != nil {
		return nil, err
	}
	out := make([]models.Device, 0, len(raw))
	for _, item := range raw {
		ip, _ := item["ip"].(string)
		proxy, _ := item["proxy"].(string)
		policy, _ := item["policy"].(string)
		if ip == "" {
			continue
		}
		if proxy == "" {
			proxy = models.ProxyBlock
		}
		if policy == "" {
			policy = models.PolicyAllProxy
		}
		out = append(out, models.Device{IP: ip, Proxy: proxy, Policy: policy})
	}
	return out, nil
}

func (s *Store) SaveDeviceModels(devices []models.Device) error {
	raw := make([]map[string]any, 0, len(devices))
	for _, dev := range devices {
		raw = append(raw, map[string]any{
			"ip":     dev.IP,
			"proxy":  dev.Proxy,
			"policy": dev.Policy,
		})
	}
	return s.SaveDevices(raw)
}

func (s *Store) UpsertDevice(dev models.Device) error {
	devices, _ := s.LoadDeviceModels()
	key := deviceKey(dev.IP)
	found := false
	for i, item := range devices {
		if deviceKey(item.IP) == key {
			devices[i] = dev
			found = true
			break
		}
	}
	if !found {
		devices = append(devices, dev)
	}
	return s.SaveDeviceModels(devices)
}

func (s *Store) DeleteDevice(ip string) error {
	key := deviceKey(ip)
	devices, _ := s.LoadDeviceModels()
	out := make([]models.Device, 0, len(devices))
	for _, dev := range devices {
		if deviceKey(dev.IP) == key {
			continue
		}
		out = append(out, dev)
	}
	return s.SaveDeviceModels(out)
}

func (s *Store) GetDevice(ip string) (models.Device, bool) {
	key := deviceKey(ip)
	devices, _ := s.LoadDeviceModels()
	for _, dev := range devices {
		if deviceKey(dev.IP) == key {
			return dev, true
		}
	}
	return models.Device{}, false
}

func (s *Store) BindDevice(ip, tag, policy string) error {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return fmt.Errorf("设备 IP 不能为空")
	}
	if policy == "" {
		policy = models.PolicyAllProxy
	}
	if tag == "" {
		tag = models.ProxyBlock
	}
	if tag != models.ProxyBlock {
		if _, _, ok := s.FindNode(tag); !ok {
			return fmt.Errorf("代理节点不存在: %s", tag)
		}
	}
	return s.UpsertDevice(models.Device{IP: ip, Proxy: tag, Policy: policy})
}

func (s *Store) LoadCustomRuleModels() ([]models.CustomSmartRule, error) {
	raw, _ := s.LoadCustomSmartRules()
	out := make([]models.CustomSmartRule, 0, len(raw))
	for _, item := range raw {
		rule := models.CustomSmartRule{
			ID:       fmt.Sprint(item["id"]),
			Target:   fmt.Sprint(item["target"]),
			Type:     fmt.Sprint(item["type"]),
			Outbound: fmt.Sprint(item["outbound"]),
		}
		if v, ok := item["enabled"].(bool); ok {
			rule.Enabled = v
		}
		if rule.ID == "" || rule.ID == "<nil>" {
			continue
		}
		out = append(out, rule)
	}
	return out, nil
}

func (s *Store) SaveCustomRuleModels(rules []models.CustomSmartRule) error {
	raw := make([]map[string]any, 0, len(rules))
	for _, rule := range rules {
		raw = append(raw, map[string]any{
			"id":       rule.ID,
			"target":   rule.Target,
			"type":     rule.Type,
			"outbound": rule.Outbound,
			"enabled":  rule.Enabled,
		})
	}
	return s.SaveCustomSmartRules(raw)
}

func NormalizeCIDR(ip string) string {
	return normalizeIP(ip)
}
