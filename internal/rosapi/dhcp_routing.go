package rosapi

import (
	"fmt"
	"net"
	"regexp"
	"strings"
)

func (c *Client) DHCPServers() ([]string, error) {
	rows, err := c.Run("/ip/dhcp-server/print", "=.proplist=name")
	if err != nil {
		return nil, err
	}
	servers := make([]string, 0, len(rows))
	for _, row := range rows {
		if name := row["name"]; name != "" {
			servers = append(servers, name)
		}
	}
	return servers, nil
}

func (c *Client) DHCPLeases(server string) ([]map[string]any, error) {
	args := []string{"/ip/dhcp-server/lease/print", "=.proplist=.id,address,mac-address,host-name,comment,status,dynamic,server,disabled"}
	if server != "" {
		args = append(args, "?server="+server)
	}
	rows, err := c.Run(args...)
	if err != nil {
		return nil, err
	}
	leases := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		name := firstNonEmpty(row["host-name"], row["comment"])
		leases = append(leases, map[string]any{
			"id":       row[".id"],
			"name":     name,
			"ip":       row["address"],
			"mac":      row["mac-address"],
			"status":   row["status"],
			"dynamic":  parseROSBool(row["dynamic"]),
			"server":   row["server"],
			"disabled": row["disabled"],
		})
	}
	return leases, nil
}

func (c *Client) RoutingData() (map[string]any, error) {
	tables, err := c.routingTables()
	if err != nil {
		return nil, err
	}
	rules, err := c.addressListRoutingRules()
	if err != nil {
		return nil, err
	}
	mangleRules, err := c.mangleRoutingRules()
	if err == nil {
		rules = append(rules, mangleRules...)
	}
	return map[string]any{"tables": tables, "rules": dedupeRoutingRules(rules)}, nil
}

func (c *Client) routingTables() ([]string, error) {
	rows, err := c.Run("/routing/table/print", "=.proplist=name,disabled")
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{"main": true, "proxy": true}
	tables := []string{"main", "proxy"}
	for _, row := range rows {
		if row["disabled"] == "true" {
			continue
		}
		name := row["name"]
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		tables = append(tables, name)
	}
	return tables, nil
}

func (c *Client) addressListRoutingRules() ([]map[string]any, error) {
	rows, err := c.Run("/ip/firewall/address-list/print", "=.proplist=.id,list,address,comment,disabled")
	if err != nil {
		return nil, err
	}
	rules := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if row["disabled"] == "true" {
			continue
		}
		table := tableFromAddressList(row["list"])
		if table == "" {
			continue
		}
		addr := normalizePlainCIDR(row["address"])
		if addr == "" {
			continue
		}
		rules = append(rules, map[string]any{
			"id":         row[".id"],
			"srcAddress": addr,
			"table":      table,
			"comment":    row["comment"],
			"source":     "address-list",
		})
	}
	return rules, nil
}

func tableFromAddressList(list string) string {
	list = strings.TrimSpace(list)
	if list == "proxy_clients" {
		return "proxy"
	}
	if strings.HasSuffix(list, "_clients") {
		return strings.TrimSuffix(list, "_clients")
	}
	return ""
}

func addressListFromTable(table string) string {
	table = strings.TrimSpace(table)
	if table == "" || table == "main" || table == "block" {
		return ""
	}
	if table == "proxy" {
		return "proxy_clients"
	}
	return table + "_clients"
}

func (c *Client) mangleRoutingRules() ([]map[string]any, error) {
	rows, err := c.Run("/ip/firewall/mangle/print", "=.proplist=.id,chain,src-address,new-routing-mark,new-routing-table,action,comment,disabled")
	if err != nil {
		return nil, err
	}
	rules := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if row["chain"] != "prerouting" || row["disabled"] == "true" {
			continue
		}
		table := firstNonEmpty(row["new-routing-table"], row["new-routing-mark"])
		if table == "" {
			continue
		}
		src := normalizePlainCIDR(row["src-address"])
		if src == "" {
			continue
		}
		rules = append(rules, map[string]any{
			"id":         row[".id"],
			"srcAddress": src,
			"table":      table,
			"comment":    row["comment"],
			"source":     "mangle",
		})
	}
	return rules, nil
}

