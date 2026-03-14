<template>
	<n-space vertical size="large">
		<n-space justify="space-between" align="center">
			<n-h2 style="margin: 0">策略组编排</n-h2>
			<n-space v-if="profileStore.currentProfileId">
				<n-button @click="showImportModal = true">
					<template #icon
						><n-icon><code-slash-outline /></n-icon
					></template>
					YAML 导入
				</n-button>
				<n-button @click="showBatchModal = true">
					<template #icon
						><n-icon><layers-outline /></n-icon
					></template>
					批量生成
				</n-button>
				<n-button type="primary" @click="openAddModal">
					<template #icon
						><n-icon><add-outline /></n-icon
					></template>
					添加组
				</n-button>
			</n-space>
		</n-space>

		<n-text depth="3" v-if="profileStore.currentProfileId">
			拖拽调整策略组顺序，组间可通过 proxies
			相互引用。编译时按此顺序输出到 Clash 配置。
		</n-text>

		<n-empty
			v-if="!profileStore.currentProfileId"
			description="请先在「发布中心」创建并选择一个配置方案"
		/>

		<n-spin :show="loading" v-if="profileStore.currentProfileId">
			<n-empty
				v-if="groups.length === 0 && !loading"
				description="暂无策略组，点击右上角添加或导入"
			>
			</n-empty>

			<!-- ===== Visible groups ===== -->
			<div class="group-list" v-if="visibleGroups.length > 0">
				<div
					v-for="(item, index) in visibleGroups"
					:key="item.id"
					class="group-card"
					:class="{
						'drag-over':
							dragCtx === 'visible' && dragOverIdx === index,
					}"
					draggable="true"
					@dragstart="onDragStart(index, 'visible')"
					@dragover.prevent="onDragOver(index, 'visible')"
					@drop="onDrop"
					@dragend="onDragEnd"
				>
					<n-space
						justify="space-between"
						align="center"
						style="width: 100%"
					>
						<n-space align="center" :wrap="false">
							<n-icon size="16" style="cursor: grab; opacity: 0.4"
								>☰</n-icon
							>
							<n-tag
								:type="typeTagColor(item.type)"
								size="small"
								round
								>{{ item.type }}</n-tag
							>
							<span class="group-name">{{ item.name }}</span>
						</n-space>
						<n-space :size="4">
							<n-tooltip trigger="hover">
								<template #trigger>
									<n-button
										size="small"
										quaternary
										@click="handleDuplicate(item)"
									>
										<template #icon
											><n-icon><copy-outline /></n-icon>
										</template>
									</n-button>
								</template>
								复制
							</n-tooltip>
							<n-tooltip trigger="hover">
								<template #trigger>
									<n-button
										size="small"
										quaternary
										@click="openEditModal(item)"
									>
										<template #icon
											><n-icon><create-outline /></n-icon>
										</template>
									</n-button>
								</template>
								编辑
							</n-tooltip>
							<n-popconfirm
								@positive-click="handleDelete(item.id)"
							>
								<template #trigger>
									<n-button
										size="small"
										quaternary
										type="error"
									>
										<template #icon
											><n-icon><trash-outline /></n-icon>
										</template>
									</n-button>
								</template>
								确定删除「{{ item.name }}」？
							</n-popconfirm>
						</n-space>
					</n-space>
					<div class="group-meta">
						<n-space
							:size="4"
							style="flex-wrap: wrap; margin-top: 6px"
						>
							<n-tag
								v-for="pId in item.use_providers"
								:key="'p' + pId"
								size="small"
								type="info"
							>
								{{ providerName(pId) }}
							</n-tag>
							<n-tag
								v-for="pId in item.use_sub_info_providers"
								:key="'si' + pId"
								size="small"
								type="warning"
							>
								{{ providerName(pId) }}-订阅信息
							</n-tag>
							<n-tag
								v-for="ref in item.proxies"
								:key="'ref' + ref"
								size="small"
								:type="isGroupRef(ref) ? 'success' : 'default'"
							>
								{{ ref }}
							</n-tag>
						</n-space>
						<n-text
							v-if="item.filter"
							depth="3"
							style="
								font-size: 12px;
								margin-top: 4px;
								display: block;
							"
						>
							filter: {{ item.filter }}
						</n-text>
					</div>
				</div>
			</div>

			<!-- ===== Hidden groups (collapsible) ===== -->
			<n-collapse
				v-if="hiddenGroups.length > 0"
				style="margin-top: 16px"
				:default-expanded-names="[]"
			>
				<n-collapse-item
					:title="`被引用的隐藏组（${hiddenGroups.length} 个）`"
					name="hidden"
				>
					<div class="group-list">
						<div
							v-for="(item, index) in hiddenGroups"
							:key="item.id"
							class="group-card hidden-card"
							:class="{
								'drag-over':
									dragCtx === 'hidden' &&
									dragOverIdx === index,
							}"
							draggable="true"
							@dragstart="onDragStart(index, 'hidden')"
							@dragover.prevent="onDragOver(index, 'hidden')"
							@drop="onDrop"
							@dragend="onDragEnd"
						>
							<n-space
								justify="space-between"
								align="center"
								style="width: 100%"
							>
								<n-space align="center" :wrap="false">
									<n-icon
										size="16"
										style="cursor: grab; opacity: 0.4"
										>☰</n-icon
									>
									<n-tag
										:type="typeTagColor(item.type)"
										size="small"
										round
										>{{ item.type }}</n-tag
									>
									<span class="group-name">{{
										item.name
									}}</span>
									<n-tag size="small" type="default"
										>隐藏</n-tag
									>
								</n-space>
								<n-space :size="4">
									<n-tooltip trigger="hover">
										<template #trigger>
											<n-button
												size="small"
												quaternary
												@click="handleDuplicate(item)"
											>
												<template #icon
													><n-icon
														><copy-outline
													/></n-icon>
												</template>
											</n-button>
										</template>
										复制
									</n-tooltip>
									<n-tooltip trigger="hover">
										<template #trigger>
											<n-button
												size="small"
												quaternary
												@click="openEditModal(item)"
											>
												<template #icon
													><n-icon
														><create-outline
													/></n-icon>
												</template>
											</n-button>
										</template>
										编辑
									</n-tooltip>
									<n-popconfirm
										@positive-click="handleDelete(item.id)"
									>
										<template #trigger>
											<n-button
												size="small"
												quaternary
												type="error"
											>
												<template #icon
													><n-icon
														><trash-outline
													/></n-icon>
												</template>
											</n-button>
										</template>
										确定删除「{{ item.name }}」？
									</n-popconfirm>
								</n-space>
							</n-space>
							<div class="group-meta">
								<n-space
									:size="4"
									style="flex-wrap: wrap; margin-top: 6px"
								>
									<n-tag
										v-for="pId in item.use_providers"
										:key="'p' + pId"
										size="small"
										type="info"
									>
										{{ providerName(pId) }}
									</n-tag>
									<n-tag
										v-for="pId in item.use_sub_info_providers"
										:key="'si' + pId"
										size="small"
										type="warning"
									>
										{{ providerName(pId) }}-订阅信息
									</n-tag>
									<n-tag
										v-for="ref in item.proxies"
										:key="'ref' + ref"
										size="small"
										:type="
											isGroupRef(ref)
												? 'success'
												: 'default'
										"
									>
										{{ ref }}
									</n-tag>
								</n-space>
								<n-text
									v-if="item.filter"
									depth="3"
									style="
										font-size: 12px;
										margin-top: 4px;
										display: block;
									"
								>
									filter: {{ item.filter }}
								</n-text>
							</div>
						</div>
					</div>
				</n-collapse-item>
			</n-collapse>
		</n-spin>

		<n-button
			v-if="orderChanged && groups.length > 0"
			type="primary"
			:loading="savingOrder"
			@click="saveOrder"
			style="align-self: flex-start"
		>
			保存顺序
		</n-button>

		<!-- ========== Add/Edit Group Modal ========== -->
		<n-modal
			v-model:show="showEditModal"
			preset="dialog"
			:title="editingId ? '编辑策略组' : '添加策略组'"
			style="width: 640px"
		>
			<n-form
				ref="formRef"
				:model="form"
				:rules="formRules"
				label-placement="left"
				label-width="100"
			>
				<n-form-item label="组名" path="name">
					<n-input
						v-model:value="form.name"
						placeholder="如：🚀 节点选择"
					/>
				</n-form-item>

				<n-form-item label="类型" path="type">
					<n-select
						v-model:value="form.type"
						:options="typeOptions"
					/>
				</n-form-item>

				<n-form-item label="关联机场">
					<n-checkbox-group v-model:value="form.use_providers">
						<n-space>
							<n-checkbox
								v-for="p in providers"
								:key="p.id"
								:value="p.id"
								:label="p.name"
							/>
						</n-space>
					</n-checkbox-group>
				</n-form-item>

				<n-form-item label="订阅信息机场">
					<n-checkbox-group
						v-model:value="form.use_sub_info_providers"
					>
						<n-space>
							<n-checkbox
								v-for="p in subInfoProviders"
								:key="p.id"
								:value="p.id"
								:label="p.name + '-订阅信息'"
							/>
						</n-space>
					</n-checkbox-group>
					<n-text
						v-if="subInfoProviders.length === 0"
						depth="3"
						style="font-size: 12px"
					>
						(无机场开启了订阅信息展示)
					</n-text>
				</n-form-item>

				<n-form-item label="引用其他组">
					<div style="width: 100%">
						<n-select
							v-model:value="proxySelectStaging"
							filterable
							tag
							:options="proxyRefAvailableOptions"
							placeholder="搜索并添加组名 / DIRECT / REJECT"
							@update:value="handleProxySelect"
						/>
						<div
							class="proxy-tag-list"
							v-if="form.proxies.length > 0"
						>
							<div
								v-for="(pRef, pIdx) in form.proxies"
								:key="'pt-' + pRef + '-' + pIdx"
								class="proxy-tag-item"
								:class="{
									'proxy-tag-drag-over':
										ptDragOverIdx === pIdx,
								}"
								draggable="true"
								@dragstart.stop="onPtDragStart(pIdx)"
								@dragover.prevent.stop="onPtDragOver(pIdx)"
								@drop.stop="onPtDrop"
								@dragend.stop="onPtDragEnd"
							>
								<n-tag
									:type="
										isGroupRef(pRef) ? 'success' : 'default'
									"
									closable
									@close="removeProxyRef(pIdx)"
									size="medium"
								>
									<template #icon>
										<span
											style="
												cursor: grab;
												opacity: 0.5;
												font-size: 12px;
											"
											>☰</span
										>
									</template>
									{{ pRef }}
								</n-tag>
							</div>
						</div>
					</div>
				</n-form-item>

				<n-form-item label="节点过滤">
					<n-input
						v-model:value="form.filter"
						placeholder="正则表达式（可选），如：美国.*实验性"
					/>
				</n-form-item>

				<n-form-item label="隐藏">
					<n-switch v-model:value="form.hidden" />
				</n-form-item>

				<!-- url-test / fallback / load-balance specific -->
				<template
					v-if="
						['url-test', 'fallback', 'load-balance'].includes(
							form.type,
						)
					"
				>
					<n-divider style="margin: 8px 0">健康检查参数</n-divider>
					<n-form-item label="测试 URL">
						<n-input
							v-model:value="form.test_url"
							placeholder="http://www.gstatic.com/generate_204"
						/>
					</n-form-item>
					<n-form-item label="检测间隔(s)">
						<n-input-number
							v-model:value="form.interval"
							:min="30"
							:max="86400"
						/>
					</n-form-item>
					<n-form-item label="超时(ms)">
						<n-input-number
							v-model:value="form.timeout"
							:min="500"
							:max="30000"
							:step="500"
						/>
					</n-form-item>
					<n-form-item
						v-if="form.type === 'url-test'"
						label="容差(ms)"
					>
						<n-input-number
							v-model:value="form.tolerance"
							:min="0"
							:max="5000"
							:step="10"
						/>
					</n-form-item>
				</template>
			</n-form>

			<template #action>
				<n-button @click="showEditModal = false">取消</n-button>
				<n-button
					type="primary"
					:loading="submitting"
					@click="handleSubmit"
					>确定</n-button
				>
			</template>
		</n-modal>

		<!-- ========== YAML Import Modal ========== -->
		<n-modal
			v-model:show="showImportModal"
			preset="dialog"
			title="从 YAML 导入策略组"
			style="width: 700px"
		>
			<n-space vertical>
				<n-text depth="3">
					粘贴 Clash/Mihomo 格式的 proxy-groups YAML
					片段，系统将自动解析并创建对应的策略组。
					<code>use</code> 中的机场名会自动匹配已添加的机场。
				</n-text>
				<n-input
					v-model:value="importYaml"
					type="textarea"
					:rows="16"
					placeholder="proxy-groups:
  - name: 🚀 节点选择
    type: select
    proxies:
      - ⚡ 自动选择
      - DIRECT
    use:
      - 良心云
      - Flower"
					style="font-family: monospace"
				/>
				<n-checkbox v-model:checked="importReplace"
					>覆盖同名组（不勾选则跳过已存在的组）</n-checkbox
				>

				<n-alert
					v-if="importResult"
					:type="importResult.errors?.length ? 'warning' : 'success'"
					closable
				>
					<template #header>
						导入完成：新增 {{ importResult.imported }} 个，更新
						{{ importResult.updated }} 个，跳过
						{{ importResult.skipped }} 个
					</template>
					<div
						v-if="importResult.errors?.length"
						style="
							font-size: 12px;
							max-height: 150px;
							overflow: auto;
						"
					>
						<div v-for="(err, i) in importResult.errors" :key="i">
							{{ err }}
						</div>
					</div>
				</n-alert>
			</n-space>
			<template #action>
				<n-button @click="showImportModal = false">关闭</n-button>
				<n-button
					type="primary"
					:loading="importing"
					@click="handleImport"
					>导入</n-button
				>
			</template>
		</n-modal>

		<!-- ========== Batch Generate Modal ========== -->
		<n-modal
			v-model:show="showBatchModal"
			preset="dialog"
			title="按地区批量生成分组"
			style="width: 640px"
		>
			<n-space vertical>
				<n-text depth="3">
					选择一个机场和地区，一键批量生成 url-test 自动子组 + select
					选择组。
				</n-text>

				<n-form-item
					label="选择机场"
					label-placement="left"
					label-width="80"
				>
					<n-select
						v-model:value="batchProviderId"
						:options="
							providers.map((p) => ({
								label: p.name,
								value: p.id,
							}))
						"
						placeholder="选择机场"
					/>
				</n-form-item>

				<n-form-item
					label="选择地区"
					label-placement="left"
					label-width="80"
				>
					<n-checkbox-group v-model:value="batchRegionKeys">
						<n-space>
							<n-checkbox
								v-for="r in regionPresets"
								:key="r.value"
								:value="r.value"
								:label="r.label"
							/>
						</n-space>
					</n-checkbox-group>
				</n-form-item>

				<n-form-item
					label="子分类"
					label-placement="left"
					label-width="80"
				>
					<n-dynamic-tags v-model:value="batchSubFilters" />
					<n-text depth="3" style="font-size: 12px; margin-left: 8px">
						如：实验性、标准和高级（留空则只按地区分）
					</n-text>
				</n-form-item>

				<n-checkbox v-model:checked="batchCreateAuto"
					>同时创建隐藏的 url-test 自动子组</n-checkbox
				>
			</n-space>
			<template #action>
				<n-button @click="showBatchModal = false">取消</n-button>
				<n-button
					type="primary"
					:loading="batchCreating"
					@click="handleBatch"
					>生成</n-button
				>
			</template>
		</n-modal>
	</n-space>
