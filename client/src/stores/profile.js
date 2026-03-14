import { defineStore } from 'pinia';
import api from '../api';

export const useProfileStore = defineStore('profile', {
  state: () => ({
    profiles: [],
    currentProfileId: null,
    loaded: false,
  }),
  getters: {
    currentProfile(state) {
      return state.profiles.find((p) => p.id === state.currentProfileId) || null;
    },
    defaultProfile(state) {
      return state.profiles.find((p) => p.is_default) || state.profiles[0] || null;
    },
    profileOptions(state) {
      return state.profiles.map((p) => ({
        label: p.is_default ? `${p.name}（默认）` : p.name,
        value: p.id,
      }));
    },
  },
  actions: {
    async loadProfiles() {
      try {
        const { data } = await api.get('/profiles');
        this.profiles = data;

        // Restore from localStorage or use default
        const saved = localStorage.getItem('currentProfileId');
        if (saved) {
          const savedId = parseInt(saved, 10);
          const exists = this.profiles.find((p) => p.id === savedId);
          if (exists) {
            this.currentProfileId = savedId;
          } else {
            this._setDefaultProfile();
          }
        } else {
          this._setDefaultProfile();
        }

        this.loaded = true;
      } catch {
        // ignore
      }
    },
    switchProfile(id) {
      this.currentProfileId = id;
      localStorage.setItem('currentProfileId', String(id));
    },
    _setDefaultProfile() {
      const def = this.profiles.find((p) => p.is_default) || this.profiles[0];
      if (def) {
        this.currentProfileId = def.id;
        localStorage.setItem('currentProfileId', String(def.id));
      } else {
        this.currentProfileId = null;
        localStorage.removeItem('currentProfileId');
      }
    },
    async refreshProfiles() {
      await this.loadProfiles();
    },
  },
});
