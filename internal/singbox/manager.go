package singbox

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"singbox-webui/internal/models"
	"singbox-webui/internal/store"
)

type Manager struct {
	baseDir    string
	store      *store.Store
	mu         sync.Mutex
	cmd        *exec.Cmd
	configPath string
}

func NewManager(baseDir string, st *store.Store) *Manager {
	return &Manager{
		baseDir:    baseDir,
		store:      st,
		configPath: filepath.Join(baseDir, "config.json"),
	}
}

func (m *Manager) BinaryPath() (string, error) {
	candidates := []string{"sing-box", "singbox", "sing-box.exe"}
	for _, name := range candidates {
		path := filepath.Join(m.baseDir, name)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path, nil
		}
	}
	return "", fmt.Errorf("未找到 sing-box 二进制，请放到程序目录: sing-box")
}

func (m *Manager) Apply() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cfg, err := m.buildFromStore()
	if err != nil {
		return err
	}
	if err := WriteConfig(m.configPath, cfg); err != nil {
		return err
	}
	return m.restartLocked()
}

func (m *Manager) buildFromStore() (map[string]any, error) {
	nodes, _ := m.store.LoadNodes()
	devices, _ := m.store.LoadDeviceModels()
	customRules, _ := m.store.LoadCustomRuleModels()
	dns, dnsMode := m.store.LoadDNS()
	return BuildConfig(BuildInput{
		BaseDir:     m.baseDir,
		DNS:         dns,
		DNSMode:     dnsMode,
		Nodes:       nodes,
		Devices:     devices,
		CustomRules: customRules,
	})
}

func (m *Manager) restartLocked() error {
	if m.cmd != nil && m.cmd.Process != nil {
		_ = m.cmd.Process.Signal(syscall.SIGTERM)
		done := make(chan struct{})
		go func() {
			_ = m.cmd.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			_ = m.cmd.Process.Kill()
		}
		m.cmd = nil
	}

	binary, err := m.BinaryPath()
	if err != nil {
		log.Printf("sing-box: %v", err)
		return nil
	}

	cmd := exec.Command(binary, "run", "-c", m.configPath)
	cmd.Dir = m.baseDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动 sing-box 失败: %w", err)
	}
	m.cmd = cmd
	log.Printf("sing-box started pid=%d config=%s", cmd.Process.Pid, m.configPath)
	return nil
}

func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cmd != nil && m.cmd.Process != nil {
		_ = m.cmd.Process.Signal(syscall.SIGTERM)
		_ = m.cmd.Wait()
		m.cmd = nil
	}
}

func (m *Manager) RouteRulesView() ([]map[string]any, error) {
	devices, err := m.store.LoadDeviceModels()
	if err != nil {
		return nil, err
	}
	return BuildRouteRulesView(devices), nil
}

func (m *Manager) BindDevice(ip, tag, policy string) error {
	if err := m.store.BindDevice(ip, tag, policy); err != nil {
		return err
	}
	return m.Apply()
}

func (m *Manager) SaveDevices(devices []models.Device) error {
	if err := m.store.SaveDeviceModels(devices); err != nil {
		return err
	}
	return m.Apply()
}

func (m *Manager) SaveNodes(nodes []map[string]any) error {
	if err := m.store.SaveNodes(nodes); err != nil {
		return err
	}
	return m.Apply()
}

func (m *Manager) SaveCustomRules(rules []models.CustomSmartRule) error {
	if err := m.store.SaveCustomRuleModels(rules); err != nil {
		return err
	}
	return m.Apply()
}

func (m *Manager) SaveDNS(dns, dnsMode string) error {
	if err := m.store.SaveDNS(dns, dnsMode); err != nil {
		return err
	}
	return m.Apply()
}
