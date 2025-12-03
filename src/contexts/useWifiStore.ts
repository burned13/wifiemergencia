import { create } from 'zustand';
import { WiFiNetwork, LocationCoordinates } from '../types';
import { WiFiService } from '../services/wifiService';
import { GPSService } from '../utils/gps';
import { OfflineStorageService } from '../utils/offlineStorage';
import { EncryptionService } from '../utils/encryption';
import { SUPABASE_CONFIGURED } from '../config/supabase';

interface WiFiState {
  networks: WiFiNetwork[];
  myNetworks: WiFiNetwork[];
  nearbyNetworks: WiFiNetwork[];
  selectedNetwork: WiFiNetwork | null;
  isLoading: boolean;
  error: string | null;

  registerNetwork: (
    userId: string,
    ssid: string,
    password: string,
    location: LocationCoordinates,
    networkType?: 'home' | 'public' | 'enterprise',
    description?: string,
    tags?: string[]
  ) => Promise<void>;

  registerNetworkOffline: (
    ssid: string,
    password: string,
    location: LocationCoordinates,
    networkType?: 'home' | 'public' | 'enterprise',
    description?: string,
    tags?: string[]
  ) => Promise<void>;

  syncOfflineNetworks: (ownerId: string) => Promise<void>;
  loadPendingNetworksToMyNetworks: (ownerId: string) => Promise<void>;

  getMyNetworks: (userId: string) => Promise<void>;
  getNearbyNetworks: (location: LocationCoordinates, radiusKm?: number) => Promise<void>;
  searchNetworks: (query: string) => Promise<void>;
  updateNetwork: (networkId: string, updates: Partial<WiFiNetwork>) => Promise<void>;
  deleteNetwork: (networkId: string) => Promise<void>;
  selectNetwork: (network: WiFiNetwork | null) => void;
  connectNearestNetwork: (location: LocationCoordinates) => WiFiNetwork | null;
  clearError: () => void;
}

