package rosapi

import (
	"fmt"
	"strings"
)

func (c *Client) VPNs(vpnType string) ([]map[string]any, error) {
	menu, err := vpnMenu(vpnType)
	if err != nil {
		return nil, err
	}
	rows, err := c.Run(menu+"/print", "=.proplist=.id,name,connect-to,user,password,disabled,running,use-ipsec,ipsec-secret,comment")
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, map[string]any{
			"id":          row[".id"],
			"name":        row["name"],
			"connectTo":   row["connect-to"],
			"user":        row["user"],
			"password":    row["password"],
			"disabled":    row["disabled"],
			"running":     row["running"],
			"useIpsec":    row["use-ipsec"],
			"ipsecSecret": row["ipsec-secret"],
			"comment":     row["comment"],
		})
	}
	return out, nil
}

func (c *Client) ToggleVPN(vpnType, name, disabled string) error {
	menu, err := vpnMenu(vpnType)
	if err != nil {
		return err
	}
	return c.RunNoResult(menu+"/set", "=.id="+name, "=disabled="+disabled)
}

func (c *Client) AddOrEditVPN(vpnType string, data map[string]any, edit bool) error {
	menu, err := vpnMenu(vpnType)
	if err != nil {
		return err
	}
	name := strings.TrimSpace(fmt.Sprint(data["name"]))
	if name == "" {
		return fmt.Errorf("VPN 名称不能为空")
	}
	args := []string{menu + "/add"}
	if edit {
		args = []string{menu + "/set", "=.id=" + name}
	}
	args = append(args,
		"=name="+name,
		"=connect-to="+strings.TrimSpace(fmt.Sprint(data["connectTo"])),
		"=user="+strings.TrimSpace(fmt.Sprint(data["user"])),
		"=password="+fmt.Sprint(data["password"]),
	)
	if vpnType == "l2tp" {
		useIPSec := boolFromAny(data["useIpsec"])
		if useIPSec {
			args = append(args, "=use-ipsec=yes", "=ipsec-secret="+fmt.Sprint(data["ipsecSecret"]))
		} else {
			args = append(args, "=use-ipsec=no")
		}
	}
	return c.RunNoResult(args...)
}

func (c *Client) BatchEditVPNs(vpnType string, vpns []any) error {
	for _, item := range vpns {
		data, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if err := c.AddOrEditVPN(vpnType, data, true); err != nil {
			if err := c.AddOrEditVPN(vpnType, data, false); err != nil {
				return err
			}
		}
	}
	return nil
}

func (c *Client) PingVPN(vpnType, name, fallbackAddress string) (string, error) {
	name = strings.TrimSpace(name)
	address := strings.TrimSpace(fallbackAddress)
	if address == "" {
		if connectTo, err := c.VPNConnectTo(vpnType, name); err == nil {
			address = connectTo
		}
	}
	if address == "" {
		return "", fmt.Errorf("VPN 服务器地址不能为空")
	}
	return c.pingAddress(address)
}

func (c *Client) VPNConnectTo(vpnType, name string) (string, error) {
	menu, err := vpnMenu(vpnType)
	if err != nil {
		return "", err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("VPN 名称不能为空")
	}
	rows, err := c.Run(menu+"/print", "=.proplist=.id,name,connect-to", "?name="+name)
	if err != nil {
		return "", err
	}
	for _, row := range rows {
		if connectTo := strings.TrimSpace(row["connect-to"]); connectTo != "" {
			return connectTo, nil
		}
	}
	rows, err = c.Run(menu+"/print", "=.proplist=.id,name,connect-to")
	if err != nil {
		return "", err
	}
	for _, row := range rows {
		if row[".id"] == name || row["name"] == name {
			if connectTo := strings.TrimSpace(row["connect-to"]); connectTo != "" {
				return connectTo, nil
			}
		}
	}
	return "", fmt.Errorf("未找到 VPN 服务器地址")
}

func (c *Client) pingAddress(address string) (string, error) {
	rows, err := c.Run("/ping", "=address="+address, "=count=3")
	if err != nil {
		return "", err
	}
	lastStatus := ""
	for i := len(rows) - 1; i >= 0; i-- {
		if status := strings.TrimSpace(rows[i]["status"]); status != "" {
			lastStatus = status
		}
		if t := rows[i]["avg-rtt"]; t != "" {
			return t, nil
		}
		if t := rows[i]["time"]; t != "" {
			return t, nil
		}
	}
	if lastStatus != "" {
		return "", fmt.Errorf("%s: %s", address, lastStatus)
	}
	return "", fmt.Errorf("%s 无响应", address)
}

func (c *Client) VPNRemoteAddress(vpnType, name string) (string, error) {
	menu, err := vpnMenu(vpnType)
	if err != nil {
		return "", err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("VPN 名称不能为空")
	}
	rows, err := c.Run(menu+"/monitor", "=.id="+name, "=once=", "=.proplist=status,remote-address")
	if err != nil {
		return "", err
	}
	for _, row := range rows {
		if status := strings.ToLower(row["status"]); status != "" && status != "connected" {
			return "", fmt.Errorf("VPN 未连接: %s", row["status"])
		}
		if remote := strings.TrimSpace(row["remote-address"]); remote != "" {
			return remote, nil
		}
	}
	return "", fmt.Errorf("未获取到 VPN 对端地址")
}

func vpnMenu(vpnType string) (string, error) {
	switch strings.ToLower(vpnType) {
	case "l2tp":
		return "/interface/l2tp-client", nil
	case "pptp":
		return "/interface/pptp-client", nil
	case "sstp":
		return "/interface/sstp-client", nil
	default:
		return "", fmt.Errorf("不支持的 VPN 类型: %s", vpnType)
	}
}

func boolFromAny(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case string:
		return x == "true" || x == "yes" || x == "1"
	default:
		return false
	}
}
