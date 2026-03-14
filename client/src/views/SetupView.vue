<template>
	<div class="setup-container">
		<n-card title="🔗 Sub Edit Helper" class="setup-card">
			<n-space vertical size="large">
				<n-text depth="3">首次使用，请设置管理员密码</n-text>
				<n-form ref="formRef" :model="form" :rules="rules">
					<n-form-item label="密码" path="password">
						<n-input
							v-model:value="form.password"
							type="password"
							placeholder="请输入密码（至少6位）"
							show-password-on="click"
							@keyup.enter="handleSetup"
						/>
					</n-form-item>
					<n-form-item label="确认密码" path="confirmPassword">
						<n-input
							v-model:value="form.confirmPassword"
							type="password"
							placeholder="请再次输入密码"
							show-password-on="click"
							@keyup.enter="handleSetup"
						/>
					</n-form-item>
				</n-form>
				<n-button
					type="primary"
					block
					:loading="loading"
					@click="handleSetup"
				>
					初始化
				</n-button>
			</n-space>
		</n-card>
	</div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import {
	useMessage,
	NCard,
	NSpace,
	NText,
	NForm,
	NFormItem,
	NInput,
	NButton,
} from "naive-ui";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const authStore = useAuthStore();
const message = useMessage();
const loading = ref(false);
const formRef = ref(null);

const form = ref({
	password: "",
	confirmPassword: "",
});

const rules = {
	password: {
		required: true,
		message: "请输入密码",
		trigger: "blur",
		min: 6,
	},
	confirmPassword: {
		required: true,
		validator: (_rule, value) => {
			if (value !== form.value.password) {
				return new Error("两次密码不一致");
			}
			return true;
		},
		trigger: "blur",
	},
};

async function handleSetup() {
	try {
		await formRef.value?.validate();
	} catch {
		return;
	}

	loading.value = true;
	try {
		await authStore.setup(form.value.password);
		message.success("初始化成功");
		router.push("/");
	} catch (err) {
		message.error(err.response?.data?.error || "初始化失败");
	} finally {
		loading.value = false;
	}
}
</script>

<style scoped>
.setup-container {
	display: flex;
	justify-content: center;
	align-items: center;
	min-height: 100vh;
	background: #1a1a2e;
}

.setup-card {
	width: 400px;
}
</style>