</template>

<script setup>
import { ref, computed, onMounted, watch } from "vue";
import {
	NH2,
	NSpace,
	NTag,
	NButton,
	NIcon,
	NText,
	NSpin,
	NEmpty,
	NModal,
	NForm,
	NFormItem,
	NInput,
	NInputNumber,
	NSelect,
	NSwitch,
	NCheckbox,
	NCheckboxGroup,
	NDivider,
	NDynamicTags,
	NPopconfirm,
	NAlert,
	NCollapse,
	NCollapseItem,
	NTooltip,
	useMessage,
} from "naive-ui";
import {
	AddOutline,
	CreateOutline,
	TrashOutline,
	CodeSlashOutline,
	LayersOutline,
	CopyOutline,
} from "@vicons/ionicons5";
import api from "../api";
import { useProfileStore } from "../stores/profile";

const message = useMessage();
const profileStore = useProfileStore();
const loading = ref(false);
const savingOrder = ref(false);
const submitting = ref(false);
const importing = ref(false);
const batchCreating = ref(false);
const orderChanged = ref(false);

const groups = ref([]);
const providers = ref([]);

// ---- Computed: split visible / hidden groups ----
const visibleGroups = computed(() => groups.value.filter((g) => !g.hidden));
const hiddenGroups = computed(() => groups.value.filter((g) => g.hidden));

