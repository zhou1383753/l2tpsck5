// proxy-parser.js

// 安全的 Base64 编码与解码 (支持中文)
const safeDecodeB64 = (str) => {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    try { return decodeURIComponent(escape(atob(b64))); } catch (e) { return atob(b64); }
};

const safeEncodeB64 = (str) => {
    return btoa(unescape(encodeURIComponent(str)));
};

// ================= 解析逻辑 (不变) =================
const parseVmess = (url) => {
    const jsonStr = safeDecodeB64(url.slice(8));
    const v = JSON.parse(jsonStr);
    const out = { type: "vmess", tag: v.ps || "VMess-Node", server: v.add, server_port: parseInt(v.port), uuid: v.id, security: v.scy || "auto", alter_id: parseInt(v.aid || 0) };
    if (v.tls === "tls") out.tls = { enabled: true, server_name: v.sni || v.add, insecure: false };
    if (v.net && v.net !== "tcp") {
        out.transport = { type: v.net };
        if (v.net === "ws") { out.transport.path = v.path || "/"; if (v.host) out.transport.headers = { Host: v.host }; }
        else if (v.net === "grpc") out.transport.service_name = v.path;
    }
    return out;
};

const parseVlessOrTrojan = (url, protocol) => {
    const [main, hash] = url.split('#');
    const remarks = decodeURIComponent(hash || `${protocol.toUpperCase()}-Node`);
    const withoutScheme = main.split('://')[1];
    const [userPass, rest] = withoutScheme.split('@');
    const [serverPort, queryStr] = rest.split('?');
    const [server, port] = serverPort.split(':');

    const out = { type: protocol, tag: remarks, server: server, server_port: parseInt(port) };
    if (protocol === 'vless') { out.uuid = userPass; out.packet_encoding = 'xudp'; }
    if (protocol === 'trojan') out.password = userPass;

    if (!queryStr) return out;
    const params = new URLSearchParams(queryStr);
    if (params.get('flow')) out.flow = params.get('flow');

    const security = params.get('security');
    if (security === 'tls' || security === 'reality') {
        out.tls = { enabled: true, server_name: params.get('sni') || server, insecure: params.get('allowInsecure') === '1' };
        if (params.get('fp')) out.tls.utls = { enabled: true, fingerprint: params.get('fp') };
        if (security === 'reality') out.tls.reality = { enabled: true, public_key: params.get('pbk') || '', short_id: params.get('sid') || '' };
    }

    const type = params.get('type') || 'tcp';
    if (type !== 'tcp') {
        out.transport = { type: type };
        if (type === 'ws') { out.transport.path = params.get('path') || '/'; if (params.get('host')) out.transport.headers = { Host: params.get('host') }; }
        else if (type === 'grpc') out.transport.service_name = params.get('serviceName') || params.get('path');
    }
    return out;
};

const parseSS = (url) => {
    const [main, ...hashParts] = url.split('#');
    const hash = hashParts.join('#');
    const remarks = (hash && hash.trim() !== '') ? decodeURIComponent(hash) : 'SS-Node';
    let withoutScheme = main.substring(5);

    let queryStr = '';
    if (withoutScheme.includes('?')) {
        const qsParts = withoutScheme.split('?');
        queryStr = qsParts.pop();
        withoutScheme = qsParts.join('?');
    }

    let method, password, server, port;
    if (withoutScheme.includes('@')) {
        const parts = withoutScheme.split('@');
        const serverPortPart = parts.pop();
        const userPassPart = parts.join('@');
        const sp = serverPortPart.split(':');
        server = sp[0]; port = sp[1];
        if (userPassPart.includes(':') && /^[a-zA-Z0-9-]+:/.test(userPassPart)) {
            const upIndex = userPassPart.indexOf(':');
            method = userPassPart.substring(0, upIndex); password = userPassPart.substring(upIndex + 1);
        } else {
            const decodedUserPass = safeDecodeB64(userPassPart);
            const upIndex = decodedUserPass.indexOf(':');
            method = decodedUserPass.substring(0, upIndex); password = decodedUserPass.substring(upIndex + 1);
        }
    } else {
        const decoded = safeDecodeB64(withoutScheme);
        const parts = decoded.split('@');
        const serverPortPart = parts.pop();
        const userPassPart = parts.join('@');
        const upIndex = userPassPart.indexOf(':');
        method = userPassPart.substring(0, upIndex); password = userPassPart.substring(upIndex + 1);
        const sp = serverPortPart.split(':');
        server = sp[0]; port = sp[1];
    }

    if (method.startsWith('2022-')) password = password.replace(/-/g, '+').replace(/_/g, '/').trim();
    const out = { type: 'shadowsocks', tag: remarks, server, server_port: parseInt(port), method, password };

    if (queryStr) {
        const params = new URLSearchParams(queryStr);
        if (params.get('udp_over_tcp') === 'true' || params.get('uot') === '1') out.multiplex = { enabled: true, protocol: 'h2mux', max_connections: 4 };
    }
    return out;
};

