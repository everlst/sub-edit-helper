<template>
	<n-config-provider
		:theme="darkTheme"
		:locale="zhCN"
		:date-locale="dateZhCN"
	>
		<n-message-provider>
			<n-dialog-provider>
				<n-notification-provider>
					<router-view />
				</n-notification-provider>
			</n-dialog-provider>
		</n-message-provider>
	</n-config-provider>
</template>

<script setup>
import { darkTheme, zhCN, dateZhCN } from "naive-ui";
import {
	NConfigProvider,
	NMessageProvider,
	NDialogProvider,
	NNotificationProvider,
} from "naive-ui";
</script>