// ---- Drag & Drop for group cards (visible / hidden sections) ----
let dragIdx = null;
const dragCtx = ref(null); // 'visible' | 'hidden'
const dragOverIdx = ref(null);

function onDragStart(index, context) {
	dragIdx = index;
	dragCtx.value = context;
}

function onDragOver(index, context) {
	if (dragIdx === null || dragCtx.value !== context) return;
	dragOverIdx.value = index;
	if (dragIdx === index) return;

	const list =
		context === "visible" ? visibleGroups.value : hiddenGroups.value;
	const dragItem = list[dragIdx];
	const targetItem = list[index];

	const fullDragI = groups.value.indexOf(dragItem);
	const fullTargetI = groups.value.indexOf(targetItem);
	if (fullDragI === -1 || fullTargetI === -1) return;

	groups.value.splice(fullDragI, 1);
	const newTargetI = groups.value.indexOf(targetItem);
	if (index > dragIdx) {
		groups.value.splice(newTargetI + 1, 0, dragItem);
	} else {
		groups.value.splice(newTargetI, 0, dragItem);
	}

	dragIdx = index;
	orderChanged.value = true;
}

function onDrop() {
	dragIdx = null;
	dragCtx.value = null;
	dragOverIdx.value = null;
}

function onDragEnd() {
	dragIdx = null;
	dragCtx.value = null;
	dragOverIdx.value = null;
}

