import { defineStore } from 'pinia';
import api from '../api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    initialized: false,
    isLoggedIn: false,
    statusChecked: false,
  }),
  actions: {
    async checkStatus() {
      try {
        const { data } = await api.get('/auth/status');
        this.initialized = data.initialized;
        this.statusChecked = true;

        // Try to verify existing cookie
        if (this.initialized) {
          try {
            await api.get('/providers');
            this.isLoggedIn = true;
          } catch {
            this.isLoggedIn = false;
          }
        }
      } catch {
        this.statusChecked = true;
      }
    },
    async setup(password) {
      const { data } = await api.post('/auth/setup', { password });
      this.initialized = true;
      this.isLoggedIn = true;
      return data;
    },
    async login(password) {
      const { data } = await api.post('/auth/login', { password });
      this.isLoggedIn = true;
      return data;
    },
    async logout() {
      await api.post('/auth/logout');
      this.isLoggedIn = false;
    },
  },
});