const parseHy2 = (url) => {
    const [main, hash] = url.split('#');
    const remarks = decodeURIComponent(hash || 'HY2-Node');

    // 🌟 修复点：不要用 substring(6)，改用 split('://')[1] 来自动适应不同长度的协议头
    const withoutScheme = main.split('://')[1];

    const [userPass, rest] = withoutScheme.split('@');
    const [serverPort, queryStr] = rest.split('?');
    const [server, port] = serverPort.split(':');

    const out = { type: 'hysteria2', tag: remarks, server: server, server_port: parseInt(port), password: userPass };
    if (queryStr) {
        const params = new URLSearchParams(queryStr);
        out.up_mbps = parseInt(params.get('upmbps') || 0) || undefined;
        out.down_mbps = parseInt(params.get('downmbps') || 0) || undefined;
        out.tls = { enabled: true, server_name: params.get('sni') || server, insecure: params.get('insecure') === '1' };
        const alpn = params.get('alpn');
        if (alpn) out.tls.alpn = alpn.split(',').map(v => v.trim()).filter(Boolean);
        const obfs = params.get('obfs');
        if (obfs) out.obfs = { type: obfs, password: params.get('obfs-password') || params.get('obfs_password') || '' };
    }
    return out;
};

const parseAnyTLS = (url) => {
    const [main, hash] = url.split('#');
    const remarks = decodeURIComponent(hash || 'AnyTLS-Node');
    const withoutScheme = main.split('://')[1];
    if (!withoutScheme || !withoutScheme.includes('@')) throw new Error('无效的 AnyTLS 链接');

    const [password, rest] = withoutScheme.split('@');
    const [serverPort, queryStr] = rest.split('?');
    const portIndex = serverPort.lastIndexOf(':');
    if (portIndex <= 0) throw new Error('无效的 AnyTLS 地址');
    const server = serverPort.substring(0, portIndex);
    const port = serverPort.substring(portIndex + 1);

    const out = {
        type: 'anytls',
        tag: remarks,
        server,
        server_port: parseInt(port),
        password: decodeURIComponent(password || '')
    };

    const params = new URLSearchParams(queryStr || '');
    const security = params.get('security');
    const sni = params.get('sni') || params.get('peer') || params.get('host');
    if (security === 'tls' || sni || params.get('allowInsecure') || params.get('insecure')) {
        out.tls = {
            enabled: true,
            server_name: sni || server,
            insecure: params.get('allowInsecure') === '1' || params.get('insecure') === '1' || params.get('insecure') === 'true'
        };
        const alpn = params.get('alpn');
        if (alpn) out.tls.alpn = alpn.split(',').map(v => v.trim()).filter(Boolean);
    }

    return out;
};


// ================= 🔮 新增：还原链接逻辑 =================
const buildVmess = (n) => {
    const v = {
        v: "2",
        ps: n.tag || "",
        add: n.server,
        port: String(n.server_port),
        id: n.uuid || "",
        aid: String(n.alter_id || 0),
        scy: n.security || "auto",
        net: n.transport?.type || "tcp",
        type: "none",
        tls: n.tls?.enabled ? "tls" : ""
    };
    if (n.tls?.server_name) v.sni = n.tls.server_name;
    if (n.transport?.path) v.path = n.transport.path;
    if (n.transport?.headers?.Host) v.host = n.transport.headers.Host;
    if (n.transport?.type === 'grpc') v.path = n.transport.service_name;

    return 'vmess://' + safeEncodeB64(JSON.stringify(v));
};