async function saveOrder() {
	savingOrder.value = true;
	try {
		const order = groups.value.map((g) => g.id);
		await api.post("/groups/reorder", {
			order,
			profile_id: profileStore.currentProfileId,
		});
		message.success("顺序已保存");
		orderChanged.value = false;
	} catch {
		message.error("保存顺序失败");
	} finally {
		savingOrder.value = false;
	}
}

// ---- Load Data ----
async function loadData() {
	const pid = profileStore.currentProfileId;
	if (!pid) return;
	loading.value = true;
	try {
		const [gRes, pRes] = await Promise.all([
			api.get("/groups", { params: { profile_id: pid } }),
			api.get("/providers"),
		]);
		groups.value = gRes.data;
		providers.value = pRes.data;
	} catch {
		message.error("加载数据失败");
	} finally {
		loading.value = false;
	}
}

// Watch profile changes and reload
watch(
	() => profileStore.currentProfileId,
	(newId) => {
		if (newId) loadData();
	},
);

// ---- Helpers ----
const subInfoProviders = computed(() =>
	providers.value.filter((p) => p.show_sub_info),
);
const groupNames = computed(() => groups.value.map((g) => g.name));

function providerName(id) {
	const p = providers.value.find((x) => x.id === id);
	return p?.name || `#${id}`;
}

