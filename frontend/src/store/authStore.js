import { create } from 'zustand';
import api from '../utils/api';

const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('floreria_token'),
  isAuthenticated: !!localStorage.getItem('floreria_token'),
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('floreria_token', data.token);
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false });
      return { success: true };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, message: error.response?.data?.message || 'Error de conexión' };
    }
  },

  logout: () => {
    localStorage.removeItem('floreria_token');
    set({ user: null, token: null, isAuthenticated: false });
    
  },

  fetchProfile: async () => {
    try {
      const { data } = await api.get('/auth/profile');
      set({ user: data.user });
    } catch { get().logout(); }
  }
}));

export default useAuthStore;
