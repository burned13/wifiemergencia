import { supabase } from '../config/supabase';
import { UserDevice } from '../types';
import { EncryptionService } from '../utils/encryption';
import * as Device from 'expo-device';

export const DeviceService = {
  registerDevice: async (userId: string, customName?: string): Promise<{ device: UserDevice | null; error: string | null }> => {
    try {
      const deviceUnique = `${Device.osName || 'unknown'}-${Device.modelName || 'unknown'}-${Device.osVersion || ''}`;
      const deviceIdHash = EncryptionService.hashDeviceId(deviceUnique);

      const { data, error } = await supabase
        .from('user_devices')
        .insert([
          {
            user_id: userId,
            device_name: customName || Device.modelName || 'Mobile Device',
            device_type: Device.osName === 'iOS' ? 'iOS' : 'Android',
            device_id_hash: deviceIdHash,
            os_version: Device.osVersion,
            app_version: '1.0.0',
            is_active: true,
          },
        ])
        .select()
        .maybeSingle();

      return { device: data || null, error: error?.message || null };
    } catch (error: any) {
      return { device: null, error: error.message };
    }
  },

  getDevices: async (userId: string): Promise<{ devices: UserDevice[]; error: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('user_devices')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('last_used', { ascending: false });

      return { devices: data || [], error: error?.message || null };
    } catch (error: any) {
      return { devices: [], error: error.message };
    }
  },

  updateDeviceLastUsed: async (deviceId: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase
        .from('user_devices')
        .update({
          last_used: new Date().toISOString(),
        })
        .eq('id', deviceId);

      return { error: error?.message || null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  deactivateDevice: async (deviceId: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase
        .from('user_devices')
        .update({ is_active: false })
        .eq('id', deviceId);

      return { error: error?.message || null };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  getCurrentDeviceId: async (): Promise<string | null> => {
    try {
      const deviceUnique = `${Device.osName || 'unknown'}-${Device.modelName || 'unknown'}-${Device.osVersion || ''}`;
      return deviceUnique;
    } catch (error) {
      console.error('Error getting device ID:', error);
      return null;
    }
  },

  getDeviceInfo: async (): Promise<{
    deviceId: string | null;
    modelName: string | null;
    osName: string | null;
    osVersion: string | null;
  }> => {
    return {
      deviceId: null,
      modelName: Device.modelName || null,
      osName: Device.osName || null,
      osVersion: Device.osVersion || null,
    };
  },
};