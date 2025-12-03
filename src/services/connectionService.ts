import { supabase } from '../config/supabase';
import { WiFiConnection, LocationCoordinates, WifiDiagnostics, InternetTestResult, WiFiNetwork } from '../types';
import { Platform, PermissionsAndroid } from 'react-native';
import { GPSService } from '../utils/gps';
import { OfflineStorageService } from '../utils/offlineStorage';
import { WiFiService } from './wifiService';

export const ConnectionService = {
  startConnection: async (
    userId: string,
    networkId: string,
    deviceId: string,
    location: LocationCoordinates
  ): Promise<{ connection: WiFiConnection | null; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('wifi_connections')
        .insert([
          {
            user_id: userId,
            network_id: networkId,
            device_id: deviceId,
            connection_start: new Date().toISOString(),
            connection_status: 'active',
            user_latitude: location.latitude,
            user_longitude: location.longitude,
            signal_strength: 0,
          },
        ])
        .select()
        .maybeSingle();

      if (!error && data) {
        await supabase
          .from('network_access_logs')
          .insert([
            {
              network_id: networkId,
              user_id: userId,
              access_type: 'successful',
              latitude: location.latitude,
              longitude: location.longitude,
              timestamp: new Date().toISOString(),
            },
          ]);
      }

      return { connection: data || null, error: error?.message || null };
    } catch (error: any) {
      return { connection: null, error: error.message };
    }
  },

  endConnection: async (
    connectionId: string,
    durationSeconds: number,
    dataUsedMb?: number
  ): Promise<{ connection: WiFiConnection | null; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('wifi_connections')
        .update({
          connection_end: new Date().toISOString(),
          duration_seconds: durationSeconds,
          data_used_mb: dataUsedMb || 0,
          connection_status: 'completed',
        })
        .eq('id', connectionId)
        .select()
        .maybeSingle();

      return { connection: data || null, error: error?.message || null };
    } catch (error: any) {
      return { connection: null, error: error.message };
    }
  },

  getConnectionHistory: async (userId: string, limit: number = 50): Promise<{ connections: WiFiConnection[]; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('wifi_connections')
        .select(
          `*,
          wifi_networks (
            ssid,
            owner_id,
            security_protocol
          )`
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      return { connections: data || [], error: error?.message || null };
    } catch (error: any) {
      return { connections: [], error: error.message };
    }
  },

  getActiveConnections: async (networkId: string): Promise<{ connections: WiFiConnection[]; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('wifi_connections')
        .select('*')
        .eq('network_id', networkId)
        .eq('connection_status', 'active');

      return { connections: data || [], error: error?.message || null };
    } catch (error: any) {
      return { connections: [], error: error.message };
    }
  },

  checkConnectionLimit: async (
    networkId: string
  ): Promise<{ canConnect: boolean; activeCount: number; maxUsers: number; error: string | null }> => {
    try {
      const { data: activeConnections, error: connError } = await supabase
        .from('wifi_connections')
        .select('*')
        .eq('network_id', networkId)
        .eq('connection_status', 'active');

      const { data: networkData, error: netError } = await supabase
        .from('wifi_networks')
        .select('max_concurrent_users')
        .eq('id', networkId)
        .maybeSingle();

      if (connError || netError) {
        return {
          canConnect: false,
          activeCount: 0,
          maxUsers: 0,
          error: (connError?.message || netError?.message) || null,
        };
      }

      const activeCount = activeConnections?.length || 0;
      const maxUsers = networkData?.max_concurrent_users || 3;

      return {
        canConnect: activeCount < maxUsers,
        activeCount,
        maxUsers,
        error: null,
      };
    } catch (error: any) {
      return {
        canConnect: false,
        activeCount: 0,
        maxUsers: 0,
        error: error.message,
      };
    }
  },

  logAccessEvent: async (
    networkId: string,
    userId: string,
    accessType: 'successful' | 'failed_auth' | 'timeout' | 'disconnected' | 'limit_exceeded',
    location: LocationCoordinates,
    errorMessage?: string
  ): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase
        .from('network_access_logs')
        .insert([
          {
            network_id: networkId,
            user_id: userId,
            access_type: accessType,
            latitude: location.latitude,
            longitude: location.longitude,
            timestamp: new Date().toISOString(),
            error_message: errorMessage,
          },
        ]);

      if (!error && (accessType === 'failed_auth' || accessType === 'timeout' || accessType === 'disconnected')) {
        try { await ConnectionService.reportNetworkFailure(networkId, userId, accessType, location, errorMessage); } catch {}
      }

      return { error: error?.message || null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  reportNetworkFailure: async (
    networkId: string,
    userId: string,
    failureType: 'failed_auth' | 'timeout' | 'disconnected',
    location: LocationCoordinates,
    message?: string
  ): Promise<{ error: string | null }> => {
    try {
      const { network, error: netErr } = await WiFiService.getNetworkDetails(networkId);
      if (netErr || !network) {
        try { await OfflineStorageService.addNetworkErrorReport({ network_id: networkId, user_id: userId, failure_type: failureType, latitude: location.latitude, longitude: location.longitude, timestamp: Date.now(), message }); } catch {}
        return { error: netErr || null };
      }
      if (network.network_type !== 'home') return { error: null };
      try {
        const { error } = await supabase
          .from('network_error_reports')
          .insert([
            {
              network_id: network.id,
              owner_id: network.owner_id,
              user_id: userId,
              failure_type: failureType,
              latitude: location.latitude,
              longitude: location.longitude,
              occurred_at: new Date().toISOString(),
              message,
            },
          ]);
        if (error) {
          try { await OfflineStorageService.addNetworkErrorReport({ network_id: network.id, owner_id: network.owner_id, user_id: userId, failure_type: failureType, latitude: location.latitude, longitude: location.longitude, timestamp: Date.now(), message }); } catch {}
        }
      } catch {
        try { await OfflineStorageService.addNetworkErrorReport({ network_id: network.id, owner_id: network.owner_id, user_id: userId, failure_type: failureType, latitude: location.latitude, longitude: location.longitude, timestamp: Date.now(), message }); } catch {}
      }
      return { error: null };
    } catch (error: any) {
      try { await OfflineStorageService.addNetworkErrorReport({ network_id: networkId, user_id: userId, failure_type: failureType, latitude: location.latitude, longitude: location.longitude, timestamp: Date.now(), message }); } catch {}
      return { error: error.message };
    }
  },

  getOwnerFailureSummary: async (
    ownerId: string
  ): Promise<{ items: { network: WiFiNetwork; lastFailureAt?: string; lastSuccessAt?: string; failures72hApart: boolean }[]; error: string | null }> => {
    try {
      const { data: networks, error: nErr } = await supabase
        .from('wifi_networks')
        .select('*')
        .eq('owner_id', ownerId)
        .eq('network_type', 'home');
      if (nErr) return { items: [], error: nErr.message };
      const items: any[] = [];
      for (const net of networks || []) {
        const { data: logs } = await supabase
          .from('network_access_logs')
          .select('*')
          .eq('network_id', net.id)
          .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('timestamp', { ascending: true });
        const fails = (logs || []).filter((l: any) => ['failed_auth', 'timeout', 'disconnected'].includes(l.access_type));
        const successes = (logs || []).filter((l: any) => l.access_type === 'successful');
        const lastFailure = fails.length ? fails[fails.length - 1] : null;
        const lastSuccess = successes.length ? successes[successes.length - 1] : null;
        let apart = false;
        if (fails.length >= 2) {
          for (let i = 1; i < fails.length; i++) {
            const prev = new Date(fails[i - 1].timestamp).getTime();
            const curr = new Date(fails[i].timestamp).getTime();
            if (curr - prev >= 72 * 60 * 60 * 1000) { apart = true; break; }
          }
        }
        items.push({ network: net, lastFailureAt: lastFailure?.timestamp, lastSuccessAt: lastSuccess?.timestamp, failures72hApart: apart });
      }
      return { items, error: null };
    } catch (error: any) {
      return { items: [], error: error.message };
    }
  },

  enforceSessionTimeout: async (connectionId: string, timeoutMinutes: number): Promise<{ error: string | null }> => {
    try {
      const timeoutMs = timeoutMinutes * 60 * 1000;

      setTimeout(async () => {
        const { data: connection, error: fetchError } = await supabase
          .from('wifi_connections')
          .select('*')
          .eq('id', connectionId)
          .maybeSingle();

        if (!fetchError && connection && connection.connection_status === 'active') {
          await ConnectionService.endConnection(
            connectionId,
            timeoutMs / 1000
          );
        }
      }, timeoutMs);

      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  connectNative: async (
    ssid: string,
    password: string
  ): Promise<{ success: boolean; error: string | null }> => {
    try {
      if (Platform.OS === 'web') {
        return { success: false, error: 'web' };
      }
      if (Platform.OS === 'android') {
        try {
          if ((Platform as any).Version >= 33) {
            await PermissionsAndroid.request('android.permission.NEARBY_WIFI_DEVICES' as any);
          }
          await PermissionsAndroid.request('android.permission.ACCESS_FINE_LOCATION' as any);
          await PermissionsAndroid.request('android.permission.ACCESS_COARSE_LOCATION' as any);
          await PermissionsAndroid.request('android.permission.ACCESS_WIFI_STATE' as any);
          await PermissionsAndroid.request('android.permission.CHANGE_WIFI_STATE' as any);
        } catch {}
      }
      let wifi: any = null;
      try {
        const mod: any = await import('react-native-wifi-reborn');
        wifi = mod?.default || mod;
      } catch {
        return { success: false, error: 'native_module_missing' };
      }
      if (!wifi || !wifi.connectToProtectedSSID) {
        return { success: false, error: 'native_module_missing' };
      }
      await wifi.connectToProtectedSSID(ssid, password, true);
      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  scanNearbySSIDs: async (): Promise<{ ssids: string[]; entries?: { ssid: string; bssid?: string }[]; error: string | null }> => {
    try {
      if (Platform.OS === 'web') {
        return { ssids: [], error: 'web' };
      }
      let wifi: any = null;
      try {
        const mod: any = await import('react-native-wifi-reborn');
        wifi = mod?.default || mod;
      } catch {
        return { ssids: [], error: 'native_module_missing' };
      }
      await GPSService.requestLocationPermission();
      let list: any = [];
      if (wifi?.loadWifiList) {
        const res = await wifi.loadWifiList();
        try {
          list = typeof res === 'string' ? JSON.parse(res) : res;
        } catch {
          list = Array.isArray(res) ? res : [];
        }
      }
      const entries = (list || []).map((n: any) => ({ ssid: n.SSID || n.ssid, bssid: n.BSSID || n.bssid }))
        .filter((e: any) => e.ssid);
      const ssids = Array.from(new Set(entries.map((e: any) => e.ssid))) as string[];
      return { ssids, entries, error: null };
    } catch (error: any) {
      return { ssids: [], entries: [], error: error.message };
    }
  },
 
  getWifiStatus: async (): Promise<WifiDiagnostics> => {
    try {
      if (Platform.OS === 'web') {
        return { connected: false, error: 'web' };
      }
      let wifi: any = null;
      try {
        const mod: any = await import('react-native-wifi-reborn');
        wifi = mod?.default || mod;
      } catch {
        return { connected: false, error: 'native_module_missing' };
      }
      let isWifiEnabled: boolean | undefined = undefined;
      let ssid: string | null = null;
      let ip: string | null = null;
      try {
        if (wifi?.isEnabled) {
          isWifiEnabled = await wifi.isEnabled();
        }
      } catch {}
      try {
        await GPSService.requestLocationPermission();
        if (wifi?.getCurrentWifiSSID) {
          ssid = await wifi.getCurrentWifiSSID();
        }
      } catch {}
      try {
        if (wifi?.getIP) {
          ip = await wifi.getIP();
        }
      } catch {}
      return {
        isWifiEnabled,
        ssid: ssid || null,
        ip: ip || null,
        connected: Boolean(ssid),
        error: null,
      };
    } catch (error: any) {
      return { connected: false, error: error.message };
    }
  },

  testInternetReachability: async (timeoutMs: number = 5000): Promise<InternetTestResult> => {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      const start = Date.now();
      const resp = await fetch('https://www.google.com/generate_204', {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(id);
      if (resp && resp.status === 204) {
        const latency = Date.now() - start;
        return { reachable: true, latencyMs: latency, error: null };
      }
      return { reachable: false, latencyMs: null, error: String(resp?.status || 'unknown') };
    } catch (error: any) {
      return { reachable: false, latencyMs: null, error: error?.name === 'AbortError' ? 'timeout' : error.message };
    }
  },
};
