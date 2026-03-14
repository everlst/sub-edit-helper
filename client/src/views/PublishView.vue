<template>
	<n-space vertical size="large">
		<n-h2 style="margin: 0">发布中心</n-h2>

		<!-- 配置方案 -->
		<n-card title="配置方案">
			<template #header-extra>
				<n-button
					type="primary"
					size="small"
					@click="showProfileModal(null)"
					>新建方案</n-button
				>
			</template>
			<n-spin :show="profilesLoading">
				<n-empty
					v-if="profiles.length === 0"
					description="暂无配置方案，所有令牌将使用全部已启用的 Provider"
				/>
				<n-data-table
					v-else
					:columns="profileColumns"
					:data="profiles"
					:row-key="(row) => row.id"
					:bordered="false"
					size="small"
				/>
			</n-spin>
		</n-card>

		<!-- 订阅链接 -->
		<n-card title="订阅链接">
			<n-spin :show="loading">
				<n-space vertical size="large">
					<n-empty
						v-if="tokens.length === 0"
						description="暂无订阅令牌，请先生成"
					>
						<template #extra>
							<n-button type="primary" @click="generateToken"
								>生成令牌</n-button
							>
						</template>
					</n-empty>

					<div v-for="t in tokens" :key="t.id" class="token-row">
						<n-space align="center" justify="space-between">
							<n-space align="center">
								<n-tag
									:type="t.enabled ? 'success' : 'default'"
									size="small"
								>
									{{ t.enabled ? "启用" : "禁用" }}
								</n-tag>
								<n-input-group>
									<n-input
										:value="getSubUrl(t.token)"
										readonly
										style="width: 500px"
									/>
									<n-button @click="copyUrl(t.token)"
										>复制</n-button
									>
								</n-input-group>
							</n-space>
							<n-space align="center">
								<n-switch
									:value="t.enabled"
									@update:value="
										(val) => toggleToken(t.id, val)
									"
								>
									<template #checked>启用</template>
									<template #unchecked>禁用</template>
								</n-switch>
								<n-popconfirm
									@positive-click="deleteToken(t.id)"
								>
									<template #trigger>
										<n-button
											type="error"
											size="small"
											quaternary
											>删除</n-button
										>
									</template>
									确定吊销该令牌？
								</n-popconfirm>
							</n-space>
						</n-space>
						<n-space align="center" style="margin-top: 4px">
							<n-text depth="3" style="font-size: 12px">
								最后访问：{{ t.last_accessed_at || "从未" }}
							</n-text>
							<n-text depth="3" style="font-size: 12px">·</n-text>
							<n-text depth="3" style="font-size: 12px"
								>配置方案：</n-text
							>
							<n-select
								:value="t.profile_id"
								:options="profileSelectOptions"
								size="tiny"
								style="width: 180px"
								@update:value="
									(val) => updateTokenProfile(t.id, val)
								"
							/>
						</n-space>
					</div>

					<n-button v-if="tokens.length > 0" @click="generateToken"
						>生成新令牌</n-button
					>
				</n-space>
			</n-spin>
		</n-card>

		<n-card title="配置操作">
			<n-space>
				<n-button
					type="primary"
					:loading="previewing"
					@click="previewConfig"
					>预览配置</n-button
				>
				<n-button @click="downloadConfig">下载 YAML</n-button>
			</n-space>
		</n-card>

		<n-card v-if="previewYaml" title="配置预览">
			<n-code
				:code="previewYaml"
				language="yaml"
				style="max-height: 500px; overflow: auto"
			/>
		</n-card>

		<n-card title="版本历史">
			<n-spin :show="versionsLoading">
				<n-data-table
					:columns="versionColumns"
					:data="versions"
					:row-key="(row) => row.id"
					:bordered="false"
					size="small"
				/>
			</n-spin>
		</n-card>

		<!-- Profile 编辑弹窗 -->
		<n-modal
			v-model:show="profileModalVisible"
			preset="dialog"
			:title="editingProfile ? '编辑配置方案' : '新建配置方案'"
		>
			<n-form label-placement="left" label-width="100">
				<n-form-item v-if="!editingProfile" label="复制自">
					<n-select
						v-model:value="profileForm.copy_from"
						:options="copyFromOptions"
						clearable
						placeholder="不复制（从空白开始）"
					/>
				</n-form-item>
				<n-form-item label="方案名称">
					<n-input
						v-model:value="profileForm.name"
						placeholder="如：日常使用"
					/>
				</n-form-item>
				<n-form-item label="输出文件名">
					<n-input-group>
						<n-input
							v-model:value="profileForm.filename"
							placeholder="config"
						/>
						<n-input-group-label>.yaml</n-input-group-label>
					</n-input-group>
				</n-form-item>
				<n-form-item label="选择机场">
					<n-checkbox-group v-model:value="profileForm.provider_ids">
						<n-space vertical>
							<n-checkbox
								v-for="p in allProviders"
								:key="p.id"
								:value="p.id"
								:label="p.name"
							/>
						</n-space>
					</n-checkbox-group>
				</n-form-item>
			</n-form>
			<template #action>
				<n-button @click="profileModalVisible = false">取消</n-button>
				<n-button
					type="primary"
					:loading="profileSubmitting"
					@click="handleProfileSubmit"
					>确定</n-button
				>
			</template>
		</n-modal>
	</n-space>
