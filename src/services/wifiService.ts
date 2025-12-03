import { supabase } from '../config/supabase';
import { WiFiNetwork, LocationCoordinates } from '../types';
import { EncryptionService } from '../utils/encryption';

export const WiFiService = {
  registerNetwork: async (
    userId: string,
    ssid: string,
    password: string,
    location: LocationCoordinates,
    networkType: 'home' | 'public' | 'enterprise' = 'home',
    securityProtocol: string = 'WPA2',
    description?: string,
    tags?: string[]
  ): Promise<{ network: WiFiNetwork | null; error: string | null }> => {
    try {
      const encryptedPassword = EncryptionService.encrypt(password);

      let ownerId = userId;
      if (!ownerId) {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (authUser) {
          const { data: userRow } = await supabase
            .from('users')
            .select('*')
            .eq('auth_id', authUser.id)
            .maybeSingle();
          if (!userRow) {
            const email = authUser.email || '';
            const username = (authUser.user_metadata && authUser.user_metadata.username) || email.split('@')[0] || 'user';
            await supabase
              .from('users')
              .insert([
                {
                  auth_id: authUser.id,
                  email,
                  username,
                  downloads_remaining: 0,
                  total_downloads: 0,
                },
              ]);
            const { data: userRow2 } = await supabase
              .from('users')
              .select('*')
              .eq('auth_id', authUser.id)
              .maybeSingle();
            if (userRow2) ownerId = userRow2.id;
          } else {
            ownerId = userRow.id;
          }
        }
      }

      if (!ownerId) {
        return { network: null, error: 'User not found' };
      }

      const { data, error } = await supabase
        .from('wifi_networks')
        .insert([
          {
            owner_id: ownerId,
            ssid,
            password_encrypted: encryptedPassword,
            network_type: networkType,
            latitude: location.latitude,
            longitude: location.longitude,
            security_protocol: securityProtocol,
            description,
          },
        ])
        .select()
        .maybeSingle();

      return { network: data || null, error: error?.message || null };
    } catch (error: any) {
      return { network: null, error: error.message };
    }
  },

  getNearbyNetworks: async (
    latitude: number,
    longitude: number,
    radiusKm: number = 0.5
  ): Promise<{ networks: WiFiNetwork[]; error: string | null }> => {
    try {
      const latDelta = radiusKm / 111;
      const lonDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180) || 1);

      const minLat = latitude - latDelta;
      const maxLat = latitude + latDelta;
      const minLon = longitude - lonDelta;
      const maxLon = longitude + lonDelta;

      const { data, error } = await supabase
        .from('wifi_networks')
        .select('*')
        .gte('latitude', minLat)
        .lte('latitude', maxLat)
        .gte('longitude', minLon)
        .lte('longitude', maxLon);

      if (error) return { networks: [], error: error.message };

      return { networks: data || [], error: null };
    } catch (error: any) {
      return { networks: [], error: error.message };
    }
  },

  getMyNetworks: async (userId: string): Promise<{ networks: WiFiNetwork[]; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('wifi_networks')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      return { networks: data || [], error: error?.message || null };
    } catch (error: any) {
      return { networks: [], error: error.message };
    }
  },

  updateNetwork: async (
    networkId: string,
    updates: Partial<WiFiNetwork>
  ): Promise<{ network: WiFiNetwork | null; error: string | null }> => {
    try {
      const updateData: any = { ...updates };

      if (updates.password_encrypted) {
        updateData.password_encrypted = EncryptionService.encrypt(
          updates.password_encrypted
        );
      }

      const { data, error } = await supabase
        .from('wifi_networks')
        .update(updateData)
        .eq('id', networkId)
        .select()
        .maybeSingle();

      return { network: data || null, error: error?.message || null };
    } catch (error: any) {
      return { network: null, error: error.message };
    }
  },

  deleteNetwork: async (networkId: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase
        .from('wifi_networks')
        .delete()
        .eq('id', networkId);

      return { error: error?.message || null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  getNetworkDetails: async (networkId: string): Promise<{ network: WiFiNetwork | null; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('wifi_networks')
        .select('*')
        .eq('id', networkId)
        .maybeSingle();

      return { network: data || null, error: error?.message || null };
    } catch (error: any) {
      return { network: null, error: error.message };
    }
  },

  getNetworkBySSID: async (ssid: string): Promise<{ network: WiFiNetwork | null; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('wifi_networks')
        .select('*')
        .eq('ssid', ssid)
        .maybeSingle();
      return { network: data || null, error: error?.message || null };
    } catch (error: any) {
      return { network: null, error: error.message };
    }
  },

  getDecryptedPassword: (encryptedPassword: string): string => {
    return EncryptionService.decrypt(encryptedPassword);
  },

  searchNetworks: async (query: string): Promise<{ networks: WiFiNetwork[]; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('wifi_networks')
        .select('*')
        .or(
          `ssid.ilike.%${query}%,tags.contains.[${JSON.stringify([query])}]`
        );

      return { networks: data || [], error: error?.message || null };
    } catch (error: any) {
      return { networks: [], error: error.message };
    }
  },

  getNetworkByRegisterCode: async (
    code: string
  ): Promise<{ network: WiFiNetwork | null; error: string | null }> => {
    try {
      const clean = (code || '').trim().toUpperCase();
      if (!clean) return { network: null, error: 'Código vacío' };
      const codeTag = `register_code:${clean}`;
      const { data: byCode, error: codeErr } = await supabase
        .from('wifi_networks')
        .select('*')
        .contains('tags', [codeTag])
        .maybeSingle();
      if (byCode && !codeErr) return { network: byCode, error: null };

      const hash = EncryptionService.hash(clean);
      const { data: byHash, error: hashErr } = await supabase
        .from('wifi_networks')
        .select('*')
        .contains('tags', [`register_hash:${hash}`])
        .maybeSingle();
      return { network: byHash || null, error: (codeErr?.message || hashErr?.message) || null };
    } catch (error: any) {
      return { network: null, error: error.message };
    }
  },
};
