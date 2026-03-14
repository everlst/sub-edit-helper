<template>
	<n-space vertical size="large">
		<n-space justify="space-between" align="center">
			<n-h2 style="margin: 0">规则编辑器</n-h2>
			<n-space v-if="profileStore.currentProfileId">
				<n-button @click="resetRules">重置为默认</n-button>
				<n-button type="primary" :loading="saving" @click="saveRules"
					>保存</n-button
				>
			</n-space>
		</n-space>

		<n-empty
			v-if="!profileStore.currentProfileId"
			description="请先在「发布中心」创建并选择一个配置方案"
		/>

		<template v-if="profileStore.currentProfileId">
			<n-text depth="3">
				自定义规则覆盖。使用 YAML 格式，支持
				<n-tag size="small">add</n-tag> 添加规则和
				<n-tag size="small">remove</n-tag> 移除内置规则。
			</n-text>

			<n-card title="内置规则（只读）" :bordered="true">
				<n-collapse>
					<n-collapse-item title="查看内置规则" name="builtin">
						<n-code :code="builtinRules" language="yaml" />
					</n-collapse-item>
				</n-collapse>
			</n-card>

			<n-card title="用户覆盖规则">
				<n-text depth="3" style="display: block; margin-bottom: 12px">
					示例格式：
				</n-text>
				<n-code
					:code="exampleOverride"
					language="yaml"
					style="margin-bottom: 16px; opacity: 0.7"
				/>
				<div class="editor-wrapper">
					<textarea
						v-model="userOverrides"
						class="yaml-editor"
						spellcheck="false"
						placeholder="# 在此输入覆盖规则..."
					/>
				</div>
			</n-card>
		</template>
	</n-space>
</template>

<script setup>
import { ref, onMounted, watch } from "vue";
import {
	NH2,
	NSpace,
	NCard,
	NText,
	NTag,
	NButton,
	NCode,
	NCollapse,
	NCollapseItem,
	NEmpty,
	useMessage,
	useDialog,
} from "naive-ui";
import api from "../api";
import { useProfileStore } from "../stores/profile";

const message = useMessage();
const dialog = useDialog();
const profileStore = useProfileStore();
const saving = ref(false);
const builtinRules = ref("");
const userOverrides = ref("");

const exampleOverride = `# 添加规则（插入到 MATCH 兜底之前）
add:
  - "DOMAIN-SUFFIX,example.com,🚀 节点选择"
  - "DOMAIN-KEYWORD,openai,🚀 节点选择"

# 移除内置规则
remove:
  - "DOMAIN-SUFFIX,microsoft.com,DIRECT"`;

async function loadRules() {
	const pid = profileStore.currentProfileId;
	if (!pid) return;
	try {
		const { data } = await api.get("/rules", {
			params: { profile_id: pid },
		});
		builtinRules.value = data.builtin || "";
		userOverrides.value = data.user_overrides || "";
	} catch {
		message.error("加载规则失败");
	}
}

async function saveRules() {
	saving.value = true;
	try {
		await api.put("/rules", {
			user_overrides: userOverrides.value,
			profile_id: profileStore.currentProfileId,
		});
		message.success("规则已保存");
	} catch {
		message.error("保存失败");
	} finally {
		saving.value = false;
	}
}

// Watch profile changes and reload
watch(
	() => profileStore.currentProfileId,
	(newId) => {
		if (newId) loadRules();
	},
);

function resetRules() {
	dialog.warning({
		title: "确认重置",
		content: "将清除所有自定义规则覆盖，恢复为纯内置规则。",
		positiveText: "确定重置",
		negativeText: "取消",
		onPositiveClick: async () => {
			userOverrides.value = "";
			await saveRules();
		},
	});
}

onMounted(loadRules);
</script>

<style scoped>
.editor-wrapper {
	border: 1px solid rgba(255, 255, 255, 0.15);
	border-radius: 6px;
	overflow: hidden;
}

.yaml-editor {
	width: 100%;
	min-height: 300px;
	padding: 16px;
	background: rgba(0, 0, 0, 0.3);
	color: #e0e0e0;
	border: none;
	outline: none;
	font-family: "Fira Code", "Consolas", monospace;
	font-size: 13px;
	line-height: 1.6;
	resize: vertical;
	tab-size: 2;
}
</style>
