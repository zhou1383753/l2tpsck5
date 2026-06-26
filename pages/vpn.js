export default {
    template: `
        <div class="space-y-4 relative">
            <div class="bg-white p-4 md:p-6 rounded-xl shadow-sm flex flex-col md:flex-row md:justify-between md:items-center gap-3 border border-gray-100">
                <div class="flex items-center space-x-3">
                    <h2 class="font-bold text-gray-800 text-lg">RouterOS VPN 客户端</h2>
                    <button @click="fetchVpnList(true)" :disabled="isLoading" title="强制同步路由器数据" class="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-all focus:outline-none">
                        <svg :class="{'animate-spin text-indigo-500': isLoading}" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                    </button>
                </div>
                
                <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center w-full md:w-auto">
                    <div class="relative w-full sm:w-56">
                        <input v-model="searchQuery" type="text" placeholder="搜索名称、IP或账号..." class="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full transition-all">
                        <span class="absolute left-2.5 top-2.5 text-gray-400">🔍</span>
                    </div>
                    <button @click="openBatchModal()" class="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-sm text-sm font-medium transition flex items-center justify-center">
                        📋 批量导入
                    </button>
<!--                    <button @click="openModal()" class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-sm text-sm font-medium transition flex items-center">-->
<!--                        + 新建 {{ currentTab.toUpperCase() }}-->
<!--                    </button>-->
                </div>
            </div>
            
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div class="p-4 border-b border-gray-100 bg-gray-50 flex items-center">
                    <div class="flex space-x-1 bg-gray-200/60 p-1 rounded-lg">
                        <button @click="switchTab('l2tp')" :class="currentTab === 'l2tp' ? 'bg-white shadow-sm text-indigo-600 font-bold' : 'text-gray-500 hover:text-gray-700'" class="px-4 py-1.5 rounded-md text-sm transition-all flex items-center">
                            <span class="mr-1.5 text-base">🌐</span> L2TP
                        </button>
                        <button @click="switchTab('pptp')" :class="currentTab === 'pptp' ? 'bg-white shadow-sm text-indigo-600 font-bold' : 'text-gray-500 hover:text-gray-700'" class="px-4 py-1.5 rounded-md text-sm transition-all flex items-center">
                            <span class="mr-1.5 text-base">🔌</span> PPTP
                        </button>
                        <button @click="switchTab('sstp')" :class="currentTab === 'sstp' ? 'bg-white shadow-sm text-indigo-600 font-bold' : 'text-gray-500 hover:text-gray-700'" class="px-4 py-1.5 rounded-md text-sm transition-all flex items-center">
                            <span class="mr-1.5 text-base">🛡️</span> SSTP
                        </button>
                    </div>
                </div>

                <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-gray-200 text-sm text-gray-600 font-medium bg-white">
                            <th class="p-4 w-40">接口名称</th>
                            <th class="p-4">连接目标 (IP/域名)</th>
                            <th class="p-4">安全凭证 (账号/密码/IPsec)</th>
                            <th class="p-4 text-center">状态 / 连通性</th>
                            <th class="p-4 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="isLoading && paginatedVpnList.length === 0" class="border-b border-gray-100 bg-gray-50/30">
                            <td colspan="5" class="p-8 text-center text-gray-400">正在获取 {{ currentTab.toUpperCase() }} 数据...</td>
                        </tr>
                        <tr v-else-if="!isLoading && paginatedVpnList.length === 0" class="border-b border-gray-100 bg-gray-50/30">
                            <td colspan="5" class="p-8 text-center text-gray-400">{{ errorMessage || (searchQuery ? '未找到匹配的接口' : '该协议下暂无配置') }}</td>
                        </tr>
                        
                        <tr v-for="vpn in paginatedVpnList" :key="vpn.name" :class="{'opacity-50': isLoading}" class="border-b border-gray-100 hover:bg-indigo-50/30 transition text-sm bg-white">
                            <td class="p-4 font-bold text-gray-700">
                                <span class="inline-flex items-center justify-center w-5 h-5 mr-2 rounded text-xs font-black align-middle"
                                      :class="(vpn.running === 'true' || vpn.running === true) ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-300'">
                                    {{ (vpn.running === 'true' || vpn.running === true) ? 'R' : '-' }}
                                </span>
                                <span class="align-middle">{{ vpn.name }}</span>
                            </td>
                            <td class="p-4 text-indigo-600 font-mono">{{ vpn.connectTo || '未配置' }}</td>
                            
                            <td class="p-4 text-gray-600 font-mono bg-gray-50 rounded">
                                <div><span class="text-gray-400 text-xs">账号:</span> {{ vpn.user || '-' }}</div>
                                <div class="mt-1"><span class="text-gray-400 text-xs">密码:</span> <span class="text-orange-600">{{ vpn.password || '无' }}</span></div>
                                <div v-if="vpn.useIpsec === 'yes' || vpn.useIpsec === 'true'" class="text-purple-600 mt-1 font-bold">
                                    <span class="text-gray-400 text-xs font-normal">IPsec:</span> {{ vpn.ipsecSecret || '已开启' }}
                                </div>
                            </td>

                            <td class="p-4 text-center">
                                <div class="mb-1">
                                    <span v-if="vpn.disabled === 'false' || vpn.disabled === false" class="bg-green-100 text-green-600 px-2 py-0.5 rounded text-xs font-medium">启用</span>
                                    <span v-else class="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-xs font-medium">禁用</span>
                                </div>
                                <div v-if="vpn.pingResult !== undefined" class="text-xs mt-1.5 font-mono">
                                    <span v-if="vpn.pingResult.success" class="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded border border-emerald-100">
                                        ⚡ {{ vpn.pingResult.time }}
                                    </span>
                                    <span v-else class="bg-red-50 text-red-500 px-2 py-0.5 rounded border border-red-100" :title="vpn.pingResult.message">
                                        ❌ 超时
                                    </span>
                                </div>
                            </td>

                            <td class="p-4 text-right">
                                <button @click="pingTest(vpn)" :disabled="vpn.isPinging || vpn.disabled === 'true' || vpn.disabled === true" class="text-emerald-600 hover:underline text-xs font-bold mr-3 disabled:opacity-30 disabled:cursor-not-allowed">
                                    {{ vpn.isPinging ? '测速中...' : '测速' }}
                                </button>
                                <button @click="toggleStatus(vpn)" :class="(vpn.disabled === 'false' || vpn.disabled === false) ? 'text-red-500' : 'text-green-500'" class="hover:underline text-xs font-bold mr-3">
                                    {{ (vpn.disabled === 'false' || vpn.disabled === false) ? '禁用' : '启动' }}
                                </button>
                                <button @click="openModal(vpn)" class="text-blue-500 hover:underline text-xs">编辑</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                </div>

                <div class="md:hidden divide-y divide-gray-100">
                    <div v-if="isLoading && paginatedVpnList.length === 0" class="p-6 text-center text-sm text-gray-400">
                        正在获取 {{ currentTab.toUpperCase() }} 数据...
                    </div>
                    <div v-else-if="!isLoading && paginatedVpnList.length === 0" class="p-6 text-center text-sm text-gray-400">
                        {{ errorMessage || (searchQuery ? '未找到匹配的接口' : '该协议下暂无配置') }}
                    </div>
                    <div v-for="vpn in paginatedVpnList" :key="vpn.name" :class="{'opacity-50': isLoading}" class="p-4 space-y-3 bg-white">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="inline-flex items-center justify-center w-5 h-5 rounded text-xs font-black"
                                          :class="(vpn.running === 'true' || vpn.running === true) ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-300'">
                                        {{ (vpn.running === 'true' || vpn.running === true) ? 'R' : '-' }}
                                    </span>
                                    <div class="font-bold text-gray-800 truncate">{{ vpn.name }}</div>
                                </div>
                                <div class="mt-1 font-mono text-xs text-indigo-600 break-all">{{ vpn.connectTo || '未配置' }}</div>
                            </div>
                            <span v-if="vpn.disabled === 'false' || vpn.disabled === false" class="bg-green-100 text-green-600 px-2 py-1 rounded text-xs font-medium shrink-0">启用</span>
                            <span v-else class="bg-gray-100 text-gray-500 px-2 py-1 rounded text-xs font-medium shrink-0">禁用</span>
                        </div>

                        <div class="grid grid-cols-1 gap-2 text-xs">
                            <div class="rounded-lg bg-gray-50 p-3 font-mono">
                                <div><span class="text-gray-400">账号:</span> {{ vpn.user || '-' }}</div>
                                <div class="mt-1"><span class="text-gray-400">密码:</span> <span class="text-orange-600">{{ vpn.password || '无' }}</span></div>
                                <div v-if="vpn.useIpsec === 'yes' || vpn.useIpsec === 'true'" class="text-purple-600 mt-1 font-bold">
                                    <span class="text-gray-400 font-normal">IPsec:</span> {{ vpn.ipsecSecret || '已开启' }}
                                </div>
                            </div>
                            <div v-if="vpn.pingResult !== undefined" class="rounded-lg bg-gray-50 p-3">
                                <span v-if="vpn.pingResult.success" class="text-emerald-600 font-bold">测速: {{ vpn.pingResult.time }}</span>
                                <span v-else class="text-red-500 font-bold">测速: 超时</span>
                            </div>
                        </div>

                        <div class="grid grid-cols-3 gap-2">
                            <button @click="pingTest(vpn)" :disabled="vpn.isPinging || vpn.disabled === 'true' || vpn.disabled === true" class="bg-emerald-50 text-emerald-600 py-2 rounded-lg text-xs font-bold disabled:opacity-40">
                                {{ vpn.isPinging ? '测速中' : '测速' }}
                            </button>
                            <button @click="toggleStatus(vpn)" :class="(vpn.disabled === 'false' || vpn.disabled === false) ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'" class="py-2 rounded-lg text-xs font-bold">
                                {{ (vpn.disabled === 'false' || vpn.disabled === false) ? '禁用' : '启动' }}
                            </button>
                            <button @click="openModal(vpn)" class="bg-blue-50 text-blue-600 py-2 rounded-lg text-xs font-bold">编辑</button>
                        </div>
                    </div>
                </div>
                
                <div v-if="filteredVpnList.length > 0" class="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                    <span class="text-sm text-gray-500">共 <span class="font-bold text-gray-700">{{ filteredVpnList.length }}</span> 项</span>
                    <div class="flex items-center gap-3">
                        <button @click="currentPage--" :disabled="currentPage === 1" class="px-3 py-1.5 rounded-md border border-gray-200 bg-white text-sm disabled:opacity-50 hover:bg-gray-100 transition-all font-medium">上一页</button>
                        <span class="text-sm text-gray-600 font-medium">{{ currentPage }} / {{ totalPages }}</span>
                        <button @click="currentPage++" :disabled="currentPage >= totalPages" class="px-3 py-1.5 rounded-md border border-gray-200 bg-white text-sm disabled:opacity-50 hover:bg-gray-100 transition-all font-medium">下一页</button>
                    </div>
                </div>
            </div>

            <div v-if="showModal" class="fixed inset-0 bg-gray-900 bg-opacity-40 flex items-center justify-center z-50 p-3">
                <div class="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                    <div class="px-6 py-4 border-b bg-gray-50 flex justify-between">
                        <h3 class="font-bold text-gray-800">{{ isEdit ? '编辑' : '新建' }} {{ currentTab.toUpperCase() }} 线路</h3>
                        <button @click="showModal = false" class="text-gray-400 hover:text-red-500">&times;</button>
                    </div>
                    <div class="p-6 space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-1 text-gray-600">接口名称</label>
                            <input v-model="editForm.name" :disabled="isEdit" :class="{'bg-gray-100 text-gray-500': isEdit}" class="w-full p-2 border rounded-lg outline-none text-sm focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">连接目标 (Connect-To)</label>
                            <input v-model="editForm.connectTo" class="w-full p-2 border rounded-lg outline-none text-sm focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div class="flex flex-col sm:flex-row gap-4">
                            <div class="flex-1">
                                <label class="block text-sm font-medium mb-1">拨号账号 (User)</label>
                                <input v-model="editForm.user" class="w-full p-2 border rounded-lg outline-none text-sm focus:ring-2 focus:ring-indigo-500">
                            </div>
                            <div class="flex-1">
                                <label class="block text-sm font-medium mb-1">密码 (Password)</label>
                                <input v-model="editForm.password" type="text" class="w-full p-2 border rounded-lg outline-none text-sm focus:ring-2 focus:ring-indigo-500">
                            </div>
                        </div>
                        <div v-if="currentTab === 'l2tp'" class="flex flex-col sm:flex-row gap-4 sm:items-center pt-2">
                            <label class="flex items-center space-x-2 cursor-pointer w-32">
                                <input type="checkbox" v-model="editForm.useIpsec" class="rounded text-indigo-600 focus:ring-indigo-500">
                                <span class="text-sm font-medium">启用 IPsec</span>
                            </label>
                            <div v-if="editForm.useIpsec" class="flex-1">
                                <input v-model="editForm.ipsecSecret" placeholder="预共享密钥 (Secret)" type="text" class="w-full p-2 border rounded-lg outline-none text-sm focus:ring-2 focus:ring-indigo-500">
                            </div>
                        </div>
                    </div>
                    <div class="px-6 py-4 border-t bg-gray-50 flex justify-end space-x-3">
                        <button @click="showModal = false" class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100">取消</button>
                        <button @click="submitForm" :disabled="isSaving" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm shadow hover:bg-indigo-700 disabled:opacity-50">
                            {{ isSaving ? '保存中...' : '保存' }}
                        </button>
                    </div>
                </div>
            </div>

            <div v-if="showBatchModal" class="fixed inset-0 bg-gray-900 bg-opacity-40 flex items-center justify-center z-50 p-3">
                <div class="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                    <div class="px-6 py-4 border-b bg-gray-50 flex justify-between">
                        <h3 class="font-bold text-gray-800">批量导入/覆盖设置</h3>
                        <button @click="showBatchModal = false" class="text-gray-400 hover:text-red-500">&times;</button>
                    </div>
                    <div class="p-6 space-y-4">
                        <div class="flex flex-col sm:flex-row gap-4">
                            <div class="flex-1">
                                <label class="block text-sm font-medium mb-1 text-gray-700">目标协议</label>
                                <select v-model="batchForm.protocol" class="w-full p-2 border rounded-lg outline-none text-sm focus:ring-2 focus:ring-emerald-500 bg-white">
                                    <option value="l2tp">L2TP</option>
                                    <option value="pptp">PPTP</option>
                                    <option value="sstp">SSTP</option>
                                </select>
                            </div>
                            <div class="flex-1">
                                <label class="block text-sm font-medium mb-1 text-gray-700">起始序号</label>
                                <input v-model.number="batchForm.startIndex" type="number" min="1" class="w-full p-2 border rounded-lg outline-none text-sm focus:ring-2 focus:ring-emerald-500">
                            </div>
                        </div>
                        <div class="bg-blue-50 text-blue-700 text-xs p-3 rounded-lg border border-blue-100">
                            <b>解析格式：</b> IP:账号:密码:IPsec密钥(可选)<br>
                            <b>工作原理：</b> 将按 <b>{{ batchNamePreview }}</b> 为起点顺序覆盖。<br>
                            <span class="text-gray-500 mt-1 block">示例：<br>192.168.1.1:user1:pass123:mysecret</span>
                        </div>
                        <textarea v-model="batchForm.text" rows="8" placeholder="在此处粘贴配置，一行一个..." class="w-full p-3 border rounded-lg outline-none text-sm focus:ring-2 focus:ring-emerald-500 font-mono whitespace-pre resize-none"></textarea>
                    </div>
                    <div class="px-6 py-4 border-t bg-gray-50 flex justify-end space-x-3">
                        <button @click="showBatchModal = false" class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100">取消</button>
                        <button @click="submitBatch" :disabled="isBatchSaving" class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm shadow hover:bg-emerald-700 disabled:opacity-50">
                            {{ isBatchSaving ? '处理中...' : '确认导入' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `,
    setup() {
        const { ref, reactive, onMounted, computed, watch } = Vue;

        const vpnCache = reactive({
            l2tp: null,
            pptp: null,
            sstp: null
        });

        const vpnList = computed(() => {
            return vpnCache[currentTab.value] || [];
        });

        const isLoading = ref(false);
        const errorMessage = ref('');
        const currentTab = ref('l2tp');

        const searchQuery = ref('');
        const currentPage = ref(1);
        const pageSize = ref(15);

        const showModal = ref(false);
        const isEdit = ref(false);
        const isSaving = ref(false);
        const editForm = reactive({ name: '', connectTo: '', user: '', password: '', useIpsec: false, ipsecSecret: '' });

        const showBatchModal = ref(false);
        const isBatchSaving = ref(false);
        const batchForm = reactive({ protocol: 'l2tp', startIndex: 1, text: '' });

        const getBatchNamePrefix = (protocol, startIndex) => {
            const fallbackPrefix = protocol + '-out';
            const list = vpnCache[protocol] || [];
            const indexedNames = list
                .map(vpn => (vpn && typeof vpn.name === 'string') ? vpn.name.trim() : '')
                .map(name => name.match(/^(.*?)(\d+)$/))
                .filter(Boolean);

            const matchedStart = indexedNames.find(match => parseInt(match[2], 10) === startIndex);
            return (matchedStart || indexedNames[0] || [null, fallbackPrefix])[1];
        };

        const batchNamePreview = computed(() => {
            const startIdx = parseInt(batchForm.startIndex, 10);
            const safeStartIdx = (!isNaN(startIdx) && startIdx > 0) ? startIdx : 1;
            return getBatchNamePrefix(batchForm.protocol, safeStartIdx) + safeStartIdx;
        });

        const filteredVpnList = computed(() => {
            if (!searchQuery.value) return vpnList.value;
            const lowerQuery = searchQuery.value.toLowerCase();
            return vpnList.value.filter(vpn => {
                return (vpn.name && vpn.name.toLowerCase().includes(lowerQuery)) ||
                    (vpn.connectTo && vpn.connectTo.toLowerCase().includes(lowerQuery)) ||
                    (vpn.user && vpn.user.toLowerCase().includes(lowerQuery));
            });
        });

        const totalPages = computed(() => Math.ceil(filteredVpnList.value.length / pageSize.value) || 1);

        const paginatedVpnList = computed(() => {
            const start = (currentPage.value - 1) * pageSize.value;
            const end = start + pageSize.value;
            return filteredVpnList.value.slice(start, end);
        });

        watch(searchQuery, () => { currentPage.value = 1; });

        const switchTab = (type) => {
            if (currentTab.value === type) return;
            currentTab.value = type;
            searchQuery.value = '';
            currentPage.value = 1;
            fetchVpnList(false);
        };

        const getRosPayload = () => {
            const savedRos = localStorage.getItem('rosConfig');
            return savedRos ? JSON.parse(savedRos) : null;
        };

        const fetchVpnList = async (forceRefresh = false) => {
            const payload = getRosPayload();
            if (!payload) {
                errorMessage.value = '请先配置 RouterOS 凭证';
                return;
            }

            if (!forceRefresh && vpnCache[currentTab.value] !== null) {
                return;
            }

            isLoading.value = true;
            errorMessage.value = '';

            try {
                const res = await fetch('api/ros', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'get_vpns', vpn_type: currentTab.value, payload })
                }).then(r => r.json());

                if (res.status === 'success') {
                    // 初始化每个对象的内部状态，用于测速展示
                    const dataWithState = (res.data || []).map(item => ({
                        ...item,
                        isPinging: false,
                        pingResult: undefined
                    }));
                    vpnCache[currentTab.value] = dataWithState;
                } else {
                    errorMessage.value = res.message;
                }
            } catch (e) {
                errorMessage.value = '请求后端失败';
            } finally {
                isLoading.value = false;
            }
        };

        const invalidateAndFetch = (protocol) => {
            vpnCache[protocol] = null;
            if (currentTab.value === protocol) {
                fetchVpnList(true);
            }
        };

        // --- 新增 Ping 测试方法 ---
        const pingTest = async (vpn) => {
            const payload = getRosPayload();
            if (!payload) return;

            vpn.isPinging = true;
            vpn.pingResult = undefined;

            try {
                const res = await fetch('api/ros', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        action: 'ping_test',
                        payload,
                        data: { name: vpn.name }
                    })
                }).then(r => r.json());

                if (res.status === 'success') {
                    vpn.pingResult = { success: true, time: res.data.time };
                } else {
                    vpn.pingResult = { success: false, message: res.message };
                }
            } catch (e) {
                vpn.pingResult = { success: false, message: '通信异常' };
            } finally {
                vpn.isPinging = false;
            }
        };

        const toggleStatus = async (vpn) => {
            const payload = getRosPayload();
            if (!payload) return;
            const targetStatus = (vpn.disabled === 'false' || vpn.disabled === false) ? 'yes' : 'no';
            try {
                const res = await fetch('api/ros', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ action: 'toggle_vpn', vpn_type: currentTab.value, payload, data: { name: vpn.name, disabled: targetStatus } })
                }).then(r => r.json());

                if (res.status === 'success') invalidateAndFetch(currentTab.value);
            } catch (e) { alert('请求异常'); }
        };

        const openModal = (vpn = null) => {
            if (vpn) {
                isEdit.value = true;
                editForm.name = vpn.name;
                editForm.connectTo = vpn.connectTo || '';
                editForm.user = vpn.user || '';
                editForm.password = vpn.password || '';
                editForm.useIpsec = (vpn.useIpsec === 'yes' || vpn.useIpsec === 'true');
                editForm.ipsecSecret = vpn.ipsecSecret || '';
            } else {
                isEdit.value = false;
                editForm.name = currentTab.value + '-out1';
                editForm.connectTo = '';
                editForm.user = '';
                editForm.password = '';
                editForm.useIpsec = false;
                editForm.ipsecSecret = '';
            }
            showModal.value = true;
        };

        const submitForm = async () => {
            const payload = getRosPayload();
            if (!payload) return;
            if (!editForm.name) return alert("名称不能为空");

            isSaving.value = true;
            try {
                const res = await fetch('api/ros', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        action: isEdit.value ? 'edit_vpn' : 'add_vpn',
                        vpn_type: currentTab.value,
                        payload,
                        data: { ...editForm }
                    })
                }).then(r => r.json());

                if (res.status === 'success') {
                    showModal.value = false;
                    invalidateAndFetch(currentTab.value);
                } else {
                    alert('保存失败: ' + res.message);
                }
            } catch (e) {
                alert('通信异常，保存失败');
            } finally {
                isSaving.value = false;
            }
        };

        const openBatchModal = () => {
            batchForm.protocol = currentTab.value;
            batchForm.startIndex = 1;
            batchForm.text = '';
            showBatchModal.value = true;
        };

        const submitBatch = async () => {
            const payload = getRosPayload();
            if (!payload) return;

            if (!batchForm.text.trim()) return alert("请输入配置内容");
            const startIdx = parseInt(batchForm.startIndex, 10);
            if (isNaN(startIdx) || startIdx < 1) return alert("起始序号必须是大于 0 的数字");

            const lines = batchForm.text.trim().split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length === 0) return;

            const batchData = [];
            const namePrefix = getBatchNamePrefix(batchForm.protocol, startIdx);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const parts = line.split(':');
                if (parts.length < 3) {
                    return alert('第 ' + (i + 1) + ' 行格式不正确，至少需要提供 IP:账号:密码');
                }

                const targetVpnName = namePrefix + (startIdx + i);
                const ip = parts[0].trim();
                const user = parts[1].trim();
                const pwd = parts[2].trim();
                const ipsec = parts[3] ? parts[3].trim() : '';

                batchData.push({
                    name: targetVpnName,
                    connectTo: ip,
                    user: user,
                    password: pwd,
                    useIpsec: !!ipsec,
                    ipsecSecret: ipsec
                });
            }

            isBatchSaving.value = true;
            try {
                const res = await fetch('api/ros', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        action: 'batch_edit_vpns',
                        vpn_type: batchForm.protocol,
                        payload,
                        data: { vpns: batchData }
                    })
                }).then(r => r.json());

                if (res.status === 'success') {
                    showBatchModal.value = false;
                    invalidateAndFetch(batchForm.protocol);
                    if (currentTab.value !== batchForm.protocol) {
                        currentTab.value = batchForm.protocol;
                    }
                } else {
                    alert('批量覆盖时发生错误: ' + res.message);
                }
            } catch (e) {
                alert('通信异常，批量保存失败');
            } finally {
                isBatchSaving.value = false;
            }
        };

        onMounted(() => fetchVpnList(false));

        return {
            vpnList, isLoading, errorMessage, currentTab, switchTab, fetchVpnList,
            showModal, isEdit, editForm, openModal, submitForm, isSaving, toggleStatus,
            showBatchModal, batchForm, batchNamePreview, isBatchSaving, openBatchModal, submitBatch,
            searchQuery, currentPage, pageSize, filteredVpnList, totalPages, paginatedVpnList,
            pingTest // 暴露方法
        };
    }
}