function isGroupRef(name) {
	return groupNames.value.includes(name);
}

function typeTagColor(type) {
	const map = {
		select: "info",
		"url-test": "success",
		fallback: "warning",
		"load-balance": "error",
	};
	return map[type] || "default";
}

const typeOptions = [
	{ label: "select (手动选择)", value: "select" },
	{ label: "url-test (自动最低延迟)", value: "url-test" },
	{ label: "fallback (自动故障转移)", value: "fallback" },
	{ label: "load-balance (负载均衡)", value: "load-balance" },
];

const proxyRefOptions = computed(() => {
	const builtins = [
		{ label: "DIRECT", value: "DIRECT" },
		{ label: "REJECT", value: "REJECT" },
	];
	const groupOpts = groups.value
		.filter((g) => !editingId.value || g.id !== editingId.value)
		.map((g) => ({ label: g.name, value: g.name }));
	return [...builtins, ...groupOpts];
});

// Options excluding already-selected proxies
const proxyRefAvailableOptions = computed(() => {
	const selected = new Set(form.value.proxies);
	return proxyRefOptions.value.filter((o) => !selected.has(o.value));
});

const regionPresets = [
	{
		label: "🇭🇰 香港",
		value: "HK",
		emoji: "🇭🇰",
		name: "香港",
		filter: "香港",
	},
	{
		label: "🇹🇼 台湾",
		value: "TW",
		emoji: "🇨🇳",
		name: "台湾",
		filter: "台湾",
	},
	{
		label: "🇯🇵 日本",
		value: "JP",
		emoji: "🇯🇵",
		name: "日本",
		filter: "日本",
	},
	{
		label: "🇸🇬 新加坡",
		value: "SG",
		emoji: "🇸🇬",
		name: "新加坡",
		filter: "新加坡",
	},
	{
		label: "🇺🇸 美国",
		value: "US",
		emoji: "🇺🇸",
		name: "美国",
		filter: "美国",
	},
	{
		label: "🇰🇷 韩国",
		value: "KR",
		emoji: "🇰🇷",
		name: "韩国",
		filter: "韩国",
	},
	{
		label: "🇬🇧 英国",
		value: "GB",
		emoji: "🇬🇧",
		name: "英国",
		filter: "英国",
	},
	{
		label: "🇩🇪 德国",
		value: "DE",
		emoji: "🇩🇪",
		name: "德国",
		filter: "德国",
	},
];

