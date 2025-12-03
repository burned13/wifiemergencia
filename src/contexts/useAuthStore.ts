import { create } from 'zustand';
import { SUPABASE_CONFIGURED } from '../config/supabase';
import { User, UserDevice } from '../types';
import { AuthService } from '../services/authService';
import { DeviceService } from '../services/deviceService';

interface AuthState {
  user: User | null;
  device: UserDevice | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  signUp: (email: string, password: string, username: string) => Promise<void>;
  signUpWithRegister: (email: string, password: string, username: string, ssid: string, code: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  getCurrentUser: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  registerDevice: (customName?: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  device: null,
  isLoading: false,
  isAuthenticated: false,
  error: null,

  signUp: async (email: string, password: string, username: string) => {
    set({ isLoading: true, error: null });
    try {
      if (!SUPABASE_CONFIGURED) {
        set({ user: { id: 'dev-user', email, username }, isAuthenticated: true, isLoading: false, error: null });
        return;
      }
      const { error } = await AuthService.signUp(email, password, username);
      if (error) {
        set({ error, isLoading: false });
        return;
      }
      const { error: signInError } = await AuthService.signIn(email, password);
      if (signInError) {
        set({ error: signInError, isLoading: false });
        return;
      }
      await get().getCurrentUser();
      set({ isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  signUpWithRegister: async (email: string, password: string, username: string, ssid: string, code: string) => {
    set({ isLoading: true, error: null });
    try {
      if (!SUPABASE_CONFIGURED) {
        set({ user: { id: 'dev-user', email, username }, isAuthenticated: true, isLoading: false, error: null });
        return;
      }
      const { error } = await AuthService.signUpWithRegister(email, password, username, ssid, code);
      if (error) {
        set({ error, isLoading: false });
        return;
      }
      const { error: signInError } = await AuthService.signIn(email, password);
      if (signInError) {
        set({ error: signInError, isLoading: false });
        return;
      }
      await get().getCurrentUser();
      set({ isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      if (!SUPABASE_CONFIGURED) {
        set({ user: { id: 'dev-user', email }, isAuthenticated: true, isLoading: false, error: null });
        return;
      }
      const { error } = await AuthService.signIn(email, password);
      if (error) {
        set({ error, isLoading: false });
        return;
      }

      await get().getCurrentUser();
      set({ isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  signOut: async () => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await AuthService.signOut();
      if (error) {
        set({ error, isLoading: false });
        return;
      }
      set({ user: null, device: null, isAuthenticated: false, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  getCurrentUser: async () => {
    set({ isLoading: true });
    try {
      if (!SUPABASE_CONFIGURED) {
        set({ user: { id: 'dev-user', email: 'dev@example.com', username: 'dev' }, isAuthenticated: true, isLoading: false });
        return;
      }
      const { user, error } = await AuthService.getCurrentUser();
      if (error || !user) {
        set({ isAuthenticated: false, isLoading: false });
        return;
      }
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  updateProfile: async (updates: Partial<User>) => {
    const state = get();
    if (!state.user) return;

    set({ isLoading: true, error: null });
    try {
      const { user, error } = await AuthService.updateProfile(state.user.id, updates);
      if (error) {
        set({ error, isLoading: false });
        return;
      }
      set({ user: user || state.user, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  registerDevice: async (customName?: string) => {
    const state = get();
    if (!state.user) return;

    set({ isLoading: true, error: null });
    try {
      const { device, error } = await DeviceService.registerDevice(state.user.id, customName);
      if (error) {
        set({ error, isLoading: false });
        return;
      }
      set({ device: device || null, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
