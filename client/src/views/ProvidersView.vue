<template>
	<n-space vertical size="large">
		<n-space justify="space-between" align="center">
			<n-h2 style="margin: 0">机场订阅管理</n-h2>
			<n-button type="primary" @click="showAddModal = true">
				<template #icon
					><n-icon><add-outline /></n-icon
				></template>
				添加机场
			</n-button>
		</n-space>

		<n-spin :show="loading">
			<n-data-table
				:columns="columns"
				:data="providers"
				:row-key="(row) => row.id"
				:bordered="false"
			/>
		</n-spin>

		<!-- Add/Edit Modal -->
		<n-modal
			v-model:show="showAddModal"
			preset="dialog"
			:title="editingId ? '编辑机场' : '添加机场'"
		>
			<n-form
				ref="formRef"
				:model="form"
				:rules="formRules"
				label-placement="left"
				label-width="80"
			>
				<n-form-item label="名称" path="name">
					<n-input
						v-model:value="form.name"
						placeholder="如：机场A"
					/>
				</n-form-item>
				<n-form-item label="订阅链接" path="url">
					<n-input
						v-model:value="form.url"
						type="textarea"
						placeholder="https://..."
						:rows="3"
					/>
				</n-form-item>
				<n-form-item label="节点过滤" path="filter">
					<n-input
						v-model:value="form.filter"
						placeholder="正则表达式（可选）"
					/>
				</n-form-item>
				<n-divider style="margin: 8px 0">订阅信息展示</n-divider>
				<n-form-item label="展示订阅信息">
					<n-switch v-model:value="form.show_sub_info" />
					<n-text
						depth="3"
						style="margin-left: 12px; font-size: 12px"
					>
						开启后在策略组中展示剩余流量、到期时间等节点
					</n-text>
				</n-form-item>
				<template v-if="form.show_sub_info">
					<n-form-item label="信息过滤">
						<n-input
							v-model:value="form.sub_info_filter"
							placeholder="Traffic|Expire"
						/>
					</n-form-item>
					<n-form-item label="节点前缀">
						<n-input
							v-model:value="form.sub_info_prefix"
							:placeholder="`[${form.name || '机场名'}] `"
						/>
					</n-form-item>
				</template>
			</n-form>
			<template #action>
				<n-button @click="showAddModal = false">取消</n-button>
				<n-button
					type="primary"
					:loading="submitting"
					@click="handleSubmit"
					>确定</n-button
				>
			</template>
		</n-modal>
	</n-space>
</template>

<script setup>
import { ref, h, onMounted } from "vue";
import {
	NH2,
	NSpace,
	NButton,
	NIcon,
	NDataTable,
	NModal,
	NForm,
	NFormItem,
	NInput,
	NSwitch,
	NTag,
	NSpin,
	NPopconfirm,
	NDivider,
	NText,
	useMessage,
} from "naive-ui";
import {
	AddOutline,
	RefreshOutline,
	TrashOutline,
	CreateOutline,
} from "@vicons/ionicons5";
import api from "../api";

const message = useMessage();
const loading = ref(false);
const submitting = ref(false);
const providers = ref([]);
const showAddModal = ref(false);
const editingId = ref(null);
const formRef = ref(null);

const form = ref({
	name: "",
	url: "",
	filter: "",
	show_sub_info: false,
	sub_info_filter: "Traffic|Expire",
	sub_info_prefix: "",
});
const formRules = {
	name: { required: true, message: "请输入名称" },
	url: { required: true, message: "请输入订阅链接" },
};

function formatBytes(bytes) {
	if (!bytes || bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const columns = [
	{ title: "名称", key: "name", width: 150 },
	{
		title: "订阅地址",
		key: "url_masked",
		width: 200,
		ellipsis: { tooltip: true },
	},
	{
		title: "状态",
		key: "enabled",
		width: 80,
		render(row) {
			return h(NSwitch, {
				value: row.enabled,
				onUpdateValue: (val) => toggleEnabled(row.id, val),
			});
		},
	},
	{
		title: "流量",
		key: "traffic",
		width: 180,
		render(row) {
			const d = row.check_data;
			if (!d?.total)
				return h(
					NTag,
					{ type: "default", size: "small" },
					() => "未检查",
				);
			const used = (d.upload || 0) + (d.download || 0);
			return h("span", `${formatBytes(used)} / ${formatBytes(d.total)}`);
		},
	},
	{
		title: "到期",
		key: "expire",
		width: 120,
		render(row) {
			const d = row.check_data;
			if (!d?.expire_date) return "-";
			return new Date(d.expire_date).toLocaleDateString("zh-CN");
		},
	},
	{
		title: "节点数",
		key: "node_count",
		width: 80,
		render(row) {
			return row.check_data?.node_count ?? "-";
		},
	},
	{
		title: "操作",
		key: "actions",
		width: 200,
		render(row) {
			return h(NSpace, { size: "small" }, () => [
				h(
					NButton,
					{
						size: "small",
						quaternary: true,
						onClick: () => handleCheck(row.id),
					},
					{
						icon: () => h(NIcon, null, () => h(RefreshOutline)),
					},
				),
				h(
					NButton,
					{
						size: "small",
						quaternary: true,
						onClick: () => handleEdit(row),
					},
					{
						icon: () => h(NIcon, null, () => h(CreateOutline)),
					},
				),
				h(
					NPopconfirm,
					{ onPositiveClick: () => handleDelete(row.id) },
					{
						trigger: () =>
							h(
								NButton,
								{
									size: "small",
									quaternary: true,
									type: "error",
								},
								{
									icon: () =>
										h(NIcon, null, () => h(TrashOutline)),
								},
							),
						default: () => "确定删除该机场？",
					},
				),
			]);
		},
	},
];

async function loadProviders() {
	loading.value = true;
	try {
		const { data } = await api.get("/providers");
		providers.value = data;
	} catch (err) {
		message.error("加载失败");
	} finally {
		loading.value = false;
	}
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
			await api.put(`/providers/${editingId.value}`, form.value);
			message.success("更新成功");
		} else {
			await api.post("/providers", form.value);
			message.success("添加成功");
		}
		showAddModal.value = false;
		editingId.value = null;
		form.value = {
			name: "",
			url: "",
			filter: "",
			show_sub_info: false,
			sub_info_filter: "Traffic|Expire",
			sub_info_prefix: "",
		};
		await loadProviders();
	} catch (err) {
		message.error(err.response?.data?.error || "操作失败");
	} finally {
		submitting.value = false;
	}
}

function handleEdit(row) {
	editingId.value = row.id;
	form.value = {
		name: row.name,
		url: "",
		filter: row.filter,
		show_sub_info: !!row.show_sub_info,
		sub_info_filter: row.sub_info_filter || "Traffic|Expire",
		sub_info_prefix: row.sub_info_prefix || "",
	};
	showAddModal.value = true;
}

async function handleDelete(id) {
	try {
		await api.delete(`/providers/${id}`);
		message.success("删除成功");
		await loadProviders();
	} catch {
		message.error("删除失败");
	}
}

async function handleCheck(id) {
	try {
		message.loading("正在检查...");
		await api.post(`/providers/${id}/check`);
		message.success("检查完成");
		await loadProviders();
	} catch (err) {
		message.error(err.response?.data?.error || "检查失败");
	}
}

async function toggleEnabled(id, val) {
	try {
		await api.put(`/providers/${id}`, { enabled: val });
		await loadProviders();
	} catch {
		message.error("操作失败");
	}
}

onMounted(loadProviders);
</script>
