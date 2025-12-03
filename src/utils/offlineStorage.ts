import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OfflineWiFiData, WiFiNetwork, LocationCoordinates, PendingNetwork } from '../types';
import { EncryptionService } from './encryption';

const OFFLINE_DATA_KEY = 'wifi_offline_data';
const AUTH_TOKEN_KEY = 'auth_token';
const LAST_SYNC_KEY = 'last_sync_timestamp';
const PENDING_NETWORKS_KEY = 'pending_networks';
const MY_SSIDS_KEY = 'my_network_ssids';
const PLAN_MODE_KEY = 'plan_mode';
const INITIAL_CITY_KEY = 'initial_city_key';
const LATENCY_METRICS_KEY = 'latency_metrics';
const INVITE_VALIDATIONS_KEY = 'invite_validations';
const ERROR_REPORTS_KEY = 'network_error_reports';
const OWNER_NOTIFY_FLAGS_KEY = 'owner_notify_flags';
const HAS_REGISTERED_NETWORK_KEY = 'has_registered_network';
const HAS_COMPLETED_PAYMENTS_KEY = 'has_completed_payments';
const MAP_REGION_KEY = 'offline_map_region';
const MAP_TILES_READY_KEY = 'offline_map_tiles_ready';
const MAP_TILE_PREFIX = 'map_tile_';
const MAP_TILE_KEYS_KEY = 'map_tile_keys';
const MAP_DL_STATUS_KEY = 'offline_map_download_status';
const TILE_BASE_URL_KEY = 'tile_base_url';
const TILE_VISUAL_BASE_URL_KEY = 'tile_visual_base_url';
const CONFIG_BASELINE_KEY = 'config_baseline_applied';

