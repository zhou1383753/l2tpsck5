package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"runtime"
	"time"

	"singbox-webui/internal/license"
	"singbox-webui/internal/rosapi"
	"singbox-webui/internal/ruleset"
	"singbox-webui/internal/singbox"
	"singbox-webui/internal/store"
	"singbox-webui/internal/sysinfo"
	"singbox-webui/internal/traffic"
)

type API struct {
	baseDir string
	store   *store.Store
	sb      *singbox.Manager
	traffic *traffic.Reader
	lastCPU sysinfo.CPUSample
}

func New(baseDir string) (*API, error) {
	st, err := store.Open(baseDir)
	if err != nil {
		return nil, err
	}
	if err := st.Init(); err != nil {
		st.Close()
		return nil, err
	}

	sb := singbox.NewManager(baseDir, st)
	api := &API{baseDir: baseDir, store: st, sb: sb, traffic: traffic.NewReader("127.0.0.1:9090"), lastCPU: sysinfo.ReadCPUSample()}
	if err := sb.Apply(); err != nil {
		log.Printf("sing-box 初次加载: %v", err)
	}
	return api, nil
}

func (a *API) Close() error {
	a.sb.Stop()
	return a.store.Close()
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (a *API) License(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"status": "error", "message": "method not allowed"})
		return
	}
	writeJSON(w, http.StatusOK, license.FixedResponse())
}

func (a *API) Version(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":     "success",
		"version":    "v1.0.3",
		"build_time": time.Now().Format(time.RFC3339),
		"go_version": runtime.Version(),
		"os_arch":    runtime.GOOS + "/" + runtime.GOARCH,
	})
}

func (a *API) Stats(w http.ResponseWriter, r *http.Request) {
	currentCPU := sysinfo.ReadCPUSample()
	cpuPercent := sysinfo.CPUPercent(a.lastCPU, currentCPU)
	if currentCPU.OK {
		a.lastCPU = currentCPU
	}
	memTotal, memUsed, memPercent := sysinfo.Memory()
	writeJSON(w, http.StatusOK, map[string]any{
		"os":          runtime.GOOS,
		"platform":    runtime.GOARCH,
		"cpu_percent": cpuPercent,
		"mem_total":   memTotal,
		"mem_used":    memUsed,
		"mem_percent": memPercent,
	})
}

func (a *API) Traffic(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.traffic.Stats())
}

type actionRequest struct {
	Action  string         `json:"action"`
	Payload map[string]any `json:"payload"`
}

func (a *API) Action(w http.ResponseWriter, r *http.Request) {
	var req actionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "message": "invalid json"})
		return
	}

	if a.handleProxyAction(w, req.Action, req.Payload) {
		return
	}
	if a.handleDeviceAction(w, req.Action, req.Payload) {
		return
	}

	switch req.Action {
	case "get_data":
		a.handleGetData(w)
	case "apply_config":
		if err := a.sb.Apply(); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success", "message": "核心已重载"})
	case "get_device_name":
		writeJSON(w, http.StatusOK, map[string]any{"name": a.store.ReadDeviceNameFile()})
	case "update_device_name":
		name, _ := req.Payload["name"].(string)
		if err := a.store.WriteDeviceNameFile(name); err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "success", "message": "设备名称已保存"})
	case "update_smart_rule_set":
		smart := ruleset.Load(a.baseDir)
		customRules, _ := a.store.LoadCustomRuleModels()
		smart.CustomRules = customRulesToAny(customRules)
		writeJSON(w, http.StatusOK, map[string]any{"status": "success", "message": "规则集已就绪", "smart_routing": smart})
	default:
		writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "action not implemented: " + req.Action})
	}
}

func (a *API) handleGetData(w http.ResponseWriter) {
	nodes, _ := a.store.LoadNodes()
	devices, _ := a.store.LoadDeviceModels()
	customRules, _ := a.store.LoadCustomRuleModels()
	rules, _ := a.sb.RouteRulesView()
	dns, dnsMode := a.store.LoadDNS()

	smart := ruleset.Load(a.baseDir)
	smart.CustomRules = customRulesToAny(customRules)

	writeJSON(w, http.StatusOK, map[string]any{
		"nodes":         nodes,
		"rules":         rules,
		"devices":       devicesToAny(devices),
		"dns":           dns,
		"dns_mode":      dnsMode,
		"smart_routing": smart,
	})
}

