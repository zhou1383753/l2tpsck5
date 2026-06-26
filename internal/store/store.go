package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db      *sql.DB
	baseDir string
}

func Open(baseDir string) (*Store, error) {
	dbPath := filepath.Join(baseDir, "webui.db")
	if err := ensureSQLiteDatabase(dbPath); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	return &Store{db: db, baseDir: baseDir}, nil
}

func ensureSQLiteDatabase(dbPath string) error {
	info, err := os.Stat(dbPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if info.IsDir() || info.Size() == 0 {
		return nil
	}

	file, err := os.Open(dbPath)
	if err != nil {
		return err
	}
	defer file.Close()

	header := make([]byte, 16)
	n, err := file.Read(header)
	if err != nil && n == 0 {
		return err
	}
	if n >= 16 && string(header) == "SQLite format 3\x00" {
		return nil
	}

	backupPath := dbPath + ".legacy-" + time.Now().Format("20060102150405")
	if err := os.Rename(dbPath, backupPath); err != nil {
		return fmt.Errorf("backup legacy webui.db: %w", err)
	}
	return nil
}

func (s *Store) Close() error {
	if s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) GetJSON(key string, dest any) error {
	var raw []byte
	err := s.db.QueryRow(`SELECT value FROM kv WHERE key = ?`, key).Scan(&raw)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, dest)
}

func (s *Store) GetString(key string) (string, error) {
	var raw []byte
	err := s.db.QueryRow(`SELECT value FROM kv WHERE key = ?`, key).Scan(&raw)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func (s *Store) PutJSON(key string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, raw)
	return err
}

func (s *Store) ReadDeviceNameFile() string {
	path := filepath.Join(s.baseDir, "device_name.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	var data struct {
		Name string `json:"name"`
	}
	if json.Unmarshal(raw, &data) == nil {
		return data.Name
	}
	return string(raw)
}

func (s *Store) WriteDeviceNameFile(name string) error {
	path := filepath.Join(s.baseDir, "device_name.json")
	raw, err := json.Marshal(map[string]string{"name": name})
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o644)
}

func (s *Store) LoadNodes() ([]map[string]any, error) {
	var nodes []map[string]any
	if err := s.GetJSON("nodes", &nodes); err == nil {
		return nodes, nil
	}
	return []map[string]any{}, nil
}

func (s *Store) SaveNodes(nodes []map[string]any) error {
	return s.PutJSON("nodes", nodes)
}

func (s *Store) LoadDevices() ([]map[string]any, error) {
	var devices []map[string]any
	if err := s.GetJSON("devices", &devices); err == nil {
		return devices, nil
	}
	return []map[string]any{}, nil
}

func (s *Store) SaveDevices(devices []map[string]any) error {
	return s.PutJSON("devices", devices)
}

func (s *Store) LoadRules() ([]map[string]any, error) {
	var rules []map[string]any
	if err := s.GetJSON("rules", &rules); err == nil {
		return rules, nil
	}
	return []map[string]any{}, nil
}

func (s *Store) SaveRules(rules []map[string]any) error {
	return s.PutJSON("rules", rules)
}

func (s *Store) LoadCustomSmartRules() ([]map[string]any, error) {
	var rules []map[string]any
	if err := s.GetJSON("custom_smart_rules", &rules); err == nil {
		return rules, nil
	}
	return []map[string]any{}, nil
}

func (s *Store) SaveCustomSmartRules(rules []map[string]any) error {
	return s.PutJSON("custom_smart_rules", rules)
}

func (s *Store) LoadDNS() (dns string, dnsMode string) {
	dnsMode = "normal"
	if v, err := s.GetString("dns"); err == nil && v != "" {
		dns = v
	}
	if v, err := s.GetString("dns_mode"); err == nil && v != "" {
		dnsMode = v
	}
	if dns == "" {
		dns = "223.5.5.5"
	}
	return dns, dnsMode
}

func (s *Store) SaveDNS(dns, dnsMode string) error {
	if _, err := s.db.Exec(`INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, "dns", []byte(dns)); err != nil {
		return fmt.Errorf("save dns: %w", err)
	}
	if _, err := s.db.Exec(`INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, "dns_mode", []byte(dnsMode)); err != nil {
		return fmt.Errorf("save dns_mode: %w", err)
	}
	return nil
}