export const OfflineStorageService = {
  saveWiFiData: async (networks: WiFiNetwork[], location: LocationCoordinates): Promise<void> => {
    try {
      const offlineData: OfflineWiFiData = {
        networks,
        lastSync: new Date().toISOString(),
        lastLocation: location,
      };
      await AsyncStorage.setItem(OFFLINE_DATA_KEY, JSON.stringify(offlineData));
    } catch (error) {
      console.error('Error saving WiFi data:', error);
    }
  },

  getOfflineWiFiData: async (): Promise<OfflineWiFiData | null> => {
    try {
      const data = await AsyncStorage.getItem(OFFLINE_DATA_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error retrieving offline WiFi data:', error);
      return null;
    }
  },

  saveAuthToken: async (token: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
    } catch (error) {
      console.error('Error saving auth token:', error);
    }
  },

  getAuthToken: async (): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    } catch (error) {
      console.error('Error retrieving auth token:', error);
      return null;
    }
  },

  addPendingNetwork: async (network: PendingNetwork): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_NETWORKS_KEY);
      const list: PendingNetwork[] = raw ? JSON.parse(raw) : [];
      const secured: PendingNetwork = {
        ...network,
        password: EncryptionService.encrypt(network.password),
      };
      list.unshift(secured);
      await AsyncStorage.setItem(PENDING_NETWORKS_KEY, JSON.stringify(list));
    } catch (error) {
      console.error('Error adding pending network:', error);
    }
  },

  getPendingNetworks: async (): Promise<PendingNetwork[]> => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_NETWORKS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Error getting pending networks:', error);
      return [];
    }
  },

  clearPendingNetworks: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(PENDING_NETWORKS_KEY);
    } catch (error) {
      console.error('Error clearing pending networks:', error);
    }
  },

  removePendingNetworkAtIndex: async (index: number): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_NETWORKS_KEY);
      const list: PendingNetwork[] = raw ? JSON.parse(raw) : [];
      if (index >= 0 && index < list.length) {
        list.splice(index, 1);
        await AsyncStorage.setItem(PENDING_NETWORKS_KEY, JSON.stringify(list));
      }
    } catch (error) {
      console.error('Error removing pending network:', error);
    }
  },

  removePendingNetworkBySsid: async (ssid: string): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_NETWORKS_KEY);
      const list: PendingNetwork[] = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((n) => String(n.ssid).toLowerCase() !== String(ssid).toLowerCase());
      await AsyncStorage.setItem(PENDING_NETWORKS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error removing pending network by ssid:', error);
    }
  },

  removePendingNetworkById: async (id: string): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_NETWORKS_KEY);
      const list: PendingNetwork[] = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((n) => String((n as any).id) !== String(id));
      await AsyncStorage.setItem(PENDING_NETWORKS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error removing pending network by id:', error);
    }
  },

  clearAuthToken: async (): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    } catch (error) {
      console.error('Error clearing auth token:', error);
    }
  },

  setLastSyncTime: async (timestamp: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(LAST_SYNC_KEY, timestamp);
    } catch (error) {
      console.error('Error setting last sync time:', error);
    }
  },

  getLastSyncTime: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(LAST_SYNC_KEY);
    } catch (error) {
      console.error('Error getting last sync time:', error);
      return null;
    }
  },

  clearAllData: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(OFFLINE_DATA_KEY);
      await AsyncStorage.removeItem(LAST_SYNC_KEY);
      await AsyncStorage.removeItem(MY_SSIDS_KEY);
      await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    } catch (error) {
      console.error('Error clearing all data:', error);
    }
  },

  resetToDefault: async (): Promise<void> => {
    try {
      const allowed = new Set([
        HAS_REGISTERED_NETWORK_KEY,
        HAS_COMPLETED_PAYMENTS_KEY,
        AUTH_TOKEN_KEY,
      ]);
      const keys = await AsyncStorage.getAllKeys();
      const toRemove = keys.filter((k) => {
        if (allowed.has(k)) return false;
        return (
          k.startsWith('connection_') ||
          k.startsWith(MAP_TILE_PREFIX) ||
          k === OFFLINE_DATA_KEY ||
          k === LAST_SYNC_KEY ||
          k === PENDING_NETWORKS_KEY ||
          k === MY_SSIDS_KEY ||
          k === PLAN_MODE_KEY ||
          k === INITIAL_CITY_KEY ||
          k === LATENCY_METRICS_KEY ||
          k === INVITE_VALIDATIONS_KEY ||
          k === ERROR_REPORTS_KEY ||
          k === OWNER_NOTIFY_FLAGS_KEY ||
          k === MAP_REGION_KEY ||
          k === MAP_TILES_READY_KEY ||
          k === MAP_TILE_KEYS_KEY ||
          k === MAP_DL_STATUS_KEY
        );
      });
      for (const k of toRemove) {
        try { await AsyncStorage.removeItem(k); } catch {}
      }
      try { await AsyncStorage.setItem(MAP_TILES_READY_KEY, '0'); } catch {}
      try { await AsyncStorage.setItem(CONFIG_BASELINE_KEY, '1'); } catch {}
    } catch (error) {
      console.error('Error resetting to default configuration:', error);
    }
  },

  getConfigBaselineApplied: async (): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(CONFIG_BASELINE_KEY);
      return raw === '1';
    } catch (error) {
      console.error('Error getting baseline flag:', error);
      return false;
    }
  },

  setConfigBaselineApplied: async (applied: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(CONFIG_BASELINE_KEY, applied ? '1' : '0');
    } catch (error) {
      console.error('Error setting baseline flag:', error);
    }
  },

  saveConnectionCache: async (key: string, data: any): Promise<void> => {
    try {
      await AsyncStorage.setItem(`connection_${key}`, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving connection cache:', error);
    }
  },

  getConnectionCache: async (key: string): Promise<any> => {
    try {
      const data = await AsyncStorage.getItem(`connection_${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error retrieving connection cache:', error);
      return null;
    }
  },

  saveMyNetworkSSIDs: async (ssids: string[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(MY_SSIDS_KEY, JSON.stringify(Array.from(new Set(ssids))));
    } catch (error) {
      console.error('Error saving my network SSIDs:', error);
    }
  },

  getMyNetworkSSIDs: async (): Promise<string[]> => {
    try {
      const raw = await AsyncStorage.getItem(MY_SSIDS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Error getting my network SSIDs:', error);
      return [];
    }
  },

  savePlanMode: async (mode: 'initial' | 'premium' | null): Promise<void> => {
    try {
      if (mode === null) {
        await AsyncStorage.removeItem(PLAN_MODE_KEY);
      } else {
        await AsyncStorage.setItem(PLAN_MODE_KEY, mode);
      }
    } catch (error) {
      console.error('Error saving plan mode:', error);
    }
  },

  getPlanMode: async (): Promise<'initial' | 'premium' | null> => {
    try {
      const raw = await AsyncStorage.getItem(PLAN_MODE_KEY);
      return raw ? (raw as 'initial' | 'premium') : null;
    } catch (error) {
      console.error('Error getting plan mode:', error);
      return null;
    }
  },

  saveInitialCity: async (city: 'BA' | 'TL' | null): Promise<void> => {
    try {
      if (city === null) {
        await AsyncStorage.removeItem(INITIAL_CITY_KEY);
      } else {
        await AsyncStorage.setItem(INITIAL_CITY_KEY, city);
      }
    } catch (error) {
      console.error('Error saving initial city:', error);
    }
  },

  getInitialCity: async (): Promise<'BA' | 'TL' | null> => {
    try {
      const raw = await AsyncStorage.getItem(INITIAL_CITY_KEY);
      return raw ? (raw as 'BA' | 'TL') : null;
    } catch (error) {
      console.error('Error getting initial city:', error);
      return null;
    }
  },

  addLatencySample: async (ssid: string, latencyMs: number): Promise<void> => {
    try {
      if (!ssid || typeof latencyMs !== 'number' || latencyMs <= 0) return;
      const raw = await AsyncStorage.getItem(LATENCY_METRICS_KEY);
      const store = raw ? JSON.parse(raw) : {};
      const key = String(ssid).toLowerCase();
      const prev = store[key] || { avg: 0, count: 0, last: 0 };
      const count = Math.min(1000, (prev.count || 0) + 1);
      const avg = prev.count ? ((prev.avg * prev.count + latencyMs) / (prev.count + 1)) : latencyMs;
      store[key] = { avg, count, last: latencyMs };
      await AsyncStorage.setItem(LATENCY_METRICS_KEY, JSON.stringify(store));
    } catch (error) {
      console.error('Error adding latency sample:', error);
    }
  },

  getLatencyAvg: async (ssid: string): Promise<number | null> => {
    try {
      const raw = await AsyncStorage.getItem(LATENCY_METRICS_KEY);
      const store = raw ? JSON.parse(raw) : {};
      const key = String(ssid).toLowerCase();
      const entry = store[key];
      return entry && typeof entry.avg === 'number' ? entry.avg : null;
    } catch (error) {
      console.error('Error getting latency avg:', error);
      return null;
    }
  },

  getLatencyMetrics: async (): Promise<Record<string, { avg: number; count: number; last: number }>> => {
    try {
      const raw = await AsyncStorage.getItem(LATENCY_METRICS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      console.error('Error getting latency metrics:', error);
      return {};
    }
  },

  saveInviteValidation: async (ssid: string, data: { valid: boolean; ts?: number }): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(INVITE_VALIDATIONS_KEY);
      const store = raw ? JSON.parse(raw) : {};
      const key = String(ssid).toLowerCase();
      store[key] = { valid: !!data.valid, ts: data.ts || Date.now() };
      await AsyncStorage.setItem(INVITE_VALIDATIONS_KEY, JSON.stringify(store));
    } catch (error) {
      console.error('Error saving invite validation:', error);
    }
  },

  getInviteValidation: async (ssid: string): Promise<{ valid: boolean; ts?: number } | null> => {
    try {
      const raw = await AsyncStorage.getItem(INVITE_VALIDATIONS_KEY);
      const store = raw ? JSON.parse(raw) : {};
      const key = String(ssid).toLowerCase();
      return store[key] || null;
    } catch (error) {
      console.error('Error getting invite validation:', error);
      return null;
    }
  },

  addNetworkErrorReport: async (report: { network_id: string; owner_id?: string; user_id: string; failure_type: 'failed_auth' | 'timeout' | 'disconnected'; latitude: number; longitude: number; timestamp: number; message?: string }): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(ERROR_REPORTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.push({ ...report });
      await AsyncStorage.setItem(ERROR_REPORTS_KEY, JSON.stringify(list));
    } catch (error) {
      console.error('Error adding error report:', error);
    }
  },

  getNetworkErrorReports: async (): Promise<any[]> => {
    try {
      const raw = await AsyncStorage.getItem(ERROR_REPORTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Error getting error reports:', error);
      return [];
    }
  },

  clearNetworkErrorReports: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(ERROR_REPORTS_KEY);
    } catch (error) {
      console.error('Error clearing error reports:', error);
    }
  },

  setNetworkErrorReports: async (reports: any[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(ERROR_REPORTS_KEY, JSON.stringify(reports || []));
    } catch (error) {
      console.error('Error setting error reports:', error);
    }
  },

  setOwnerNotifyFlag: async (networkId: string, ts: number): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(OWNER_NOTIFY_FLAGS_KEY);
      const store = raw ? JSON.parse(raw) : {};
      store[String(networkId)] = ts;
      await AsyncStorage.setItem(OWNER_NOTIFY_FLAGS_KEY, JSON.stringify(store));
    } catch (error) {
      console.error('Error setting owner notify flag:', error);
    }
  },

  getOwnerNotifyFlag: async (networkId: string): Promise<number | null> => {
    try {
      const raw = await AsyncStorage.getItem(OWNER_NOTIFY_FLAGS_KEY);
      const store = raw ? JSON.parse(raw) : {};
      const v = store[String(networkId)];
      return typeof v === 'number' ? v : null;
    } catch (error) {
      console.error('Error getting owner notify flag:', error);
      return null;
    }
  },

  setHasRegisteredNetwork: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(HAS_REGISTERED_NETWORK_KEY, value ? '1' : '0');
    } catch (error) {
      console.error('Error setting has_registered_network:', error);
    }
  },

  getHasRegisteredNetwork: async (): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(HAS_REGISTERED_NETWORK_KEY);
      return raw === '1';
    } catch (error) {
      console.error('Error getting has_registered_network:', error);
      return false;
    }
  },

  setHasCompletedPayments: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(HAS_COMPLETED_PAYMENTS_KEY, value ? '1' : '0');
    } catch (error) {
      console.error('Error setting has_completed_payments:', error);
    }
  },

  getHasCompletedPayments: async (): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(HAS_COMPLETED_PAYMENTS_KEY);
      return raw === '1';
    } catch (error) {
      console.error('Error getting has_completed_payments:', error);
      return false;
    }
  },

  saveOfflineMapRegion: async (region: { center: LocationCoordinates; radiusKm: number; zooms: number[] }): Promise<void> => {
    try {
      await AsyncStorage.setItem(MAP_REGION_KEY, JSON.stringify(region));
    } catch (error) {
      console.error('Error saving offline map region:', error);
    }
  },

  getOfflineMapRegion: async (): Promise<{ center: LocationCoordinates; radiusKm: number; zooms: number[] } | null> => {
    try {
      const raw = await AsyncStorage.getItem(MAP_REGION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Error getting offline map region:', error);
      return null;
    }
  },

  setOfflineMapTilesReady: async (ready: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(MAP_TILES_READY_KEY, ready ? '1' : '0');
    } catch (error) {
      console.error('Error setting map tiles ready:', error);
    }
  },

  getOfflineMapTilesReady: async (): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(MAP_TILES_READY_KEY);
      return raw === '1';
    } catch (error) {
      console.error('Error getting map tiles ready:', error);
      return false;
    }
  },

  saveMapTile: async (z: number, x: number, y: number, base64: string): Promise<void> => {
    try {
      const key = `${MAP_TILE_PREFIX}${z}_${x}_${y}`;
      await AsyncStorage.setItem(key, base64);
      try {
        const raw = await AsyncStorage.getItem(MAP_TILE_KEYS_KEY);
        const list: string[] = raw ? JSON.parse(raw) : [];
        if (!list.includes(key)) {
          list.push(key);
          await AsyncStorage.setItem(MAP_TILE_KEYS_KEY, JSON.stringify(list));
        }
      } catch {}
    } catch (error) {
      console.error('Error saving map tile:', error);
    }
  },

  getMapTile: async (z: number, x: number, y: number): Promise<string | null> => {
    try {
      const key = `${MAP_TILE_PREFIX}${z}_${x}_${y}`;
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('Error getting map tile:', error);
      return null;
    }
  },

  setMapDownloadStatus: async (status: { inProgress: boolean; downloaded: number; failed: number; total: number }): Promise<void> => {
    try {
      await AsyncStorage.setItem(MAP_DL_STATUS_KEY, JSON.stringify(status));
    } catch (error) {
      console.error('Error setting map download status:', error);
    }
  },

  getMapDownloadStatus: async (): Promise<{ inProgress: boolean; downloaded: number; failed: number; total: number } | null> => {
    try {
      const raw = await AsyncStorage.getItem(MAP_DL_STATUS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Error getting map download status:', error);
      return null;
    }
  },

  getAllMapTileKeys: async (): Promise<string[]> => {
    try {
      const raw = await AsyncStorage.getItem(MAP_TILE_KEYS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Error getting tile keys:', error);
      return [];
    }
  },

  clearAllMapTiles: async (): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(MAP_TILE_KEYS_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      for (const k of list) {
        try { await AsyncStorage.removeItem(k); } catch {}
      }
      await AsyncStorage.removeItem(MAP_TILE_KEYS_KEY);
      await AsyncStorage.removeItem(MAP_REGION_KEY);
      await AsyncStorage.setItem(MAP_TILES_READY_KEY, '0');
    } catch (error) {
      console.error('Error clearing map tiles:', error);
    }
  },

  setTileBaseUrl: async (url: string | null): Promise<void> => {
    try {
      if (!url) {
        await AsyncStorage.removeItem(TILE_BASE_URL_KEY);
      } else {
        await AsyncStorage.setItem(TILE_BASE_URL_KEY, url);
      }
    } catch (error) {
      console.error('Error setting tile base url:', error);
    }
  },

  getTileBaseUrl: async (): Promise<string | null> => {
    try {
      const raw = await AsyncStorage.getItem(TILE_BASE_URL_KEY);
      return raw || null;
    } catch (error) {
      console.error('Error getting tile base url:', error);
      return null;
    }
  },

  setTileVisualBaseUrl: async (url: string | null): Promise<void> => {
    try {
      if (!url) {
        await AsyncStorage.removeItem(TILE_VISUAL_BASE_URL_KEY);
      } else {
        await AsyncStorage.setItem(TILE_VISUAL_BASE_URL_KEY, url);
      }
    } catch (error) {
      console.error('Error setting tile visual base url:', error);
    }
  },

  getTileVisualBaseUrl: async (): Promise<string | null> => {
    try {
      const raw = await AsyncStorage.getItem(TILE_VISUAL_BASE_URL_KEY);
      return raw || null;
    } catch (error) {
      console.error('Error getting tile visual base url:', error);
      return null;
    }
  },
};
