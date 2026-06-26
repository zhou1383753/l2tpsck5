package rosapi

import (
	"bufio"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Server   string `json:"server"`
	IP       string `json:"ip,omitempty"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type Client struct {
	conn net.Conn
	rw   *bufio.ReadWriter
}

func ConfigFromPayload(payload map[string]any) Config {
	cfg := Config{Port: 8728, Username: "admin"}
	if payload == nil {
		return cfg
	}
	if v, ok := payload["server"].(string); ok {
		cfg.Server = strings.TrimSpace(v)
	}
	if v, ok := payload["ip"].(string); ok {
		cfg.IP = strings.TrimSpace(v)
		if cfg.Server == "" {
			cfg.Server = cfg.IP
		}
	}
	if v, ok := payload["username"].(string); ok && strings.TrimSpace(v) != "" {
		cfg.Username = strings.TrimSpace(v)
	}
	if v, ok := payload["password"].(string); ok {
		cfg.Password = v
	}
	switch v := payload["port"].(type) {
	case float64:
		cfg.Port = int(v)
	case int:
		cfg.Port = v
	case string:
		if p, err := strconv.Atoi(v); err == nil {
			cfg.Port = p
		}
	}
	if cfg.Port == 0 {
		cfg.Port = 8728
	}
	return cfg
}

func LoadConfig(baseDir string) (Config, bool, error) {
	path := filepath.Join(baseDir, "ros.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Config{}, false, nil
		}
		return Config{}, false, err
	}
	var cfg Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return Config{}, false, err
	}
	if cfg.Server == "" {
		cfg.Server = cfg.IP
	}
	if cfg.Port == 0 {
		cfg.Port = 8728
	}
	if cfg.Username == "" {
		cfg.Username = "admin"
	}
	return cfg, true, nil
}

func SaveConfig(baseDir string, cfg Config) error {
	if cfg.Server == "" {
		cfg.Server = cfg.IP
	}
	if cfg.IP == "" {
		cfg.IP = cfg.Server
	}
	if cfg.Port == 0 {
		cfg.Port = 8728
	}
	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(baseDir, "ros.json"), raw, 0o600)
}

func Dial(cfg Config) (*Client, error) {
	if cfg.Server == "" {
		cfg.Server = cfg.IP
	}
	if cfg.Server == "" {
		return nil, fmt.Errorf("RouterOS IP 不能为空")
	}
	if cfg.Port == 0 {
		cfg.Port = 8728
	}
	if cfg.Username == "" {
		cfg.Username = "admin"
	}
	address := net.JoinHostPort(cfg.Server, strconv.Itoa(cfg.Port))
	conn, err := net.DialTimeout("tcp", address, 5*time.Second)
	if err != nil {
		return nil, err
	}
	client := &Client{conn: conn, rw: bufio.NewReadWriter(bufio.NewReader(conn), bufio.NewWriter(conn))}
	if err := client.login(cfg.Username, cfg.Password); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return client, nil
}

func (c *Client) Close() {
	if c != nil && c.conn != nil {
		_ = c.conn.Close()
	}
}

func (c *Client) Run(args ...string) ([]map[string]string, error) {
	if len(args) == 0 {
		return nil, fmt.Errorf("empty RouterOS command")
	}
	if err := c.writeSentence(args); err != nil {
		return nil, err
	}
	return c.readReply()
}

func (c *Client) RunNoResult(args ...string) error {
	_, err := c.Run(args...)
	return err
}

func (c *Client) login(username, password string) error {
	if err := c.writeSentence([]string{"/login", "=name=" + username, "=password=" + password}); err != nil {
		return err
	}
	rows, err := c.readReply()
	if err == nil {
		_ = rows
		return nil
	}

	if err := c.writeSentence([]string{"/login", "=name=" + username}); err != nil {
		return err
	}
	reply, err := c.readRawReply()
	if err != nil {
		return err
	}
	ret := ""
	for _, sentence := range reply {
		if sentence.kind == "!done" {
			ret = sentence.attrs["ret"]
		}
	}
	if ret == "" {
		return fmt.Errorf("RouterOS 登录失败")
	}
	challenge, err := hex.DecodeString(ret)
	if err != nil {
		return err
	}
	sum := md5.Sum(append(append([]byte{0}, []byte(password)...), challenge...))
	response := "00" + hex.EncodeToString(sum[:])
	if err := c.writeSentence([]string{"/login", "=name=" + username, "=response=" + response}); err != nil {
		return err
	}
	_, err = c.readReply()
	return err
}

func (c *Client) writeSentence(words []string) error {
	_ = c.conn.SetDeadline(time.Now().Add(15 * time.Second))
	for _, word := range words {
		if err := c.writeWord(word); err != nil {
			return err
		}
	}
	if err := c.writeWord(""); err != nil {
		return err
	}
	return c.rw.Flush()
}

func (c *Client) writeWord(word string) error {
	data := []byte(word)
	if err := c.writeLen(len(data)); err != nil {
		return err
	}
	_, err := c.rw.Write(data)
	return err
}

func (c *Client) writeLen(length int) error {
	switch {
	case length < 0x80:
		return c.rw.WriteByte(byte(length))
	case length < 0x4000:
		_, err := c.rw.Write([]byte{byte(length>>8) | 0x80, byte(length)})
		return err
	case length < 0x200000:
		_, err := c.rw.Write([]byte{byte(length>>16) | 0xC0, byte(length >> 8), byte(length)})
		return err
	case length < 0x10000000:
		_, err := c.rw.Write([]byte{byte(length>>24) | 0xE0, byte(length >> 16), byte(length >> 8), byte(length)})
		return err
	default:
		_, err := c.rw.Write([]byte{0xF0, byte(length >> 24), byte(length >> 16), byte(length >> 8), byte(length)})
		return err
	}
}

type sentence struct {
	kind  string
	attrs map[string]string
}

func (c *Client) readReply() ([]map[string]string, error) {
	reply, err := c.readRawReply()
	if err != nil {
		return nil, err
	}
	rows := []map[string]string{}
	for _, sentence := range reply {
		switch sentence.kind {
		case "!re":
			rows = append(rows, sentence.attrs)
		case "!trap", "!fatal":
			msg := firstNonEmpty(sentence.attrs["message"], sentence.attrs["category"], sentence.kind)
			return nil, fmt.Errorf(msg)
		}
	}
	return rows, nil
}

func (c *Client) readRawReply() ([]sentence, error) {
	_ = c.conn.SetDeadline(time.Now().Add(20 * time.Second))
	out := []sentence{}
	for {
		words, err := c.readSentence()
		if err != nil {
			return nil, err
		}
		if len(words) == 0 {
			continue
		}
		s := sentence{kind: words[0], attrs: map[string]string{}}
		for _, word := range words[1:] {
			if strings.HasPrefix(word, "=") {
				parts := strings.SplitN(word[1:], "=", 2)
				if len(parts) == 2 {
					s.attrs[parts[0]] = parts[1]
				}
			}
		}
		out = append(out, s)
		if s.kind == "!done" {
			return out, nil
		}
		if s.kind == "!fatal" {
			return out, fmt.Errorf(firstNonEmpty(s.attrs["message"], "RouterOS fatal error"))
		}
	}
}

func (c *Client) readSentence() ([]string, error) {
	words := []string{}
	for {
		word, err := c.readWord()
		if err != nil {
			return nil, err
		}
		if word == "" {
			return words, nil
		}
		words = append(words, word)
	}
}

func (c *Client) readWord() (string, error) {
	length, err := c.readLen()
	if err != nil {
		return "", err
	}
	if length == 0 {
		return "", nil
	}
	buf := make([]byte, length)
	if _, err := io.ReadFull(c.rw, buf); err != nil {
		return "", err
	}
	return string(buf), nil
}

func (c *Client) readLen() (int, error) {
	b, err := c.rw.ReadByte()
	if err != nil {
		return 0, err
	}
	switch {
	case b&0x80 == 0x00:
		return int(b), nil
	case b&0xC0 == 0x80:
		b2, err := c.rw.ReadByte()
		return (int(b&^0xC0) << 8) | int(b2), err
	case b&0xE0 == 0xC0:
		buf := make([]byte, 2)
		_, err := io.ReadFull(c.rw, buf)
		return (int(b&^0xE0) << 16) | (int(buf[0]) << 8) | int(buf[1]), err
	case b&0xF0 == 0xE0:
		buf := make([]byte, 3)
		_, err := io.ReadFull(c.rw, buf)
		return (int(b&^0xF0) << 24) | (int(buf[0]) << 16) | (int(buf[1]) << 8) | int(buf[2]), err
	default:
		buf := make([]byte, 4)
		_, err := io.ReadFull(c.rw, buf)
		return (int(buf[0]) << 24) | (int(buf[1]) << 16) | (int(buf[2]) << 8) | int(buf[3]), err
	}
}
