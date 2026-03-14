<template>
	<n-layout has-sider class="main-layout">
		<n-layout-sider
			bordered
			collapse-mode="width"
			:collapsed-width="64"
			:width="220"
			show-trigger
			:collapsed="collapsed"
			@collapse="collapsed = true"
			@expand="collapsed = false"
		>
			<div class="logo" :class="{ collapsed }">
				<span class="logo-icon">🔗</span>
				<span v-if="!collapsed" class="logo-text">Sub Edit Helper</span>
			</div>
			<n-menu
				:collapsed="collapsed"
				:collapsed-width="64"
				:collapsed-icon-size="22"
				:options="menuOptions"
				:value="activeKey"
				@update:value="handleMenuClick"
			/>
		</n-layout-sider>
		<n-layout>
			<n-layout-header bordered class="header">
				<div class="header-left">
					<n-space
						align="center"
						:size="8"
						v-if="profileStore.profiles.length > 0"
					>
						<n-text
							depth="3"
							style="font-size: 13px; white-space: nowrap"
							>配置方案：</n-text
						>
						<n-select
							:value="profileStore.currentProfileId"
							:options="profileStore.profileOptions"
							size="small"
							style="width: 200px"
							@update:value="handleProfileSwitch"
						/>
					</n-space>
					<n-text v-else depth="3" style="font-size: 13px">
						请先在「发布中心」创建配置方案
					</n-text>
				</div>
				<div class="header-right">
					<n-button text @click="handleLogout">
						<template #icon>
							<n-icon><log-out-outline /></n-icon>
						</template>
						退出
					</n-button>
				</div>
			</n-layout-header>
			<n-layout-content class="content">
				<router-view />
			</n-layout-content>
		</n-layout>
	</n-layout>
</template>

<script setup>
import { h, ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import {
	NLayout,
	NLayoutSider,
	NLayoutHeader,
	NLayoutContent,
	NMenu,
	NIcon,
	NButton,
	NSelect,
	NSpace,
	NText,
} from "naive-ui";
import {
	AirplaneOutline,
	GitNetworkOutline,
	CodeSlashOutline,
	CloudUploadOutline,
	SettingsOutline,
	LogOutOutline,
} from "@vicons/ionicons5";
import { useAuthStore } from "../stores/auth";
import { useProfileStore } from "../stores/profile";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const profileStore = useProfileStore();
const collapsed = ref(false);

// Load profiles on mount
onMounted(() => {
	profileStore.loadProfiles();
});

function handleProfileSwitch(id) {
	profileStore.switchProfile(id);
}

function renderIcon(icon) {
	return () => h(NIcon, null, { default: () => h(icon) });
}

const menuOptions = [
	{ label: "机场订阅", key: "Providers", icon: renderIcon(AirplaneOutline) },
	{ label: "分组编排", key: "Groups", icon: renderIcon(GitNetworkOutline) },
	{ label: "规则编辑", key: "Rules", icon: renderIcon(CodeSlashOutline) },
	{ label: "发布中心", key: "Publish", icon: renderIcon(CloudUploadOutline) },
	{ label: "系统设置", key: "Settings", icon: renderIcon(SettingsOutline) },
];

const activeKey = computed(() => route.name);

function handleMenuClick(key) {
	router.push({ name: key });
}

async function handleLogout() {
	await authStore.logout();
	router.push("/login");
}
</script>

<style scoped>
.main-layout {
	height: 100vh;
}

.logo {
	display: flex;
	align-items: center;
	padding: 16px;
	gap: 8px;
	font-size: 16px;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
}

.logo.collapsed {
	justify-content: center;
	padding: 16px 0;
}

.logo-icon {
	font-size: 24px;
	flex-shrink: 0;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0 24px;
	height: 52px;
}

.header-left {
	display: flex;
	align-items: center;
	gap: 8px;
}

.header-right {
	display: flex;
	align-items: center;
	gap: 16px;
}

.content {
	padding: 24px;
	overflow-y: auto;
	height: calc(100vh - 52px);
}
</style>