// ---- Add/Edit Form ----
const showEditModal = ref(false);
const editingId = ref(null);
const formRef = ref(null);

const defaultForm = () => ({
	name: "",
	type: "select",
	hidden: false,
	test_url: "http://www.gstatic.com/generate_204",
	interval: 300,
	timeout: 5000,
	tolerance: 50,
	filter: "",
	proxies: [],
	use_providers: [],
	use_sub_info_providers: [],
});

const form = ref(defaultForm());
const formRules = {
	name: { required: true, message: "请输入组名", trigger: "blur" },
	type: { required: true, message: "请选择类型" },
};

function openAddModal() {
	editingId.value = null;
	form.value = defaultForm();
	proxySelectStaging.value = null;
	showEditModal.value = true;
}

function openEditModal(item) {
	editingId.value = item.id;
	form.value = {
		name: item.name,
		type: item.type,
		hidden: item.hidden,
		test_url: item.test_url || "http://www.gstatic.com/generate_204",
		interval: item.interval ?? 300,
		timeout: item.timeout ?? 5000,
		tolerance: item.tolerance ?? 50,
		filter: item.filter || "",
		proxies: [...(item.proxies || [])],
		use_providers: [...(item.use_providers || [])],
		use_sub_info_providers: [...(item.use_sub_info_providers || [])],
	};
	proxySelectStaging.value = null;
	showEditModal.value = true;
}

// ---- Duplicate Group ----
function generateCopyName(baseName) {
	const names = new Set(groupNames.value);
	const candidate = `${baseName}-副本`;
	if (!names.has(candidate)) return candidate;
	let i = 2;
	while (names.has(`${baseName}-副本${i}`)) {
		i++;
	}
	return `${baseName}-副本${i}`;
}

function handleDuplicate(item) {
	editingId.value = null;
	form.value = {
		name: generateCopyName(item.name),
		type: item.type,
		hidden: item.hidden,
		test_url: item.test_url || "http://www.gstatic.com/generate_204",
		interval: item.interval ?? 300,
		timeout: item.timeout ?? 5000,
		tolerance: item.tolerance ?? 50,
		filter: item.filter || "",
		proxies: [...(item.proxies || [])],
		use_providers: [...(item.use_providers || [])],
		use_sub_info_providers: [...(item.use_sub_info_providers || [])],
	};
	proxySelectStaging.value = null;
	showEditModal.value = true;
}

// ---- Proxy ref: select to add + draggable tag list ----
const proxySelectStaging = ref(null);

function handleProxySelect(val) {
	if (val && !form.value.proxies.includes(val)) {
		form.value.proxies.push(val);
	}
	// Always reset so the select is ready for next pick
	proxySelectStaging.value = null;
}

function removeProxyRef(index) {
	form.value.proxies.splice(index, 1);
}

// Drag & drop within proxy tags
let ptDragIdx = null;
const ptDragOverIdx = ref(null);

function onPtDragStart(index) {
	ptDragIdx = index;
}
function onPtDragOver(index) {
	if (ptDragIdx === null || ptDragIdx === index) {
		ptDragOverIdx.value = index;
		return;
	}
	const item = form.value.proxies.splice(ptDragIdx, 1)[0];
	form.value.proxies.splice(index, 0, item);
	ptDragIdx = index;
	ptDragOverIdx.value = index;
}
function onPtDrop() {
	ptDragIdx = null;
	ptDragOverIdx.value = null;
}
function onPtDragEnd() {
	ptDragIdx = null;
	ptDragOverIdx.value = null;
}