func (c *Client) SetRoutingRule(cidr, table, previousTable string, skipNat bool) error {
	cidr = normalizePlainCIDR(cidr)
	if cidr == "" {
		return fmt.Errorf("cidr 不能为空")
	}
	if table == "" {
		table = "main"
	}
	if err := c.removeAddressListEntries(cidr); err != nil {
		return err
	}
	if err := c.removeDirectMangleRules(cidr); err != nil {
		return err
	}
	list := addressListFromTable(table)
	if list == "" {
		return nil
	}
	if err := c.ensureRoutingPlumbing(table, list); err != nil {
		return err
	}
	return c.RunNoResult(
		"/ip/firewall/address-list/add",
		"=list="+list,
		"=address="+cidr,
		"=comment=AutoRoute_"+list+"_"+cidr,
	)
}

func (c *Client) ensureRoutingPlumbing(table, list string) error {
	if err := c.ensureMangleRule(table, list); err != nil {
		return err
	}
	if iface := vpnInterfaceFromTable(table); iface != "" {
		if err := c.ensureVPNMasquerade(iface); err != nil {
			return err
		}
	}
	return nil
}

func (c *Client) ensureMangleRule(table, list string) error {
	rows, err := c.Run("/ip/firewall/mangle/print", "=.proplist=.id,chain,src-address-list,new-routing-mark,new-routing-table,action,disabled")
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row["chain"] != "prerouting" || row["disabled"] == "true" {
			continue
		}
		mark := firstNonEmpty(row["new-routing-table"], row["new-routing-mark"])
		if row["src-address-list"] == list && mark == table {
			return nil
		}
	}
	return c.RunNoResult(
		"/ip/firewall/mangle/add",
		"=chain=prerouting",
		"=action=mark-routing",
		"=new-routing-mark="+table,
		"=passthrough=no",
		"=src-address-list="+list,
		"=comment=AutoRoute_"+list+"_mangle",
	)
}

func (c *Client) ensureVPNMasquerade(iface string) error {
	rows, err := c.Run("/ip/firewall/nat/print", "=.proplist=.id,chain,action,out-interface,src-address,disabled")
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row["disabled"] == "true" {
			continue
		}
		if row["chain"] == "srcnat" && row["action"] == "masquerade" && row["out-interface"] == iface && row["src-address"] == "100.100.1.0/24" {
			return nil
		}
	}
	return c.RunNoResult(
		"/ip/firewall/nat/add",
		"=chain=srcnat",
		"=action=masquerade",
		"=out-interface="+iface,
		"=src-address=100.100.1.0/24",
		"=comment=AutoRoute_"+iface+"_masquerade",
	)
}

func vpnInterfaceFromTable(table string) string {
	match := regexp.MustCompile(`^out([0-9]+)$`).FindStringSubmatch(table)
	if len(match) != 2 {
		return ""
	}
	return "IP-" + match[1]
}

func (c *Client) removeAddressListEntries(cidr string) error {
	rows, err := c.Run("/ip/firewall/address-list/print", "=.proplist=.id,list,address", "?address="+cidr)
	if err != nil {
		return err
	}
	for _, row := range rows {
		if tableFromAddressList(row["list"]) == "" {
			continue
		}
		if id := row[".id"]; id != "" {
			if err := c.RunNoResult("/ip/firewall/address-list/remove", "=.id="+id); err != nil {
				return err
			}
		}
	}
	return nil
}

func (c *Client) removeDirectMangleRules(cidr string) error {
	rows, err := c.Run("/ip/firewall/mangle/print", "=.proplist=.id,chain,src-address,comment", "?chain=prerouting")
	if err != nil {
		return err
	}
	for _, row := range rows {
		if normalizePlainCIDR(row["src-address"]) != cidr {
			continue
		}
		comment := row["comment"]
		if !strings.Contains(comment, "singbox-webui route") && !strings.Contains(comment, "AutoRoute_") {
			continue
		}
		if id := row[".id"]; id != "" {
			if err := c.RunNoResult("/ip/firewall/mangle/remove", "=.id="+id); err != nil {
				return err
			}
		}
	}
	return nil
}

func dedupeRoutingRules(rules []map[string]any) []map[string]any {
	seen := map[string]bool{}
	out := make([]map[string]any, 0, len(rules))
	for _, rule := range rules {
		key := fmt.Sprint(rule["srcAddress"]) + "|" + fmt.Sprint(rule["table"])
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, rule)
	}
	return out
}

func normalizePlainCIDR(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if strings.Contains(value, "/") {
		return value
	}
	if ip := net.ParseIP(value); ip != nil {
		return value
	}
	return value
}

func parseROSBool(value string) bool {
	return value == "true" || value == "yes"
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
