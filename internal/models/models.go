package models

type Device struct {
	IP     string `json:"ip"`
	Proxy  string `json:"proxy"`
	Policy string `json:"policy"`
}

type CustomSmartRule struct {
	ID       string `json:"id"`
	Target   string `json:"target"`
	Type     string `json:"type"`
	Outbound string `json:"outbound"`
	Enabled  bool   `json:"enabled"`
}

const (
	PolicyAllProxy = "all_proxy"
	PolicySmart    = "smart"
	ProxyBlock     = "block"
)
