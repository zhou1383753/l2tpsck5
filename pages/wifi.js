export default {
    template: `
        <div class="space-y-4 relative">
            <div class="bg-white p-4 md:p-6 rounded-xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center border border-gray-100 gap-4">
                <div class="flex items-center space-x-3">
                    <h2 class="font-bold text-gray-800 text-lg">RouterOS WiFi 策略分流</h2>
                    <button @click="fetchData" :disabled="isLoading" class="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-all focus:outline-none" title="刷新数据">
                        <svg :class="{'animate-spin text-indigo-500': isLoading}" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                    </button>
                </div>
                
                <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center w-full sm:w-auto">
                    <button @click="batchChangeMacs" class="whitespace-nowrap px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-sm font-medium transition-colors border border-indigo-200">
                        一键随机换 MAC
                    </button>
                    
                    <div class="relative w-full sm:w-64">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>
                        <input v-model="searchQuery" type="text" placeholder="搜索名称、SSID 或 MAC..." class="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors">
                        <button v-if="searchQuery" @click="searchQuery = ''" class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-gray-200 text-sm text-gray-600 font-medium bg-white">
                            <th class="p-4">无线接口</th>
                            <th class="p-4">WiFi 密码</th>
                            <th class="p-4">所属网段</th>
                            <th class="p-4 bg-orange-50/50 w-44">ROS 强制路由 (VPN)</th>
                            <th class="p-4 bg-indigo-50/50 w-56">代理节点 / 智能分流</th>
                            <th class="p-4 text-center">状态</th>
                            <th class="p-4 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="isLoading && wifiList.length === 0" class="border-b border-gray-100 bg-gray-50/30">
                            <td colspan="7" class="p-8 text-center text-gray-400">正在与 RouterOS 通信获取路由结构...</td>
                        </tr>
                        <tr v-else-if="!isLoading && paginatedWifiList.length === 0" class="border-b border-gray-100 bg-gray-50/30">
                            <td colspan="7" class="p-8 text-center text-gray-400">
                                {{ searchQuery ? '没有找到匹配的 WiFi 接口' : (errorMessage || '暂无数据') }}
                            </td>
                        </tr>
                        
                        <tr v-for="wifi in paginatedWifiList" :key="wifi.name" class="border-b border-gray-100 hover:bg-gray-50 transition text-sm bg-white">
                            <td class="p-4">
                                <div class="font-bold text-gray-700">{{ wifi.name }}</div>
                                <div class="text-xs text-blue-500 font-mono mt-0.5">SSID: {{ wifi.ssid || '未设置' }}</div>
                                <div class="text-xs text-gray-400 font-mono mt-0.5">MAC: {{ wifi.macAddress || '未知' }}</div>
                            </td>
                            <td class="p-4 font-mono text-orange-600 text-xs break-all">{{ wifi.passphrase || '-' }}</td>
                            <td class="p-4 font-mono text-indigo-600 text-xs font-bold">{{ wifi.ipAddress || '未分配网段' }}</td>
                            
                            <td class="p-4 bg-orange-50/20 border-r border-gray-100">
                                <select v-if="wifi.ipAddress && wifi.ipAddress !== '未分配网段'" v-model="wifi.rosTable" @change="changeRosRouting(wifi)" class="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-orange-500 cursor-pointer w-full shadow-sm">
                                    <option value="block">禁止联网 (block)</option>
                                    <option value="proxy">交给 (proxy)</option>
                                    <option v-for="t in rosRoutingTables" :key="t" :value="t">VPN: {{ t }}</option>
                                </select>
                                <span v-else class="text-xs text-gray-400">需先在ROS分配IP</span>
                            </td>

                            <td class="p-4 bg-indigo-50/20">
                                <div v-if="wifi.ipAddress && wifi.ipAddress !== '未分配网段'" class="space-y-2">
                                    <select v-model="wifi.singboxProxy" @change="changeSingboxProxy(wifi)" :disabled="wifi.rosTable !== 'proxy'" class="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-indigo-500 cursor-pointer w-full shadow-sm disabled:opacity-50 disabled:bg-gray-100">
                                        <option value="block">直连/未分配</option>
                                        <option v-for="n in proxyNodes" :key="n.tag" :value="n.tag">{{ n.tag }}</option>
                                    </select>
                                    <select v-model="wifi.singboxPolicy" @change="changeSingboxPolicy(wifi)" :disabled="wifi.rosTable !== 'proxy' || wifi.singboxProxy === 'block'" class="border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-sky-500 cursor-pointer w-full shadow-sm disabled:opacity-50 disabled:bg-gray-100">
                                        <option value="all_proxy">全部代理</option>
                                        <option value="smart">智能分流</option>
                                    </select>
                                </div>
                                <span v-else class="text-xs text-gray-400">-</span>
                            </td>
                            
                            <td class="p-4 text-center">
                                <span v-if="wifi.disabled === 'false' || wifi.disabled === false" class="bg-green-100 text-green-600 px-2 py-1 rounded text-xs font-medium">运行中</span>
                                <span v-else class="bg-gray-100 text-gray-500 px-2 py-1 rounded text-xs font-medium">已停用</span>
                            </td>
                            <td class="p-4 text-right">
                                <button @click="openEditModal(wifi)" class="text-indigo-500 hover:underline text-xs font-bold mr-3">编辑</button>
                                <button @click="toggleStatus(wifi)" :class="(wifi.disabled === 'false' || wifi.disabled === false) ? 'text-red-500' : 'text-green-500'" class="hover:underline text-xs font-bold">
                                    {{ (wifi.disabled === 'false' || wifi.disabled === false) ? '禁用' : '启动' }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                </div>

                <div class="md:hidden divide-y divide-gray-100">
                    <div v-if="isLoading && wifiList.length === 0" class="p-6 text-center text-sm text-gray-400">
                        正在获取 RouterOS 无线数据...
                    </div>
                    <div v-else-if="!isLoading && paginatedWifiList.length === 0" class="p-6 text-center text-sm text-gray-400">
                        {{ searchQuery ? '没有找到匹配的 WiFi 接口' : (errorMessage || '暂无数据') }}
                    </div>
                    <div v-for="wifi in paginatedWifiList" :key="wifi.name" class="p-4 space-y-3 bg-white">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="font-bold text-gray-800 truncate">{{ wifi.name }}</div>
                                <div class="text-xs text-blue-500 font-mono mt-1 truncate">SSID: {{ wifi.ssid || '未设置' }}</div>
                                <div class="text-xs text-gray-400 font-mono mt-0.5 break-all">MAC: {{ wifi.macAddress || '未知' }}</div>
                                <div class="text-xs text-orange-600 font-mono mt-0.5 break-all">密码: {{ wifi.passphrase || '-' }}</div>
                            </div>
                            <span v-if="wifi.disabled === 'false' || wifi.disabled === false" class="bg-green-100 text-green-600 px-2 py-1 rounded text-xs font-medium shrink-0">运行中</span>
                            <span v-else class="bg-gray-100 text-gray-500 px-2 py-1 rounded text-xs font-medium shrink-0">已停用</span>
                        </div>

                        <div class="rounded-lg bg-gray-50 p-3 text-xs font-mono text-indigo-600 font-bold break-all">
                            {{ wifi.ipAddress || '未分配网段' }}
                        </div>

                        <div class="space-y-2">
                            <select v-if="wifi.ipAddress && wifi.ipAddress !== '未分配网段'" v-model="wifi.rosTable" @change="changeRosRouting(wifi)" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-500">
                                <option value="block">禁止联网 (block)</option>
                                <option value="proxy">交给 (proxy)</option>
                                <option v-for="t in rosRoutingTables" :key="t" :value="t">VPN: {{ t }}</option>
                            </select>
                            <select v-if="wifi.ipAddress && wifi.ipAddress !== '未分配网段'" v-model="wifi.singboxProxy" @change="changeSingboxProxy(wifi)" :disabled="wifi.rosTable !== 'proxy'" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:bg-gray-100">
                                <option value="block">直连/未分配</option>
                                <option v-for="n in proxyNodes" :key="n.tag" :value="n.tag">{{ n.tag }}</option>
                            </select>
                            <select v-if="wifi.ipAddress && wifi.ipAddress !== '未分配网段'" v-model="wifi.singboxPolicy" @change="changeSingboxPolicy(wifi)" :disabled="wifi.rosTable !== 'proxy' || wifi.singboxProxy === 'block'" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-sky-500 disabled:opacity-50 disabled:bg-gray-100">
                                <option value="all_proxy">全部代理</option>
                                <option value="smart">智能分流</option>
                            </select>
                        </div>

                        <div class="grid grid-cols-2 gap-2">
                            <button @click="openEditModal(wifi)" class="bg-indigo-50 text-indigo-600 py-2 rounded-lg text-xs font-bold">编辑</button>
                            <button @click="toggleStatus(wifi)" :class="(wifi.disabled === 'false' || wifi.disabled === false) ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'" class="py-2 rounded-lg text-xs font-bold">
                                {{ (wifi.disabled === 'false' || wifi.disabled === false) ? '禁用' : '启动' }}
                            </button>
                        </div>
                    </div>
                </div>

                <div v-if="filteredWifiList.length > 0" class="bg-gray-50 px-4 py-3 border-t border-gray-100 flex items-center justify-between sm:px-6">
                    <div class="w-full flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                        <div>
                            <p class="text-sm text-gray-700">
                                显示第 <span class="font-medium">{{ (currentPage - 1) * pageSize + 1 }}</span> 到 
                                <span class="font-medium">{{ Math.min(currentPage * pageSize, filteredWifiList.length) }}</span> 条记录，
                                共 <span class="font-medium">{{ filteredWifiList.length }}</span> 条
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

            <div v-if="showEditModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 transition-opacity p-3">
                <div class="bg-white rounded-xl p-4 md:p-6 w-full max-w-sm shadow-xl">
                    <div class="flex justify-between items-center mb-5">
                        <h3 class="font-bold text-lg text-gray-800">编辑 WiFi ({{ editingWifi?.name }})</h3>
                        <button @click="showEditModal = false" class="text-gray-400 hover:text-gray-600 focus:outline-none">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">SSID 名称</label>
                            <input v-model="editForm.ssid" type="text" placeholder="输入新的 SSID" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">MAC 地址</label>
                            <input v-model="editForm.macAddress" type="text" placeholder="例如: 00:11:22:33:44:55" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">WiFi 密码</label>
                            <input v-model="editForm.passphrase" type="text" placeholder="输入新的 WiFi 密码" autocomplete="new-password" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                        </div>
                    </div>
                    
                    <div class="mt-6 flex justify-end space-x-3">
                        <button @click="showEditModal = false" class="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">取消</button>
                        <button @click="submitEdit" class="px-4 py-2 text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 rounded-lg transition-colors">保存修改</button>
                    </div>
                </div>
            </div>

        </div>
    `,
    setup() {
        const { ref, onMounted, computed, watch } = Vue;

        const wifiList = ref([]);
        const proxyNodes = ref([]);
        const singboxRules = ref([]);
        const rosRoutingTables = ref([]);
        const rosRoutingRules = ref([]);
        const isLoading = ref(false);
        const errorMessage = ref('');

        const showEditModal = ref(false);
        const editingWifi = ref(null);
        const editForm = ref({ ssid: '', macAddress: '', passphrase: '' });

        const searchQuery = ref('');
        const currentPage = ref(1);
        const pageSize = ref(10);

        const filteredWifiList = computed(() => {
            if (!searchQuery.value) return wifiList.value;

            const query = searchQuery.value.toLowerCase();
            return wifiList.value.filter(wifi => {
                const nameMatch = wifi.name && wifi.name.toLowerCase().includes(query);
                const ssidMatch = wifi.ssid && wifi.ssid.toLowerCase().includes(query);
                const macMatch = wifi.macAddress && wifi.macAddress.toLowerCase().includes(query);
                return nameMatch || ssidMatch || macMatch;
            });
        });

        const totalPages = computed(() => {
            return Math.ceil(filteredWifiList.value.length / pageSize.value) || 1;
        });

        const paginatedWifiList = computed(() => {
            const start = (currentPage.value - 1) * pageSize.value;
            const end = start + pageSize.value;
            return filteredWifiList.value.slice(start, end);
        });

        watch(searchQuery, () => {
            currentPage.value = 1;
        });

        const getRosPayload = () => {
            const savedRos = localStorage.getItem('rosConfig');
            return savedRos ? JSON.parse(savedRos) : null;
        };

        const notifySingboxDevicesChanged = (detail) => {
            window.dispatchEvent(new CustomEvent('singbox-devices-changed', {
                detail: { source: 'wifi', ...detail }
            }));
        };

        // 集成更安全的随机 MAC 生成逻辑
        const generateRandomMac = () => {
            const hexDigits = "0123456789ABCDEF";
            const safeSecondChars = "26AE";

            const firstChar = hexDigits.charAt(Math.floor(Math.random() * 16));
            const secondChar = safeSecondChars.charAt(Math.floor(Math.random() * 4));

            let mac = `${firstChar}${secondChar}:`;

            for (let i = 0; i < 5; i++) {
                mac += hexDigits.charAt(Math.floor(Math.random() * 16));
                mac += hexDigits.charAt(Math.floor(Math.random() * 16));
                if (i < 4) mac += ":";
            }

            return mac;
        };

        const batchChangeMacs = async () => {
            const listToUpdate = filteredWifiList.value;
            if (listToUpdate.length === 0) return;

            if (!confirm(`确定要为当前列表中的 ${listToUpdate.length} 个 WiFi 接口全部重新生成随机 MAC 地址吗？\n注意：这会导致这些接口的现有无线连接短暂断开。`)) {
                return;
            }

            const payload = getRosPayload();
            if (!payload) return;

            const updates = listToUpdate.map(wifi => ({
                name: wifi.name,
                macAddress: generateRandomMac()
            }));

            try {
                const res = await fetch('api/ros', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        action: 'batch_edit_wifis',
                        payload,
                        data: { wifis: updates }
                    })
                }).then(r => r.json());

                if (res.status === 'success') {
                    alert('批量更换 MAC 地址成功！');
                    fetchData();
                } else {
                    alert('批量修改失败: ' + res.message);
                }
            } catch (e) {
                alert('请求异常: ' + e.message);
            }
        };

        const fetchData = async () => {
            const payload = getRosPayload();
            if (!payload) {
                errorMessage.value = '请先配置 RouterOS 凭证';
                return;
            }

            isLoading.value = true;

            try {
                const sbRes = await fetch('api/action', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'get_data' })
                }).then(r => r.json());
                proxyNodes.value = sbRes.nodes || [];
                singboxRules.value = sbRes.rules || [];
                const singboxDeviceMap = new Map((sbRes.devices || []).map(d => [d.ip, d]));

                const routeRes = await fetch('api/ros', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'get_routing_data', payload })
                }).then(r => r.json());

                if(routeRes.status === 'success') {
                    rosRoutingTables.value = (routeRes.data.tables || []).filter(t => t !== 'main' && t !== 'proxy');
                    rosRoutingRules.value = routeRes.data.rules || [];
                }

                const res = await fetch('api/ros', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'get_wifis', payload })
                }).then(r => r.json());

                if (res.status === 'success') {
                    const rawWifis = res.data || [];

                    wifiList.value = rawWifis.map(wifi => {
                        const networkCidr = wifi.ipAddress;

                        let assignedSingbox = 'block';
                        let assignedPolicy = 'all_proxy';
                        if (networkCidr && networkCidr !== '未分配网段') {
                            const sbDevice = singboxDeviceMap.get(networkCidr);
                            if (sbDevice) {
                                assignedSingbox = sbDevice.proxy || 'block';
                                assignedPolicy = sbDevice.policy || 'all_proxy';
                            } else {
                                const sbRule = singboxRules.value.find(r => r.source_ip_cidr && r.source_ip_cidr.includes(networkCidr));
                                if (sbRule && sbRule.outbound && sbRule.outbound !== 'direct' && sbRule.outbound !== 'dns-out') {
                                    assignedSingbox = sbRule.outbound;
                                }
                            }
                        }

                        let assignedRosTable = 'block';
                        if (networkCidr && networkCidr !== '未分配网段') {
                            const rosRule = rosRoutingRules.value.find(r => r.srcAddress === networkCidr);
                            if (rosRule && rosRule.table) {
                                assignedRosTable = rosRule.table;
                            }
                        }

                        return { ...wifi, networkCidr, singboxProxy: assignedSingbox, singboxPolicy: assignedPolicy, rosTable: assignedRosTable, lastRosTable: assignedRosTable };
                    });
                } else {
                    errorMessage.value = res.message;
                }
            } catch (e) {
                errorMessage.value = '请求后端异常';
            } finally {
                isLoading.value = false;
            }
        };

        const changeRosRouting = async (wifi) => {
            const payload = getRosPayload();
            if (!wifi.networkCidr || wifi.networkCidr === '未分配网段' || !payload) return;
            const previousRosTable = wifi.lastRosTable || 'block';

            if (wifi.rosTable !== 'proxy' && wifi.singboxProxy !== 'block') {
                wifi.singboxProxy = 'block';
                const sbRes = await fetch('api/action', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'change_proxy', payload: { tag: 'block', ip: wifi.networkCidr, policy: wifi.singboxPolicy } })
                }).then(r => r.json());
                if (sbRes.status === 'success') {
                    notifySingboxDevicesChanged({ action: 'proxy', ip: wifi.networkCidr, proxy: 'block', policy: wifi.singboxPolicy });
                }
            }

            try {
                const res = await fetch('api/ros', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        action: 'set_routing_rule',
                        payload,
                        data: {
                            cidr: wifi.networkCidr,
                            table: wifi.rosTable,
                            previousTable: previousRosTable,
                            skipNat: wifi.rosTable === 'main'
                        }
                    })
                }).then(r => r.json());

                if(res.status !== 'success') {
                    alert("ROS 路由下发失败: " + res.message);
                } else {
                    wifi.lastRosTable = wifi.rosTable;
                }
            } catch (e) {
                console.error("通信异常");
            }
        };

        const changeSingboxProxy = async (wifi) => {
            if (!wifi.networkCidr || wifi.networkCidr === '未分配网段') return;
            try {
                const res = await fetch('api/action', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'change_proxy', payload: { tag: wifi.singboxProxy, ip: wifi.networkCidr, policy: wifi.singboxPolicy } })
                }).then(r => r.json());
                if (res.status !== 'success') {
                    alert(res.message || "修改代理分流失败，请重试");
                    fetchData();
                    return;
                }
                notifySingboxDevicesChanged({ action: 'proxy', ip: wifi.networkCidr, proxy: wifi.singboxProxy, policy: wifi.singboxPolicy });
            } catch (e) {
                console.error("WiFi 代理修改失败", e);
                alert("修改代理分流失败，请重试");
            }
        };

        const changeSingboxPolicy = async (wifi) => {
            if (!wifi.networkCidr || wifi.networkCidr === '未分配网段') return;
            try {
                const res = await fetch('api/action', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'change_device_policy', payload: { ip: wifi.networkCidr, policy: wifi.singboxPolicy } })
                }).then(r => r.json());
                if (res.status !== 'success') {
                    alert(res.message || "修改智能分流失败，请重试");
                    fetchData();
                    return;
                }
                notifySingboxDevicesChanged({ action: 'policy', ip: wifi.networkCidr, proxy: wifi.singboxProxy, policy: wifi.singboxPolicy });
            } catch (e) {
                console.error("WiFi 智能分流修改失败", e);
                alert("修改智能分流失败，请重试");
            }
        };

        const toggleStatus = async (wifi) => {
            const payload = getRosPayload();
            if (!payload) return;
            const targetStatus = (wifi.disabled === 'false' || wifi.disabled === false) ? 'yes' : 'no';
            try {
                const res = await fetch('api/ros', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'toggle_wifi', payload, data: { name: wifi.name, disabled: targetStatus } })
                }).then(r => r.json());
                if (res.status === 'success') fetchData();
            } catch (e) { alert('请求异常'); }
        };

        const openEditModal = (wifi) => {
            editingWifi.value = wifi;
            editForm.value = {
                ssid: wifi.ssid || '',
                macAddress: wifi.macAddress || '',
                passphrase: wifi.passphrase || ''
            };
            showEditModal.value = true;
        };

        const submitEdit = async () => {
            const payload = getRosPayload();
            if (!payload) return;

            try {
                const res = await fetch('api/ros', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        action: 'edit_wifi',
                        payload,
                        data: {
                            name: editingWifi.value.name,
                            ssid: editForm.value.ssid,
                            macAddress: editForm.value.macAddress,
                            passphraseChanged: editForm.value.passphrase !== (editingWifi.value.passphrase || ''),
                            passphrase: editForm.value.passphrase
                        }
                    })
                }).then(r => r.json());

                if (res.status === 'success') {
                    showEditModal.value = false;
                    fetchData();
                } else {
                    alert('修改失败: ' + res.message);
                }
            } catch (e) {
                alert('请求异常');
            }
        };

        onMounted(() => fetchData());

        return {
            wifiList, proxyNodes, rosRoutingTables, isLoading, errorMessage, fetchData,
            changeRosRouting, changeSingboxProxy, changeSingboxPolicy, toggleStatus,
            showEditModal, editingWifi, editForm, openEditModal, submitEdit,
            searchQuery, currentPage, pageSize, totalPages, paginatedWifiList, filteredWifiList,
            batchChangeMacs
        };
    }
}
