# singbox-webui 重写版
#20260627  改动
## 核心架构（与原版 app 一致）

```
浏览器 → index.html
           ↓ fetch /api/*
        Go 程序 (app/webui)
           ↓ 读写
        webui.db        ← 节点列表、设备绑定、DNS 设置（面板数据）
        config.json     ← Sing-box 实际运行的配置（outbounds / route / dns）
           ↓
        sing-box 二进制  ← ./sing-box run -c config.json
```

**app 二进制就做两件事：**

1. **提供前端 API** — 静态页面 + `/api/action`、`/api/license` 等
2. **改 config.json** — 把 webui.db 里的节点/设备/分流规则合并写进 `config.json`，再重载 sing-box

RouterOS（VPN/WiFi/DHCP）在路由器上自己配，后端不管。

## 范围

- ✅ 代理 CRUD、设备绑定、`change_proxy`、智能分流、DNS
- ✅ 直接读写 `config.json`（不再用 runtime-config.json）
- ✅ 同目录 `sing-box` 二进制启动
- ✅ 固定授权 JSON
- ✅ `rules/geoip-cn.srs`

## 目录

```
app/
  sing-box       # sing-box 二进制
  config.json    # Sing-box 配置（API 会自动改写）
  rules/geoip-cn.srs
  webui.db       # 面板业务数据
  index.html     # 前端
  server/        # Go 源码
```

## 编译

```bash
cd server
go mod tidy
GOOS=linux GOARCH=amd64 go build -o ../webui .
```

运行（与原版区分，编译产物叫 `webui`，避免覆盖原 `app`）：

```bash
cd ..
./webui -addr :8080 -dir .
```

若要替换原程序：

```bash
GOOS=linux GOARCH=amd64 go build -o ../app .
```

## 工作流程

1. 前端调用 API（如 `add_parsed_nodes`、`change_proxy`）
2. 后端更新 `webui.db`
3. 读取当前 `config.json` → 合并节点/设备/路由规则 → **写回 config.json**
4. 重启 `./sing-box run -c config.json`

## 智能分流

设备 `policy=smart` 且存在 `rules/geoip-cn.srs` 时：

- 该设备源 IP + 国内 GeoIP → `direct`
- 其余流量 → 绑定的代理节点

`policy=all_proxy` 时全部走绑定节点。