</template>

<script setup>
import { ref, h, computed, onMounted } from "vue";
import {
	NH2,
	NSpace,
	NCard,
	NButton,
	NInput,
	NInputGroup,
	NInputGroupLabel,
	NTag,
	NCode,
	NSwitch,
	NText,
	NSpin,
	NEmpty,
	NDataTable,
	NPopconfirm,
	NSelect,
	NModal,
	NForm,
	NFormItem,
	NCheckboxGroup,
	NCheckbox,
	useMessage,
} from "naive-ui";
import api from "../api";
import { useProfileStore } from "../stores/profile";

const message = useMessage();
const profileStore = useProfileStore();

// --- State ---
const loading = ref(false);
const previewing = ref(false);
const versionsLoading = ref(false);
const profilesLoading = ref(false);
const profileSubmitting = ref(false);

const tokens = ref([]);
const previewYaml = ref("");
const versions = ref([]);
const profiles = ref([]);
const allProviders = ref([]);
const subscriptionDomain = ref("");

// Profile modal
const profileModalVisible = ref(false);
const editingProfile = ref(null);
const profileForm = ref({
	name: "",
	filename: "config",
	provider_ids: [],
	copy_from: null,
});

// Copy-from options for profile creation
const copyFromOptions = computed(() =>
	profiles.value.map((p) => ({ label: p.name, value: p.id })),
);

// --- Subscription URL ---
function getSubUrl(token) {
	const domain = subscriptionDomain.value
		? subscriptionDomain.value.replace(/\/+$/, "")
		: window.location.origin;
	return `${domain}/sub/${token}`;
}

function copyUrl(token) {
	navigator.clipboard.writeText(getSubUrl(token));
	message.success("已复制到剪贴板");
}

// --- Settings ---
async function loadSettings() {
	try {
		const { data } = await api.get("/settings");
		subscriptionDomain.value = data.subscription_domain || "";
	} catch {
		// ignore
	}
}

// --- Tokens ---
async function loadTokens() {
	loading.value = true;
	try {
		const { data } = await api.get("/settings/tokens");
		tokens.value = data;
	} finally {
		loading.value = false;
	}
}

async function generateToken() {
	try {
		await api.post("/settings/tokens");
		message.success("令牌已生成");
		await loadTokens();
	} catch {
		message.error("生成失败");
	}
}

async function toggleToken(id, enabled) {
	try {
		await api.put(`/settings/tokens/${id}`, { enabled });
		await loadTokens();
	} catch {
		message.error("操作失败");
	}
}

async function deleteToken(id) {
	try {
		await api.delete(`/settings/tokens/${id}`);
		message.success("令牌已吊销");
		await loadTokens();
	} catch {
		message.error("删除失败");
	}
}

async function updateTokenProfile(tokenId, profileId) {
	try {
		await api.put(`/settings/tokens/${tokenId}`, { profile_id: profileId });
		await loadTokens();
	} catch {
		message.error("操作失败");
	}
}

// --- Profiles ---
const profileSelectOptions = computed(() => [
	{ label: "全部 Provider", value: null },
	...profiles.value.map((p) => ({ label: p.name, value: p.id })),
]);

async function loadProfiles() {
	profilesLoading.value = true;
	try {
		const { data } = await api.get("/profiles");
		profiles.value = data;
	} finally {
		profilesLoading.value = false;
	}
}

async function loadProviders() {
	try {
		const { data } = await api.get("/providers");
		allProviders.value = data;
	} catch {
		// ignore
	}
}

function showProfileModal(profile) {
	if (profile) {
		editingProfile.value = profile.id;
		profileForm.value = {
			name: profile.name,
			filename: profile.filename || "config",
			provider_ids: profile.provider_ids || [],
			copy_from: null,
		};
	} else {
		editingProfile.value = null;
		profileForm.value = {
			name: "",
			filename: "config",
			provider_ids: [],
			copy_from: null,
		};
	}
	profileModalVisible.value = true;
}