const buildVlessOrTrojan = (n, protocol) => {
    const auth = protocol === 'vless' ? n.uuid : n.password;
    let url = `${protocol}://${auth}@${n.server}:${n.server_port}`;
    const params = new URLSearchParams();

    if (n.transport?.type) params.set('type', n.transport.type);
    if (n.tls?.enabled) {
        params.set('security', n.tls.reality ? 'reality' : 'tls');
        if (n.tls.server_name) params.set('sni', n.tls.server_name);
        if (n.tls.insecure) params.set('allowInsecure', '1');
        if (n.tls.utls?.fingerprint) params.set('fp', n.tls.utls.fingerprint);
        if (n.tls.reality) {
            if (n.tls.reality.public_key) params.set('pbk', n.tls.reality.public_key);
            if (n.tls.reality.short_id) params.set('sid', n.tls.reality.short_id);
        }
    }
    if (protocol === 'vless' && n.flow) params.set('flow', n.flow);

    if (n.transport?.type === 'ws') {
        if (n.transport.path) params.set('path', n.transport.path);
        if (n.transport.headers?.Host) params.set('host', n.transport.headers.Host);
    } else if (n.transport?.type === 'grpc') {
        if (n.transport.service_name) params.set('serviceName', n.transport.service_name);
    }

    const qs = params.toString();
    if (qs) url += '?' + qs;
    url += '#' + encodeURIComponent(n.tag || `${protocol}-Node`);
    return url;
};

const buildSS = (n) => {
    const auth = safeEncodeB64(`${n.method}:${n.password}`);
    let url = `ss://${auth}@${n.server}:${n.server_port}`;
    if (n.multiplex?.enabled) url += '?uot=1';
    url += '#' + encodeURIComponent(n.tag || 'SS-Node');
    return url;
};

const buildHy2 = (n) => {
    let url = `hy2://${n.password}@${n.server}:${n.server_port}`;
    const params = new URLSearchParams();
    if (n.tls?.server_name) params.set('sni', n.tls.server_name);
    if (n.tls?.insecure) params.set('insecure', '1');
    if (n.tls?.alpn?.length) params.set('alpn', n.tls.alpn.join(','));
    if (n.obfs?.type) {
        params.set('obfs', n.obfs.type);
        if (n.obfs.password) params.set('obfs-password', n.obfs.password);
    }
    if (n.up_mbps) params.set('upmbps', n.up_mbps);
    if (n.down_mbps) params.set('downmbps', n.down_mbps);

    const qs = params.toString();
    if (qs) url += '?' + qs;
    url += '#' + encodeURIComponent(n.tag || 'HY2-Node');
    return url;
};

const buildAnyTLS = (n) => {
    let url = `anytls://${encodeURIComponent(n.password || '')}@${n.server}:${n.server_port}`;
    const params = new URLSearchParams();
    params.set('type', 'tcp');
    if (n.tls?.enabled) {
        params.set('security', 'tls');
        if (n.tls.server_name) params.set('sni', n.tls.server_name);
        if (n.tls.insecure) params.set('insecure', '1');
        if (n.tls.alpn?.length) params.set('alpn', n.tls.alpn.join(','));
    }

    const qs = params.toString();
    if (qs) url += '?' + qs;
    url += '#' + encodeURIComponent(n.tag || 'AnyTLS-Node');
    return url;
};

const buildSocks = (n) => {
    // 基础部分：服务器IP和端口
    let result = `${n.server}:${n.server_port}`;

    // 如果有用户名和密码，则追加到后面
    if (n.username && n.password) {
        result += `:${n.username}:${n.password}`;
    }
    return result;
};

// 暴露全局入口
window.ProxyParser = {
    // 导入时调用
    parseLine: (line) => {
        if (line.startsWith('vmess://')) return parseVmess(line);
        if (line.startsWith('vless://')) return parseVlessOrTrojan(line, 'vless');
        if (line.startsWith('trojan://')) return parseVlessOrTrojan(line, 'trojan');
        if (line.startsWith('ss://')) return parseSS(line);
        // 🌟 识别时，hy2和hysteria2都丢给 parseHy2 处理
        if (line.startsWith('hy2://') || line.startsWith('hysteria2://')) return parseHy2(line);
        if (line.startsWith('anytls://')) return parseAnyTLS(line);
        throw new Error("未识别协议");
    },
    // 导出时调用
    buildUrl: (node) => {
        const type = node.type || 'socks';
        if (type === 'vmess') return buildVmess(node);
        if (type === 'vless') return buildVlessOrTrojan(node, 'vless');
        if (type === 'trojan') return buildVlessOrTrojan(node, 'trojan');
        if (type === 'shadowsocks' || type === 'ss') return buildSS(node);
        if (type === 'hysteria2' || type === 'hy2') return buildHy2(node);
        if (type === 'anytls') return buildAnyTLS(node);

        return buildSocks(node); // 兜底全按 Socks5 处理
    }
};
