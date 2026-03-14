<template>
	<div class="login-container">
		<n-card title="🔗 Sub Edit Helper" class="login-card">
			<n-space vertical size="large">
				<n-text depth="3">请输入管理员密码</n-text>
				<n-input
					v-model:value="password"
					type="password"
					placeholder="密码"
					show-password-on="click"
					@keyup.enter="handleLogin"
				/>
				<n-button
					type="primary"
					block
					:loading="loading"
					@click="handleLogin"
				>
					登录
				</n-button>
			</n-space>
		</n-card>
	</div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useMessage, NCard, NSpace, NText, NInput, NButton } from "naive-ui";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const authStore = useAuthStore();
const message = useMessage();
const password = ref("");
const loading = ref(false);

async function handleLogin() {
	if (!password.value) {
		message.warning("请输入密码");
		return;
	}

	loading.value = true;
	try {
		await authStore.login(password.value);
		message.success("登录成功");
		router.push("/");
	} catch (err) {
		message.error(err.response?.data?.error || "登录失败");
	} finally {
		loading.value = false;
	}
}
</script>

<style scoped>
.login-container {
	display: flex;
	justify-content: center;
	align-items: center;
	min-height: 100vh;
	background: #1a1a2e;
}

.login-card {
	width: 400px;
}
</style>