async function handleProfileSubmit() {
	if (!profileForm.value.name?.trim()) {
		message.warning("请输入方案名称");
		return;
	}
	if (profileForm.value.provider_ids.length === 0) {
		message.warning("请至少选择一个机场");
		return;
	}
	// Sanitize filename
	const fn = (profileForm.value.filename || "config").replace(
		/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g,
		"",
	);
	if (!fn) {
		message.warning("文件名不合法");
		return;
	}

	profileSubmitting.value = true;
	try {
		const payload = {
			name: profileForm.value.name,
			filename: fn,
			provider_ids: profileForm.value.provider_ids,
		};
		if (editingProfile.value) {
			await api.put(`/profiles/${editingProfile.value}`, payload);
			message.success("方案已更新");
		} else {
			if (profileForm.value.copy_from) {
				payload.copy_from = profileForm.value.copy_from;
			}
			await api.post("/profiles", payload);
			message.success("方案已创建");
		}
		profileModalVisible.value = false;
		await loadProfiles();
		await profileStore.refreshProfiles();
	} catch (err) {
		message.error(err.response?.data?.error || "操作失败");
	} finally {
		profileSubmitting.value = false;
	}
}

async function deleteProfile(id) {
	try {
		await api.delete(`/profiles/${id}`);
		message.success("方案已删除");
		await Promise.all([loadProfiles(), loadTokens()]);
		await profileStore.refreshProfiles();
	} catch {
		message.error("删除失败");
	}
}

// --- Profile table columns ---
const profileColumns = [
	{
		title: "方案名称",
		key: "name",
		width: 180,
		render(row) {
			const children = [row.name];
			if (row.is_default) {
				children.push(
					h(
						NTag,
						{
							size: "small",
							type: "success",
							style: "margin-left: 6px",
						},
						() => "默认",
					),
				);
			}
			return h(NSpace, { align: "center", size: 4 }, () => children);
		},
	},
	{
		title: "关联机场",
		key: "provider_ids",
		render(row) {
			const names = (row.provider_ids || []).map((pid) => {
				const p = allProviders.value.find((pp) => pp.id === pid);
				return p ? p.name : `#${pid}`;
			});
			return names.join(", ") || "-";
		},
	},
	{
		title: "输出文件名",
		key: "filename",
		width: 150,
		render(row) {
			return `${row.filename || "config"}.yaml`;
		},
	},
	{
		title: "操作",
		key: "actions",
		width: 220,
		render(row) {
			return h(NSpace, { size: "small" }, () => [
				!row.is_default
					? h(
							NButton,
							{
								size: "small",
								quaternary: true,
								onClick: () => setDefaultProfile(row.id),
							},
							() => "设为默认",
						)
					: null,
				h(
					NButton,
					{
						size: "small",
						quaternary: true,
						onClick: () => showProfileModal(row),
					},
					() => "编辑",
				),
				h(
					NPopconfirm,
					{ onPositiveClick: () => deleteProfile(row.id) },
					{
						trigger: () =>
							h(
								NButton,
								{
									size: "small",
									quaternary: true,
									type: "error",
								},
								() => "删除",
							),
						default: () =>
							"确定删除该配置方案？将同时删除关联的策略组、规则和订阅令牌。",
					},
				),
			]);
		},
	},
];

// --- Config operations ---
async function previewConfig() {
	previewing.value = true;
	try {
		const payload = {};
		if (profileStore.currentProfileId) {
			payload.profile_id = profileStore.currentProfileId;
		}
		const { data } = await api.post("/config/preview", payload);
		previewYaml.value = data.yaml;
	} catch (err) {
		message.error(err.response?.data?.error || "预览失败");
	} finally {
		previewing.value = false;
	}
}

function downloadConfig() {
	const pid = profileStore.currentProfileId;
	const url = pid
		? `/api/config/download?profile_id=${pid}`
		: "/api/config/download";
	window.open(url, "_blank");
}

async function setDefaultProfile(id) {
	try {
		await api.put(`/profiles/${id}/default`);
		message.success("已设为默认");
		await loadProfiles();
		await profileStore.refreshProfiles();
	} catch {
		message.error("操作失败");
	}
}

async function loadVersions() {
	versionsLoading.value = true;
	try {
		const { data } = await api.get("/config/versions");
		versions.value = data;
	} finally {
		versionsLoading.value = false;
	}
}

const versionColumns = [
	{ title: "ID", key: "id", width: 60 },
	{ title: "触发方式", key: "trigger_source", width: 100 },
	{ title: "时间", key: "created_at", width: 200 },
	{
		title: "操作",
		key: "actions",
		width: 100,
		render(row) {
			return h(
				NPopconfirm,
				{ onPositiveClick: () => rollbackVersion(row.id) },
				{
					trigger: () =>
						h(
							NButton,
							{ size: "small", type: "warning" },
							() => "回滚",
						),
					default: () => "确定回滚到此版本？",
				},
			);
		},
	},
];

async function rollbackVersion(id) {
	try {
		await api.post(`/config/rollback/${id}`);
		message.success("已回滚");
		await loadVersions();
	} catch {
		message.error("回滚失败");
	}
}

onMounted(() => {
	loadSettings();
	loadProviders();
	loadProfiles();
	loadTokens();
	loadVersions();
});
</script>

<style scoped>
.token-row {
	padding: 8px 0;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.token-row:last-child {
	border-bottom: none;
}
</style>