type rosRequest struct {
	Action  string         `json:"action"`
	Payload map[string]any `json:"payload"`
	Data    map[string]any `json:"data"`
	VpnType string         `json:"vpn_type"`
}

func (a *API) Ros(w http.ResponseWriter, r *http.Request) {
	var req rosRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"status": "error", "message": "invalid json"})
		return
	}

	if req.Action == "get_config" {
		a.handleRosGetConfig(w)
		return
	}

	cfg := rosapi.ConfigFromPayload(req.Payload)
	if cfg.Server == "" {
		if saved, exists, err := rosapi.LoadConfig(a.baseDir); err == nil && exists {
			cfg = saved
		}
	}

	switch req.Action {
	case "test_connection":
		a.withRosClient(w, cfg, true, func(c *rosapi.Client) (any, error) {
			return map[string]any{"status": "success", "message": "连接成功"}, nil
		})
	case "get_vpns":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			data, err := c.VPNs(req.VpnType)
			return map[string]any{"status": "success", "data": data}, err
		})
	case "get_wifis":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			data, err := c.WiFis()
			return map[string]any{"status": "success", "data": data}, err
		})
	case "get_dhcp_servers":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			servers, err := c.DHCPServers()
			return map[string]any{"status": "success", "servers": servers}, err
		})
	case "get_dhcp_leases":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			server, _ := req.Data["dhcp_server"].(string)
			leases, err := c.DHCPLeases(server)
			return map[string]any{"status": "success", "leases": leases}, err
		})
	case "get_routing_data":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			data, err := c.RoutingData()
			return map[string]any{"status": "success", "data": data}, err
		})
	case "set_routing_rule":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			cidr, _ := req.Data["cidr"].(string)
			table, _ := req.Data["table"].(string)
			previousTable, _ := req.Data["previousTable"].(string)
			skipNat, _ := req.Data["skipNat"].(bool)
			return map[string]any{"status": "success", "message": "路由规则已更新"}, c.SetRoutingRule(cidr, table, previousTable, skipNat)
		})
	case "toggle_vpn":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			name, _ := req.Data["name"].(string)
			disabled, _ := req.Data["disabled"].(string)
			return map[string]any{"status": "success"}, c.ToggleVPN(req.VpnType, name, disabled)
		})
	case "add_vpn", "edit_vpn":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			return map[string]any{"status": "success"}, c.AddOrEditVPN(req.VpnType, req.Data, req.Action == "edit_vpn")
		})
	case "batch_edit_vpns":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			vpns, _ := req.Data["vpns"].([]any)
			return map[string]any{"status": "success"}, c.BatchEditVPNs(req.VpnType, vpns)
		})
	case "ping_test":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			name, _ := req.Data["name"].(string)
			address, _ := req.Data["address"].(string)
			t, err := c.PingVPN(req.VpnType, name, address)
			return map[string]any{"status": "success", "data": map[string]any{"time": t, "target": address}}, err
		})
	case "toggle_wifi":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			name, _ := req.Data["name"].(string)
			disabled, _ := req.Data["disabled"].(string)
			return map[string]any{"status": "success"}, c.ToggleWiFi(name, disabled)
		})
	case "edit_wifi":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			return map[string]any{"status": "success"}, c.EditWiFi(req.Data)
		})
	case "batch_edit_wifis":
		a.withRosClient(w, cfg, false, func(c *rosapi.Client) (any, error) {
			wifis, _ := req.Data["wifis"].([]any)
			return map[string]any{"status": "success"}, c.BatchEditWiFis(wifis)
		})
	default:
		writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": "ros action not implemented: " + req.Action})
	}
}

func (a *API) withRosClient(w http.ResponseWriter, cfg rosapi.Config, save bool, fn func(*rosapi.Client) (any, error)) {
	client, err := rosapi.Dial(cfg)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
		return
	}
	defer client.Close()
	if save {
		_ = rosapi.SaveConfig(a.baseDir, cfg)
	}
	res, err := fn(client)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (a *API) handleRosGetConfig(w http.ResponseWriter) {
	cfg, exists, err := rosapi.LoadConfig(a.baseDir)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"status": "error", "message": err.Error()})
		return
	}
	if !exists {
		writeJSON(w, http.StatusOK, map[string]any{"status": "success", "exists": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "success", "exists": true, "config": cfg})
}
