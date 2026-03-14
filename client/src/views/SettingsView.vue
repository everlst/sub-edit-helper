<template>
	<n-space vertical size="large">
		<n-h2 style="margin: 0">系统设置</n-h2>

		<n-card title="服务地址">
			<n-text depth="3" style="display: block; margin-bottom: 12px">
				配置中 proxy-providers 使用的服务基础
				URL（必须是客户端可访问的地址）
			</n-text>
			<n-input
				v-model:value="baseUrl"
				placeholder="如：http://192.168.1.100:3000"
			/>
			<template #action>
				<n-button
					type="primary"
					:loading="savingUrl"
					@click="saveBaseUrl"
					>保存</n-button
				>
			</template>
		</n-card>

		<n-card title="订阅域名">
			<n-text depth="3" style="display: block; margin-bottom: 12px">
				用于生成订阅链接的外部访问地址（如通过反代暴露的公网域名）。未设置时使用当前浏览器地址。
			</n-text>
			<n-input
				v-model:value="subscriptionDomain"
				placeholder="如：https://sub.example.com:15469"
			/>
			<template #action>
				<n-button
					type="primary"
					:loading="savingSubDomain"
					@click="saveSubscriptionDomain"
					>保存</n-button
				>
			</template>
		</n-card>

		<n-card title="修改密码">
			<n-form label-placement="left" label-width="100">
				<n-form-item label="新密码">
					<n-input
						v-model:value="newPassword"
						type="password"
						placeholder="新密码（至少6位）"
						show-password-on="click"
					/>
				</n-form-item>
				<n-form-item label="确认密码">
					<n-input
						v-model:value="confirmPassword"
						type="password"
						placeholder="确认新密码"
						show-password-on="click"
					/>
				</n-form-item>
			</n-form>
			<template #action>
				<n-button
					type="warning"
					:loading="changingPwd"
					@click="changePassword"
					>修改密码</n-button
				>
			</template>
		</n-card>

		<n-card title="DNS 覆盖">
			<n-text depth="3" style="display: block; margin-bottom: 12px">
				自定义 DNS 配置（JSON 格式），覆盖默认和机场源 DNS 设置
			</n-text>
			<textarea
				v-model="dnsOverride"
				class="json-editor"
				spellcheck="false"
				placeholder='{ "nameserver": ["https://dns.google/dns-query"] }'
			/>
			<template #action>
				<n-button type="primary" :loading="savingDns" @click="saveDns"
					>保存 DNS</n-button
				>
			</template>
		</n-card>

		<n-card title="数据备份">
			<n-space>
				<n-button @click="exportBackup">导出备份</n-button>
			</n-space>
		</n-card>
	</n-space>
</template>

<script setup>
import { ref, onMounted } from "vue";
import {
	NH2,
	NSpace,
	NCard,
	NText,
	NForm,
	NFormItem,
	NInput,
	NButton,
	useMessage,
} from "naive-ui";
import api from "../api";

const message = useMessage();
const baseUrl = ref("");
const subscriptionDomain = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const dnsOverride = ref("");
const savingUrl = ref(false);
const savingSubDomain = ref(false);
const changingPwd = ref(false);
const savingDns = ref(false);

async function loadSettings() {
	try {
		const { data } = await api.get("/settings");
		baseUrl.value = data.base_url || "";
		subscriptionDomain.value = data.subscription_domain || "";
		dnsOverride.value = data.dns_override || "";
	} catch {
		// ignore
	}
}

async function saveBaseUrl() {
	savingUrl.value = true;
	try {
		await api.put("/settings", { base_url: baseUrl.value });
		message.success("服务地址已保存");
	} catch {
		message.error("保存失败");
	} finally {
		savingUrl.value = false;
	}
}

async function saveSubscriptionDomain() {
	savingSubDomain.value = true;
	try {
		await api.put("/settings", {
			subscription_domain: subscriptionDomain.value,
		});
		message.success("订阅域名已保存");
	} catch {
		message.error("保存失败");
	} finally {
		savingSubDomain.value = false;
	}
}

async function changePassword() {
	if (!newPassword.value || newPassword.value.length < 6) {
		message.warning("密码至少6位");
		return;
	}
	if (newPassword.value !== confirmPassword.value) {
		message.warning("两次密码不一致");
		return;
	}

	changingPwd.value = true;
	try {
		await api.post("/auth/setup", { password: newPassword.value });
		message.success("密码已修改");
		newPassword.value = "";
		confirmPassword.value = "";
	} catch (err) {
		message.error(err.response?.data?.error || "修改失败");
	} finally {
		changingPwd.value = false;
	}
}

async function saveDns() {
	// Validate JSON
	if (dnsOverride.value.trim()) {
		try {
			JSON.parse(dnsOverride.value);
		} catch {
			message.error("DNS 配置必须是有效的 JSON 格式");
			return;
		}
	}

	savingDns.value = true;
	try {
		await api.put("/settings", { dns_override: dnsOverride.value });
		message.success("DNS 配置已保存");
	} catch {
		message.error("保存失败");
	} finally {
		savingDns.value = false;
	}
}

function exportBackup() {
	// Export all settings as a download
	window.open("/api/config/download", "_blank");
	message.info("已触发配置下载");
}

onMounted(loadSettings);
</script>

<style scoped>
.json-editor {
	width: 100%;
	min-height: 150px;
	padding: 16px;
	background: rgba(0, 0, 0, 0.3);
	color: #e0e0e0;
	border: 1px solid rgba(255, 255, 255, 0.15);
	border-radius: 6px;
	outline: none;
	font-family: "Fira Code", "Consolas", monospace;
	font-size: 13px;
	line-height: 1.6;
	resize: vertical;
}
</style>
