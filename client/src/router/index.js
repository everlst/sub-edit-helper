import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('../views/SetupView.vue'),
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Providers',
        component: () => import('../views/ProvidersView.vue'),
      },
      {
        path: 'groups',
        name: 'Groups',
        component: () => import('../views/GroupsView.vue'),
      },
      {
        path: 'rules',
        name: 'Rules',
        component: () => import('../views/RulesView.vue'),
      },
      {
        path: 'publish',
        name: 'Publish',
        component: () => import('../views/PublishView.vue'),
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('../views/SettingsView.vue'),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Navigation guard
router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  // Check if admin is initialized
  if (!authStore.statusChecked) {
    await authStore.checkStatus();
  }

  // If not initialized, redirect to setup
  if (!authStore.initialized && to.name !== 'Setup') {
    return { name: 'Setup' };
  }

  // If initialized but not logged in, redirect to login
  if (authStore.initialized && !authStore.isLoggedIn && to.meta.requiresAuth) {
    return { name: 'Login' };
  }

  // If already logged in, skip login/setup pages
  if (authStore.isLoggedIn && (to.name === 'Login' || to.name === 'Setup')) {
    return { name: 'Providers' };
  }
});

export default router;
