const { ref, onMounted, computed, watch } = Vue;

export default {
    name: 'PcPage',
    template: `
        <div class="space-y-4 relative animate-fade-in">
            <div class="bg-white p-4 md:p-6 rounded-xl shadow-sm flex flex-col space-y-4 border border-gray-100">
                
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h2 class="font-bold text-gray-800 text-lg flex items-center whitespace-nowrap">
                        <span class="mr-2">🖥️</span> 局域网终端管理
                    </h2>
                    
                    <div class="flex items-center gap-3 w-full sm:w-auto">
                        <div class="relative w-full sm:w-64">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </div>
                            <input v-model="searchQuery" type="text" placeholder="搜索主机名、IP 或 MAC..." class="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors">
                            <button v-if="searchQuery" @click="searchQuery = ''" class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        <button @click="refreshCurrentServer" :disabled="isLoading" class="p-2 rounded-md hover:bg-gray-100 text-gray-500 transition-all focus:outline-none border border-gray-200 bg-gray-50" title="刷新当前列表">
                            <svg :class="{'animate-spin text-indigo-500': isLoading}" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="border-t border-gray-100 pt-4">
                    <div class="flex space-x-1 bg-gray-100/80 p-1 rounded-lg overflow-x-auto w-full">
                        <button v-for="srv in dhcpServers" :key="srv"
                                @click="setActiveServer(srv)"
                                :class="{'bg-white text-indigo-600 shadow-sm font-bold': activeServer === srv, 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50': activeServer !== srv}"
                                class="px-4 py-2 rounded-md text-sm transition-all flex items-center whitespace-nowrap">
                            <span class="mr-1.5 opacity-80 text-xs">🌐</span> {{ srv }}
                        </button>
                        <span v-if="dhcpServers.length === 0 && !isLoading" class="px-4 py-2 text-sm text-gray-400">未检测到 DHCP 服务</span>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-gray-200 text-sm text-gray-600 font-medium bg-white">
                            <th class="p-4 w-12 text-center">状态</th>
                            <th class="p-4">主机名 / 备注</th>
                            <th class="p-4">IP / MAC 地址</th>
                            <th class="p-4 bg-orange-50/50 w-44">ROS 强制路由 (VPN)</th>
                            <th class="p-4 bg-indigo-50/50 w-56">代理节点 / 智能分流</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="isLoading && pcList.length === 0" class="border-b border-gray-100 bg-gray-50/30">
                            <td colspan="5" class="p-8 text-center text-gray-400">正在获取 [{{ activeServer }}] 终端与路由结构...</td>
                        </tr>
                        <tr v-else-if="!isLoading && paginatedPcList.length === 0" class="border-b border-gray-100 bg-gray-50/30">
                            <td colspan="5" class="p-8 text-center text-gray-400">
                                {{ searchQuery ? '没有找到匹配的终端设备' : (errorMessage || '该服务下暂无分配记录') }}
                            </td>
                        </tr>
                        
                        <tr v-for="pc in paginatedPcList" :key="pc.mac" class="border-b border-gray-100 hover:bg-gray-50 transition text-sm bg-white">
                            <td class="p-4 text-center">
                                <span v-if="pc.status === 'bound'" class="w-2.5 h-2.5 rounded-full bg-green-500 inline-block shadow-sm" title="在线 (Bound)"></span>
                                <span v-else class="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block shadow-sm" title="离线/其他"></span>
                            </td>
                            
                            <td class="p-4">
                                <div class="font-bold text-gray-800">{{ pc.name || 'Unknown Device' }}</div>
                                <div class="mt-1">
                                    <span v-if="pc.dynamic" class="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] uppercase font-bold tracking-wider">DHCP 动态</span>
                                    <span v-else class="px-1.5 py-0.5 bg-blue-100 text-blue-500 rounded text-[10px] uppercase font-bold tracking-wider">Static 静态</span>
                                </div>
                            </td>
                            
                            <td class="p-4">
                                <div class="font-mono text-blue-600 font-bold text-sm">{{ pc.ip }}</div>
                                <div class="font-mono text-gray-400 text-xs mt-0.5">{{ pc.mac }}</div>
                            </td>

                            <td class="p-4 bg-orange-50/20 border-r border-gray-100">
                                <select v-if="pc.ip" v-model="pc.rosTable" @change="changeRosRouting(pc)" class="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500 cursor-pointer w-full shadow-sm transition hover:border-orange-300">
                                    <option value="main">直连 (main)</option>
                                    <option value="proxy">交给代理 (proxy)</option>
                                    <option v-for="t in rosRoutingTables" :key="t" :value="t">VPN: {{ t }}</option>
                                </select>
                                <span v-else class="text-xs text-gray-400">-</span>
                            </td>
                            
                            <td class="p-4 bg-indigo-50/20">
                                <div v-if="pc.ip" class="space-y-2">
                                    <select v-model="pc.singboxProxy" @change="changeSingboxProxy(pc)" :disabled="pc.rosTable !== 'proxy'" class="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-indigo-500 cursor-pointer w-full shadow-sm hover:border-indigo-300 transition disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed">
                                        <option value="block">直连/未分配</option>
                                        <option v-for="n in proxyNodes" :key="n.tag" :value="n.tag">{{ n.tag }}</option>
                                    </select>
                                    <select v-model="pc.singboxPolicy" @change="changeSingboxPolicy(pc)" :disabled="pc.rosTable !== 'proxy' || pc.singboxProxy === 'block'" class="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-sky-500 cursor-pointer w-full shadow-sm disabled:opacity-50 disabled:bg-gray-100">
                                        <option value="all_proxy">全部代理</option>
                                        <option value="smart">智能分流</option>
                                    </select>
                                </div>
                                <span v-else class="text-xs text-gray-400">-</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
                </div>

                <div class="md:hidden divide-y divide-gray-100">
                    <div v-if="isLoading && pcList.length === 0" class="p-6 text-center text-sm text-gray-400">
                        正在获取 [{{ activeServer }}] 终端数据...
                    </div>
                    <div v-else-if="!isLoading && paginatedPcList.length === 0" class="p-6 text-center text-sm text-gray-400">
                        {{ searchQuery ? '没有找到匹配的终端设备' : (errorMessage || '该服务下暂无分配记录') }}
                    </div>
                    <div v-for="pc in paginatedPcList" :key="pc.mac" class="p-4 space-y-3 bg-white">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="flex items-center gap-2">
                                    <span v-if="pc.status === 'bound'" class="w-2.5 h-2.5 rounded-full bg-green-500 inline-block shrink-0"></span>
                                    <span v-else class="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block shrink-0"></span>
                                    <div class="font-bold text-gray-800 truncate">{{ pc.name || 'Unknown Device' }}</div>
                                </div>
                                <div class="mt-2">
                                    <span v-if="pc.dynamic" class="px-2 py-1 bg-gray-100 text-gray-500 rounded text-[10px] uppercase font-bold">DHCP 动态</span>
                                    <span v-else class="px-2 py-1 bg-blue-100 text-blue-500 rounded text-[10px] uppercase font-bold">Static 静态</span>
                                </div>
                            </div>
                        </div>

                        <div class="rounded-lg bg-gray-50 p-3 text-xs font-mono">
                            <div class="text-blue-600 font-bold break-all">{{ pc.ip }}</div>
                            <div class="text-gray-400 mt-1 break-all">{{ pc.mac }}</div>
                        </div>

                        <div class="space-y-2">
                            <select v-if="pc.ip" v-model="pc.rosTable" @change="changeRosRouting(pc)" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-500">
                                <option value="main">直连 (main)</option>
                                <option value="proxy">交给代理 (proxy)</option>
                                <option v-for="t in rosRoutingTables" :key="t" :value="t">VPN: {{ t }}</option>
                            </select>
                            <select v-if="pc.ip" v-model="pc.singboxProxy" @change="changeSingboxProxy(pc)" :disabled="pc.rosTable !== 'proxy'" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:bg-gray-100">
                                <option value="block">直连/未分配</option>
                                <option v-for="n in proxyNodes" :key="n.tag" :value="n.tag">{{ n.tag }}</option>
                            </select>
                            <select v-if="pc.ip" v-model="pc.singboxPolicy" @change="changeSingboxPolicy(pc)" :disabled="pc.rosTable !== 'proxy' || pc.singboxProxy === 'block'" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-sky-500 disabled:opacity-50 disabled:bg-gray-100">
                                <option value="all_proxy">全部代理</option>
                                <option value="smart">智能分流</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div v-if="filteredPcList.length > 0" class="bg-gray-50 px-4 py-3 border-t border-gray-100 flex items-center justify-between sm:px-6">
                    <div class="w-full flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                        <div>
                            <p class="text-sm text-gray-700">
                                显示第 <span class="font-medium">{{ (currentPage - 1) * pageSize + 1 }}</span> 到 
                                <span class="font-medium">{{ Math.min(currentPage * pageSize, filteredPcList.length) }}</span> 台设备，
                                共 <span class="font-medium">{{ filteredPcList.length }}</span> 台
                            </p>
                        </div>
                        <div>
                            <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                <button @click="currentPage--" :disabled="currentPage === 1" class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <span class="sr-only">上一页</span>
                                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                                </button>
                                
                                <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                    {{ currentPage }} / {{ totalPages }}
                                </span>
                                
                                <button @click="currentPage++" :disabled="currentPage === totalPages" class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <span class="sr-only">下一页</span>
                                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                </button>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    setup() {
        const pcList = ref([]);

        // 核心动态服务列表
        const dhcpServers = ref([]);
        const activeServer = ref('');

        // Sing-box 数据
        const proxyNodes = ref([]);
        const singboxRules = ref([]);

        // ROS 路由数据
        const rosRoutingTables = ref([]);
        const rosRoutingRules = ref([]);

        const isLoading = ref(false);
        const errorMessage = ref('');

        // 搜索与分页状态
        const searchQuery = ref('');
        const currentPage = ref(1);
        const pageSize = ref(10);

        const filteredPcList = computed(() => {
            if (!searchQuery.value) return pcList.value;
            const query = searchQuery.value.toLowerCase();
            return pcList.value.filter(pc => {
                const nameMatch = pc.name && pc.name.toLowerCase().includes(query);
                const ipMatch = pc.ip && pc.ip.includes(query);
                const macMatch = pc.mac && pc.mac.toLowerCase().includes(query);
                return nameMatch || ipMatch || macMatch;
            });
        });

        const totalPages = computed(() => {
            return Math.ceil(filteredPcList.value.length / pageSize.value) || 1;
        });

        const paginatedPcList = computed(() => {
            const start = (currentPage.value - 1) * pageSize.value;
            const end = start + pageSize.value;
            return filteredPcList.value.slice(start, end);
        });

        watch(searchQuery, () => {
            currentPage.value = 1;
        });

        const getRosPayload = () => {
            const savedRos = localStorage.getItem('rosConfig');
            return savedRos ? JSON.parse(savedRos) : null;
        };

        // 切换顶层 DHCP Server
        const setActiveServer = (srv) => {
            if (activeServer.value === srv) return;
            activeServer.value = srv;
            currentPage.value = 1;
            fetchData();
        };

        const refreshCurrentServer = () => {
            fetchData();
        };

        const notifySingboxDevicesChanged = (detail) => {
            window.dispatchEvent(new CustomEvent('singbox-devices-changed', {
                detail: { source: 'pc', ...detail }
            }));
        };

        // 初始化加载服务器列表
        const fetchServers = async () => {
            const payload = getRosPayload();
            if (!payload) return;

            try {
                const res = await fetch('api/ros', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'get_dhcp_servers', payload })
                }).then(r => r.json());

                if (res.status === 'success') {
                    dhcpServers.value = res.servers || [];
                    if (dhcpServers.value.length > 0 && !activeServer.value) {
                        activeServer.value = dhcpServers.value[0]; // 默认选中第一个
                    }
                }
            } catch (e) {
                console.error("获取 DHCP 服务列表失败", e);
            }
        };

        // 核心数据拉取 (动态根据 activeServer)
        const fetchData = async () => {
            const payload = getRosPayload();
            if (!payload) {
                errorMessage.value = '请先在系统设置中配置 RouterOS 凭证';
                return;
            }
            if (!activeServer.value) {
                return; // 没有服务则直接退出
            }

            isLoading.value = true;
            errorMessage.value = '';
            pcList.value = []; // 清空旧数据体验更好

            try {
                // 1. 获取底层代理节点和路由分流规则
                const sbRes = await fetch('api/action', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'get_data' })
                }).then(r => r.json());
                proxyNodes.value = sbRes.nodes || [];
                singboxRules.value = sbRes.rules || [];
                const singboxDeviceMap = new Map((sbRes.devices || []).map(d => [d.ip, d]));

                // 2. 获取 ROS 路由表和 Mangle 规则
                const routeRes = await fetch('api/ros', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'get_routing_data', payload })
                }).then(r => r.json());

                if (routeRes.status === 'success') {
                    rosRoutingTables.value = (routeRes.data.tables || []).filter(t => t !== 'main' && t !== 'proxy');
                    rosRoutingRules.value = routeRes.data.rules || [];
                }

                // 3. 根据当前选中的 activeServer 获取终端列表
                const rosRes = await fetch('api/ros', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        action: 'get_dhcp_leases',
                        payload: payload,
                        data: { dhcp_server: activeServer.value }
                    })
                }).then(r => r.json());

                if (rosRes.status === 'success') {
                    const rawPcs = rosRes.leases || [];

                    // 4. 将 PC 列表与 ROS Mangle、Sing-box 规则进行合并映射
                    pcList.value = rawPcs.map(pc => {
                        let assignedSingbox = 'block';
                        let assignedRosTable = 'main';

                        if (pc.ip) {
                            const sbDevice = singboxDeviceMap.get(pc.ip);
                            let assignedPolicy = 'all_proxy';
                            if (sbDevice) {
                                assignedSingbox = sbDevice.proxy || 'block';
                                assignedPolicy = sbDevice.policy || 'all_proxy';
                            } else {
                                const sbRule = singboxRules.value.find(r => r.source_ip_cidr && r.source_ip_cidr.includes(pc.ip));
                                if (sbRule && sbRule.outbound && sbRule.outbound !== 'direct' && sbRule.outbound !== 'dns-out') {
                                    assignedSingbox = sbRule.outbound;
                                }
                            }

                            const rosRule = rosRoutingRules.value.find(r => r.srcAddress === pc.ip);
                            if (rosRule && rosRule.table) {
                                assignedRosTable = rosRule.table;
                            }

                            return { ...pc, singboxProxy: assignedSingbox, singboxPolicy: assignedPolicy, rosTable: assignedRosTable, lastRosTable: assignedRosTable };
                        }

                        return { ...pc, singboxProxy: assignedSingbox, singboxPolicy: 'all_proxy', rosTable: assignedRosTable, lastRosTable: assignedRosTable };
                    });
                } else {
                    errorMessage.value = rosRes.message;
                }
            } catch (e) {
                errorMessage.value = '请求后端异常，请检查服务状态';
            } finally {
                isLoading.value = false;
            }
        };

        const changeRosRouting = async (pc) => {
            const payload = getRosPayload();
            if (!pc.ip || !payload) return;
            const previousRosTable = pc.lastRosTable || 'main';

            if (pc.rosTable !== 'proxy' && pc.singboxProxy !== 'block') {
                pc.singboxProxy = 'block';
                const sbRes = await fetch('api/action', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'change_proxy', payload: { tag: 'block', ip: pc.ip, policy: pc.singboxPolicy } })
                }).then(r => r.json());
                if (sbRes.status === 'success') {
                    notifySingboxDevicesChanged({ action: 'proxy', ip: pc.ip, proxy: 'block', policy: pc.singboxPolicy });
                }
            }

            try {
                const res = await fetch('api/ros', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        action: 'set_routing_rule',
                        payload,
                        data: {
                            cidr: pc.ip,
                            table: pc.rosTable,
                            previousTable: previousRosTable
                        }
                    })
                }).then(r => r.json());

                if(res.status !== 'success') {
                    alert("ROS 路由下发失败: " + res.message);
                } else {
                    pc.lastRosTable = pc.rosTable;
                }
            } catch (e) {
                console.error("通信异常", e);
            }
        };

        const changeSingboxProxy = async (pc) => {
            if (!pc.ip) return;
            try {
                const res = await fetch('api/action', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'change_proxy', payload: { tag: pc.singboxProxy, ip: pc.ip, policy: pc.singboxPolicy } })
                }).then(r => r.json());
                if (res.status !== 'success') {
                    alert(res.message || "修改代理分流失败，请重试");
                    fetchData();
                    return;
                }
                notifySingboxDevicesChanged({ action: 'proxy', ip: pc.ip, proxy: pc.singboxProxy, policy: pc.singboxPolicy });
            } catch (e) {
                console.error("PC 代理修改失败", e);
                alert("修改代理分流失败，请重试");
            }
        };

        const changeSingboxPolicy = async (pc) => {
            if (!pc.ip) return;
            try {
                const res = await fetch('api/action', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'change_device_policy', payload: { ip: pc.ip, policy: pc.singboxPolicy } })
                }).then(r => r.json());
                if (res.status !== 'success') {
                    alert(res.message || "修改智能分流失败，请重试");
                    fetchData();
                    return;
                }
                notifySingboxDevicesChanged({ action: 'policy', ip: pc.ip, proxy: pc.singboxProxy, policy: pc.singboxPolicy });
            } catch (e) {
                console.error("PC 智能分流修改失败", e);
                alert("修改智能分流失败，请重试");
            }
        };

        onMounted(async () => {
            await fetchServers();
            if (activeServer.value) {
                fetchData();
            }
        });

        return {
            pcList, proxyNodes, rosRoutingTables, isLoading, errorMessage,
            dhcpServers, activeServer, setActiveServer, refreshCurrentServer,
            searchQuery, currentPage, pageSize, totalPages, paginatedPcList, filteredPcList,
            fetchData, changeRosRouting, changeSingboxProxy, changeSingboxPolicy
        };
    }
};