async function handleSubmit() {
	try {
		await formRef.value?.validate();
	} catch {
		return;
	}

	submitting.value = true;
	try {
		if (editingId.value) {
			await api.put(`/groups/${editingId.value}`, form.value);
			message.success("更新成功");
		} else {
			await api.post("/groups", {
				...form.value,
				profile_id: profileStore.currentProfileId,
			});
			message.success("添加成功");
		}
		showEditModal.value = false;
		await loadData();
	} catch (err) {
		message.error(err.response?.data?.error || "操作失败");
	} finally {
		submitting.value = false;
	}
}

async function handleDelete(id) {
	try {
		await api.delete(`/groups/${id}`);
		message.success("删除成功");
		await loadData();
	} catch {
		message.error("删除失败");
	}
}

// ---- YAML Import ----
const showImportModal = ref(false);
const importYaml = ref("");
const importReplace = ref(false);
const importResult = ref(null);

async function handleImport() {
	if (!importYaml.value.trim()) {
		message.warning("请粘贴 YAML 内容");
		return;
	}
	importing.value = true;
	importResult.value = null;
	try {
		const { data } = await api.post("/groups/import", {
			yaml_text: importYaml.value,
			replace_existing: importReplace.value,
			profile_id: profileStore.currentProfileId,
		});
		importResult.value = data;
		message.success(
			`导入完成：新增 ${data.imported}，更新 ${data.updated}`,
		);
		await loadData();
	} catch (err) {
		message.error(err.response?.data?.error || "导入失败");
	} finally {
		importing.value = false;
	}
}

// ---- Batch Generate ----
const showBatchModal = ref(false);
const batchProviderId = ref(null);
const batchRegionKeys = ref([]);
const batchSubFilters = ref([]);
const batchCreateAuto = ref(true);

async function handleBatch() {
	if (!batchProviderId.value) {
		message.warning("请选择机场");
		return;
	}
	if (batchRegionKeys.value.length === 0) {
		message.warning("请至少选择一个地区");
		return;
	}

	batchCreating.value = true;
	try {
		const regions = batchRegionKeys.value.map((key) => {
			const preset = regionPresets.find((r) => r.value === key);
			return {
				name: preset.name,
				emoji: preset.emoji,
				filter: preset.filter,
				sub_filters:
					batchSubFilters.value.length > 0
						? batchSubFilters.value
						: undefined,
			};
		});

		const { data } = await api.post("/groups/batch", {
			provider_id: batchProviderId.value,
			regions,
			create_auto: batchCreateAuto.value,
			profile_id: profileStore.currentProfileId,
		});

		message.success(`批量创建完成，共 ${data.created.length} 个组`);
		showBatchModal.value = false;
		batchRegionKeys.value = [];
		batchSubFilters.value = [];
		await loadData();
	} catch (err) {
		message.error(err.response?.data?.error || "批量创建失败");
	} finally {
		batchCreating.value = false;
	}
}

onMounted(loadData);
</script>

<style scoped>
.group-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.group-card {
	padding: 12px 16px;
	border-radius: 8px;
	border: 1px solid rgba(255, 255, 255, 0.09);
	cursor: grab;
	transition:
		background-color 0.2s,
		border-color 0.2s;
}

.group-card:hover {
	background: rgba(255, 255, 255, 0.04);
	border-color: rgba(255, 255, 255, 0.18);
}

.group-card.drag-over {
	border-color: rgba(99, 226, 183, 0.4);
}

.hidden-card {
	opacity: 0.75;
	border-style: dashed;
}

.group-name {
	font-weight: 500;
	font-size: 14px;
}

.group-meta {
	padding-left: 24px;
}

/* Proxy tag drag list in edit modal */
.proxy-tag-list {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 8px;
	padding: 8px;
	border: 1px dashed rgba(255, 255, 255, 0.12);
	border-radius: 6px;
	min-height: 40px;
}

.proxy-tag-item {
	cursor: grab;
	transition: transform 0.15s;
}

.proxy-tag-item:active {
	cursor: grabbing;
}

.proxy-tag-item.proxy-tag-drag-over {
	transform: scale(1.05);
}
</style>
