package rosapi

import (
	"fmt"
	"strings"
)

func (c *Client) WiFis() ([]map[string]any, error) {
	rows, err := c.Run("/interface/wireless/print", "=.proplist=.id,name,ssid,mac-address,disabled,master-interface,default-name")
	if err != nil {
		return nil, err
	}
	security, _ := c.wirelessPasswords()
	cidrs, _ := c.interfaceCIDRs()
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		name := row["name"]
		out = append(out, map[string]any{
			"id":          row[".id"],
			"name":        name,
			"ssid":        row["ssid"],
			"macAddress":  row["mac-address"],
			"disabled":    row["disabled"],
			"ipAddress":   firstNonEmpty(cidrs[name], "未分配网段"),
			"passphrase":  security[name],
			"defaultName": row["default-name"],
		})
	}
	if len(out) > 0 {
		return out, nil
	}
	return c.wifiWave2()
}

func (c *Client) wifiWave2() ([]map[string]any, error) {
	rows, err := c.Run("/interface/wifi/print", "=.proplist=.id,name,ssid,mac-address,disabled,configuration")
	if err != nil {
		return []map[string]any{}, nil
	}
	cidrs, _ := c.interfaceCIDRs()
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		name := row["name"]
		out = append(out, map[string]any{
			"id":         row[".id"],
			"name":       name,
			"ssid":       row["ssid"],
			"macAddress": row["mac-address"],
			"disabled":   row["disabled"],
			"ipAddress":  firstNonEmpty(cidrs[name], "未分配网段"),
			"passphrase": "",
		})
	}
	return out, nil
}

func (c *Client) wirelessPasswords() (map[string]string, error) {
	profiles, err := c.Run("/interface/wireless/security-profiles/print", "=.proplist=name,wpa-pre-shared-key,wpa2-pre-shared-key")
	if err != nil {
		return map[string]string{}, nil
	}
	profilePass := map[string]string{}
	for _, row := range profiles {
		profilePass[row["name"]] = firstNonEmpty(row["wpa2-pre-shared-key"], row["wpa-pre-shared-key"])
	}
	wifis, err := c.Run("/interface/wireless/print", "=.proplist=name,security-profile")
	if err != nil {
		return map[string]string{}, nil
	}
	out := map[string]string{}
	for _, row := range wifis {
		out[row["name"]] = profilePass[row["security-profile"]]
	}
	return out, nil
}

func (c *Client) interfaceCIDRs() (map[string]string, error) {
	rows, err := c.Run("/ip/address/print", "=.proplist=interface,address,network")
	if err != nil {
		return map[string]string{}, err
	}
	out := map[string]string{}
	for _, row := range rows {
		iface := row["interface"]
		addr := row["address"]
		if iface == "" || addr == "" {
			continue
		}
		out[iface] = addr
	}
	return out, nil
}

func (c *Client) ToggleWiFi(name, disabled string) error {
	if err := c.RunNoResult("/interface/wireless/set", "=.id="+name, "=disabled="+disabled); err == nil {
		return nil
	}
	return c.RunNoResult("/interface/wifi/set", "=.id="+name, "=disabled="+disabled)
}

func (c *Client) EditWiFi(data map[string]any) error {
	name := strings.TrimSpace(fmt.Sprint(data["name"]))
	if name == "" {
		return fmt.Errorf("WiFi 名称不能为空")
	}
	args := []string{"/interface/wireless/set", "=.id=" + name}
	if ssid := strings.TrimSpace(fmt.Sprint(data["ssid"])); ssid != "" {
		args = append(args, "=ssid="+ssid)
	}
	if mac := strings.TrimSpace(fmt.Sprint(data["macAddress"])); mac != "" {
		args = append(args, "=mac-address="+mac)
	}
	if err := c.RunNoResult(args...); err != nil {
		args[0] = "/interface/wifi/set"
		if err2 := c.RunNoResult(args...); err2 != nil {
			return err
		}
	}
	return nil
}

func (c *Client) BatchEditWiFis(wifis []any) error {
	for _, item := range wifis {
		data, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if err := c.EditWiFi(data); err != nil {
			return err
		}
	}
	return nil
}
