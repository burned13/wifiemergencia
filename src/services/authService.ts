import { supabase } from '../config/supabase';
import { User } from '../types';
import { EncryptionService } from '../utils/encryption';
import { WiFiService } from './wifiService';

export const AuthService = {
  signUp: async (
    email: string,
    password: string,
    username: string
  ): Promise<{ user: any; error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
          },
        },
      });

      if (error) return { user: null, error: error.message };

      if (data.user) {
        await supabase.from('users').insert([
          {
            auth_id: data.user.id,
            email: data.user.email,
            username,
            downloads_remaining: 0,
            total_downloads: 0,
          },
        ]);
      }

      return { user: data.user, error: null };
    } catch (error: any) {
      return { user: null, error: error.message };
    }
  },

  signUpWithRegister: async (
    email: string,
    password: string,
    username: string,
    ssid: string,
    registerCode: string
  ): Promise<{ user: any; error: string | null }> => {
    try {
      const { network, error: netErr } = await WiFiService.getNetworkBySSID(ssid);
      if (netErr || !network) return { user: null, error: netErr || 'SSID no encontrada' };

      const tags = Array.isArray(network.tags) ? network.tags : [];
      const hashTag = tags.find((t: any) => typeof t === 'string' && String(t).startsWith('register_hash:')) as string | undefined;
      const requiredHash = hashTag ? String(hashTag).split(':')[1] : '';
      const slots = 5;
      const registered = tags.filter((t: any) => typeof t === 'string' && String(t).startsWith('register_user:')) as string[];
      const seatsUsed = registered.length;
      const codeHash = EncryptionService.hash(registerCode.trim());

      if (!requiredHash) return { user: null, error: 'Esta red no admite registro por código' };
      if (!codeHash || codeHash !== requiredHash) return { user: null, error: 'Código de registro inválido' };
      if (!Number.isFinite(slots) || slots <= 0) return { user: null, error: 'Cupos de registro inválidos' };
      if (seatsUsed >= slots) return { user: null, error: 'Cupo de registros agotado' };

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) return { user: null, error: error.message };

      if (data.user) {
        await supabase.from('users').insert([
          {
            auth_id: data.user.id,
            email: data.user.email,
            username,
            downloads_remaining: 0,
            total_downloads: 0,
          },
        ]);

        const { data: userRow } = await supabase
          .from('users')
          .select('*')
          .eq('auth_id', data.user.id)
          .maybeSingle();

        const existing = Array.isArray(network.tags) ? network.tags : [];
        const filtered = existing.filter((t: any) => typeof t === 'string' && !String(t).startsWith('register_user:')) as string[];
        const newTags = [...filtered, `register_user:${userRow?.id || ''}`];
        await supabase
          .from('wifi_networks')
          .update({ tags: newTags })
          .eq('id', network.id);
      }

      return { user: data.user, error: null };
    } catch (error: any) {
      return { user: null, error: error.message };
    }
  },

  signIn: async (
    email: string,
    password: string
  ): Promise<{ user: any; error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { user: null, error: error.message };

      if (data.user) {
        await supabase
          .from('users')
          .update({ last_login: new Date().toISOString() })
          .eq('auth_id', data.user.id);
      }

      return { user: data.user, error: null };
    } catch (error: any) {
      return { user: null, error: error.message };
    }
  },

  signOut: async (): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.signOut();
      return { error: error?.message || null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  getCurrentUser: async (): Promise<{ user: any; error: string | null }> => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        return { user: null, error: error?.message || 'No user' };
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', user.id)
        .maybeSingle();

      if (!userData) {
        const email = user.email || '';
        const username = (user.user_metadata && user.user_metadata.username) || email.split('@')[0] || 'user';
        await supabase
          .from('users')
          .insert([
            {
              auth_id: user.id,
              email,
              username,
              downloads_remaining: 0,
              total_downloads: 0,
            },
          ]);

        const { data: userData2 } = await supabase
          .from('users')
          .select('*')
          .eq('auth_id', user.id)
          .maybeSingle();
        return { user: userData2, error: null };
      }

      return { user: userData, error: userError?.message || null };
    } catch (error: any) {
      return { user: null, error: error.message };
    }
  },

  resetPassword: async (email: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'wifishare://reset-password',
      });

      return { error: error?.message || null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  sendMagicLink: async (email: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          shouldCreateUser: true,
        },
      });
      return { error: error?.message || null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  updateProfile: async (
    userId: string,
    updates: Partial<User>
  ): Promise<{ user: User | null; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .maybeSingle();

      return { user: data || null, error: error?.message || null };
    } catch (error: any) {
      return { user: null, error: error.message };
    }
  },

  onAuthStateChange: (
    callback: (event: string, session: any) => void
  ): (() => void) => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(callback);

    return () => subscription?.unsubscribe();
  },
};