export const useWifiStore = create<WiFiState>((set, get) => ({
  networks: [],
  myNetworks: [],
  nearbyNetworks: [],
  selectedNetwork: null,
  isLoading: false,
  error: null,

  registerNetwork: async (
    userId: string,
    ssid: string,
    password: string,
    location: LocationCoordinates,
    networkType = 'home',
    description?: string,
    tags?: string[]
  ) => {
    set({ isLoading: true, error: null });
    try {
      const { network, error } = await WiFiService.registerNetwork(
        userId,
        ssid,
        password,
        location,
        networkType,
        'WPA2',
        description,
        tags
      );

      if (error) {
        set({ error, isLoading: false });
        return;
      }

      const state = get();
      set({
        myNetworks: network ? [network, ...state.myNetworks] : state.myNetworks,
        isLoading: false,
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  registerNetworkOffline: async (
    ssid: string,
    password: string,
    location: LocationCoordinates,
    networkType = 'home',
    description?: string,
    tags?: string[]
  ) => {
    try {
      const ssidValid = Boolean(ssid && ssid.trim().length >= 3);
      const passValid = Boolean(password && password.trim().length >= 8);
      if (!ssidValid || !passValid) { return; }
      const pending = {
        ssid,
        password,
        networkType,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        description,
        tags,
        createdAt: new Date().toISOString(),
      };
      await OfflineStorageService.addPendingNetwork(pending);

      const enc = EncryptionService.encrypt(password);
      const now = new Date().toISOString();
      const synthetic: WiFiNetwork = {
        id: `pending:${Date.now()}:${ssid}`,
        owner_id: 'guest',
        ssid,
        bssid: undefined,
        password_encrypted: enc,
        network_type: networkType,
        latitude: location.latitude,
        longitude: location.longitude,
        signal_strength: 80,
        frequency_band: 'dual',
        security_protocol: 'WPA2',
        max_concurrent_users: 5,
        current_users: 0,
        session_timeout_minutes: 10,
        is_active: true,
        description,
        tags,
        created_at: now,
        updated_at: now,
        last_used: now,
      };
      const state = get();
      set({ myNetworks: [synthetic, ...state.myNetworks] });
      try { await OfflineStorageService.saveMyNetworkSSIDs([ssid]); } catch {}
    } catch {
      set({});
    }
  },

  syncOfflineNetworks: async (_ownerId: string) => { set({}); },

  loadPendingNetworksToMyNetworks: async (ownerId: string) => {
    try {
      const list = await OfflineStorageService.getPendingNetworks();
      const now = new Date().toISOString();
      const mapped: WiFiNetwork[] = (list || []).map((p, idx) => ({
        id: `pending:${idx}:${p.ssid}`,
        owner_id: ownerId || 'guest',
        ssid: p.ssid,
        bssid: p.bssid,
        password_encrypted: p.password,
        network_type: p.networkType,
        latitude: p.latitude,
        longitude: p.longitude,
        signal_strength: 75,
        frequency_band: 'dual',
        security_protocol: 'WPA2',
        max_concurrent_users: 5,
        current_users: 0,
        session_timeout_minutes: 10,
        is_active: true,
        description: p.description,
        tags: p.tags,
        created_at: p.createdAt || now,
        updated_at: now,
        last_used: now,
      }));
      set({ myNetworks: mapped });
      try { await OfflineStorageService.saveMyNetworkSSIDs(mapped.map((m) => m.ssid)); } catch {}
    } catch {
      set({});
    }
  },

  getMyNetworks: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      if (!SUPABASE_CONFIGURED) {
        try { await get().loadPendingNetworksToMyNetworks(userId || 'dev-user'); } catch {}
        const st = get();
        if (!st.myNetworks || st.myNetworks.length === 0) {
          const approx = await GPSService.getApproximateLocationByIP();
          const loc = approx || { latitude: -36.0, longitude: -62.7, accuracy: 9999 } as any;
          const enc = EncryptionService.encrypt('12345678');
          const now = new Date().toISOString();
          const synthetic: WiFiNetwork = {
            id: `dev-home:${Date.now()}`,
            owner_id: userId || 'dev-user',
            ssid: 'MiWifiCasa',
            bssid: undefined,
            password_encrypted: enc,
            network_type: 'home',
            latitude: loc.latitude,
            longitude: loc.longitude,
            signal_strength: 85,
            frequency_band: 'dual',
            security_protocol: 'WPA2',
            max_concurrent_users: 5,
            current_users: 0,
            session_timeout_minutes: 10,
            is_active: true,
            description: 'Red doméstica demo',
            tags: [],
            created_at: now,
            updated_at: now,
            last_used: now,
          };
          set({ myNetworks: [synthetic], isLoading: false });
          return;
        }
        set({ isLoading: false });
        return;
      }
      const { networks, error } = await WiFiService.getMyNetworks(userId);
      if (error) {
        set({ error, isLoading: false });
        return;
      }
      set({ myNetworks: networks, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  getNearbyNetworks: async (location: LocationCoordinates, radiusKm = 0.5) => {
    const statePre = get();
    if (statePre.isLoading) return;
    set({ isLoading: true, error: null });
    try {
      if (!SUPABASE_CONFIGURED) {
        const pool: WiFiNetwork[] = [];
        const my = get().myNetworks || [];
        my.forEach((m) => pool.push(m));
        const now = new Date().toISOString();
        const make = (ssid: string, type: 'home' | 'public' | 'enterprise', dx: number, dy: number, signal: number) => ({
          id: `dev-${ssid}-${Date.now()}`,
          owner_id: type === 'home' ? (get().myNetworks[0]?.owner_id || 'dev-user') : 'public',
          ssid,
          bssid: undefined,
          password_encrypted: EncryptionService.encrypt('12345678'),
          network_type: type,
          latitude: location.latitude + dy * radiusKm,
          longitude: location.longitude + dx * radiusKm,
          signal_strength: signal,
          frequency_band: 'dual',
          security_protocol: 'WPA2',
          max_concurrent_users: 5,
          current_users: 0,
          session_timeout_minutes: 10,
          is_active: true,
          description: undefined,
          tags: [],
          created_at: now,
          updated_at: now,
          last_used: now,
        } as WiFiNetwork);
        const demo = [
          make('Plaza Wifi', 'public', 0.01, -0.01, 70),
          make('Bar Central', 'public', 0.008, 0.012, 68),
          make('Municipalidad', 'enterprise', -0.012, 0.006, 72),
          make('Biblioteca', 'public', -0.015, -0.008, 65),
        ];
        demo.forEach((d) => pool.push(d));
        const seen = new Set<string>();
        const merged = pool.filter((n) => {
          const key = (n.ssid || '').toLowerCase();
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const sortedNetworks = merged.sort((a, b) => {
          const distA = GPSService.calculateDistance(location.latitude, location.longitude, a.latitude, a.longitude);
          const distB = GPSService.calculateDistance(location.latitude, location.longitude, b.latitude, b.longitude);
          return distA - distB;
        });
        set({ nearbyNetworks: sortedNetworks, isLoading: false });
        return;
      }
      const { networks, error } = await WiFiService.getNearbyNetworks(location.latitude, location.longitude, radiusKm);
      if (error) {}
      const mergedRaw = [...(networks || [])];
      const seen = new Set<string>();
      const merged = mergedRaw.filter((n) => {
        const key = (n.ssid || '').toLowerCase();
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const sortedNetworks = merged.sort((a, b) => {
        const distA = GPSService.calculateDistance(location.latitude, location.longitude, a.latitude, a.longitude);
        const distB = GPSService.calculateDistance(location.latitude, location.longitude, b.latitude, b.longitude);
        return distA - distB;
      });
      set({ nearbyNetworks: sortedNetworks, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  searchNetworks: async (query: string) => {
    set({ isLoading: true, error: null });
    try {
      const { networks, error } = await WiFiService.searchNetworks(query);
      let result = networks || [];
      if (error || result.length === 0) {
        const state = get();
        const pool = [...state.myNetworks];
        result = pool.filter((n) => n.ssid.toLowerCase().includes(query.toLowerCase()));
      }
      set({ networks: result, nearbyNetworks: result, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  updateNetwork: async (networkId: string, updates: Partial<WiFiNetwork>) => {
    set({ isLoading: true, error: null });
    try {
      const { network, error } = await WiFiService.updateNetwork(networkId, updates);
      if (error) {
        set({ error, isLoading: false });
        return;
      }

      const state = get();
      set({
        myNetworks: state.myNetworks.map((n) => (n.id === networkId ? network || n : n)),
        isLoading: false,
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  deleteNetwork: async (networkId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await WiFiService.deleteNetwork(networkId);
      if (error) {
        set({ error, isLoading: false });
        return;
      }

      const state = get();
      set({
        myNetworks: state.myNetworks.filter((n) => n.id !== networkId),
        isLoading: false,
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  selectNetwork: (network: WiFiNetwork | null) => set({ selectedNetwork: network }),

  connectNearestNetwork: (location: LocationCoordinates) => {
    const state = get();
    const pool: WiFiNetwork[] = [...state.nearbyNetworks, ...state.myNetworks];
    if (pool.length === 0) return null;
    const nearest = pool.reduce((best: WiFiNetwork | null, n) => {
      const dist = GPSService.calculateDistance(location.latitude, location.longitude, n.latitude, n.longitude);
      if (!best) return n as WiFiNetwork & { _dist?: number };
      const bestDist = GPSService.calculateDistance(location.latitude, location.longitude, best.latitude, best.longitude);
      return dist < bestDist ? n : best;
    }, null);
    if (nearest) set({ selectedNetwork: nearest });
    return nearest;
  },

  clearError: () => set({ error: null }),
}));
