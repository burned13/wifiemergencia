import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useAuthStore } from '../contexts/useAuthStore';
import { useWifiStore } from '../contexts/useWifiStore';
import { ConnectionService } from '../services/connectionService';
import { WiFiService } from '../services/wifiService';
import { OfflineStorageService } from '../utils/offlineStorage';
import { GPSService } from '../utils/gps';
import { Colors } from '../theme/colors';
import { SUPABASE_CONFIGURED } from '../config/supabase';

interface ProfileScreenProps {
  onClose: () => void;
  onNavigatePayments?: () => void;
  onNavigateRegister?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onClose, onNavigatePayments, onNavigateRegister }) => {
  const { user, updateProfile, isLoading, getCurrentUser } = useAuthStore() as any;
  const { myNetworks, updateNetwork, deleteNetwork, getMyNetworks } = useWifiStore() as any;
  const [username, setUsername] = useState(user?.username || 'Invitado');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
  const [email, setEmail] = useState(user?.email || 'Invitado');
  

  

  

  useEffect(() => {
    (async () => {
      try {
        await getCurrentUser?.();
        const u = useAuthStore.getState().user;
        if (!u) { setEmail('Invitado'); setUsername('Invitado'); setPhoneNumber(''); return; }
        setEmail(u.email || '');
        setUsername(u.username || '');
        setPhoneNumber(u.phone_number || '');
        try { await getMyNetworks?.(u.id); } catch {}
        
        try {
          const summary = await ConnectionService.getOwnerFailureSummary(u.id);
          if (!summary.error) {
            for (const item of summary.items) {
              const lastFail = item.lastFailureAt ? new Date(item.lastFailureAt).getTime() : 0;
              const lastSucc = item.lastSuccessAt ? new Date(item.lastSuccessAt).getTime() : 0;
              const now = Date.now();
              if (item.failures72hApart) {
                const flag = await OfflineStorageService.getOwnerNotifyFlag(item.network.id);
                if (!flag) {
                  await OfflineStorageService.setOwnerNotifyFlag(item.network.id, Date.now());
                  Alert.alert(
                    'Aviso de falla',
                    'Tu red doméstica reportó fallas recurrentes en las últimas 72 horas. Tenés 30 días para regularizar la situación o se suspenderá tu suscripción.'
                  );
                }
              }
              if (lastFail && (!lastSucc || lastSucc < lastFail)) {
                const diff = now - lastFail;
                if (diff >= 30 * 24 * 60 * 60 * 1000 && u.is_active) {
                  await updateProfile({ is_active: false });
                  Alert.alert('Cuenta suspendida', 'Se suspendió tu suscripción por fallas de red. Podés reactivarla probando la conexión.');
                }
              }
              if (lastFail && lastSucc && lastSucc > lastFail) {
                Alert.alert('Red recuperada', 'Tu red doméstica volvió a conectarse. El problema se considera resuelto.');
              }
            }
          }
        } catch {}
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  

  useEffect(() => {
    if (user) {
      setEmail(user.email || 'Invitado');
      setUsername(user.username || 'Invitado');
      setPhoneNumber(user.phone_number || '');
    } else {
      setEmail('Invitado');
      setUsername('Invitado');
      setPhoneNumber('');
    }
  }, [user]);

  const handleUpdateProfile = async () => {
    if (!user) return;

    if (!username.trim()) {
      Alert.alert('Error', 'El usuario es requerido');
      return;
    }

    await updateProfile({
      username: username.trim(),
      phone_number: phoneNumber.trim() || undefined,
    });

    Alert.alert('Éxito', 'Perfil actualizado correctamente');
  };

  

  

  const handleManualUpdate = async () => {
    try {
      const status = await ConnectionService.getWifiStatus();
      const myList = (myNetworks || []).map((n: any) => n.ssid);
      const isOwn = status.connected && status.ssid ? myList.includes(String(status.ssid)) : false;
      const proceed = async () => {
        const loc = (await GPSService.getCurrentLocation()) || (await GPSService.getApproximateLocationByIP());
        if (!loc) {
          Alert.alert('Error', 'No se pudo obtener ubicación');
          return;
        }
        const { networks } = await WiFiService.getNearbyNetworks(loc.latitude, loc.longitude, 3);
        if (networks && networks.length) {
          await OfflineStorageService.saveWiFiData(networks, loc);
          Alert.alert('Actualizado', 'Datos de redes cercanas actualizados');
        } else {
          Alert.alert('Sin datos', 'No se encontraron redes para actualizar');
        }
      };
      if (!isOwn) {
        Alert.alert(
          'Red no propia',
          'Estás conectado a una red que no es tuya. ¿Actualizar de todos modos?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Actualizar', onPress: proceed },
          ]
        );
        return;
      }
      await proceed();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo actualizar');
    }
  };

  

  return (
    <View style={styles.container}>
      <View style={styles.appHeader}>
        <Text style={styles.brandText}>WiFi Emergencia</Text>
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Configuración de perfil</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Información de la cuenta</Text>

          <View style={styles.section}>
            <Text style={styles.label}>Usuario</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              editable={!isLoading}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={email}
              editable={false}
            />
            <Text style={styles.hint}>El email no puede ser modificado</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Teléfono (opcional)</Text>
            <TextInput
              style={styles.input}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              editable={!isLoading}
              keyboardType="phone-pad"
            />
          </View>

          <TouchableOpacity
            style={[styles.updateButton, isLoading && styles.buttonDisabled]}
            onPress={handleUpdateProfile}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.updateButtonText}>Actualizar perfil</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Estado de cuenta</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Descargas disponibles:</Text>
            <Text style={styles.statValue}>{user?.downloads_remaining || 0}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Descargas totales:</Text>
            <Text style={styles.statValue}>{user?.total_downloads || 0}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Estado:</Text>
            <Text style={styles.statValueActive}>
              {user?.is_active ? 'Activo' : 'Inactivo'}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Miembro desde:</Text>
            <Text style={styles.statValue}>
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Actualizaciones</Text>
          <Text style={styles.hint}>La actualización automática ocurre solo en tu red propia.</Text>
          <TouchableOpacity style={styles.updateButton} onPress={handleManualUpdate}>
            <Text style={styles.updateButtonText}>Actualizar ahora</Text>
          </TouchableOpacity>
        </View>

        

        <TouchableOpacity style={[styles.updateButton, { marginBottom: 16 }]} onPress={onClose}>
          <Text style={styles.updateButtonText}>Volver al mapa</Text>
        </TouchableOpacity>
        <View style={styles.footer}>
          <Text style={styles.footerText}>WiFi Emergencia v1.0.0</Text>
          <Text style={styles.footerText}>© 2024 All rights reserved</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  appHeader: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 18,
    color: Colors.textSecondary,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.surface,
    marginBottom: 2,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: Colors.surface,
  },
  inputDisabled: {
    backgroundColor: Colors.background,
    color: Colors.muted,
  },
  hint: {
    fontSize: 12,
    color: Colors.muted,
    marginTop: 4,
  },
  updateButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  updateButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  statValueActive: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  deviceDetails: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  deviceLastUsed: {
    fontSize: 11,
    color: Colors.muted,
    marginTop: 2,
  },
  removeDeviceButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: Colors.surface,
  },
  removeDeviceText: {
    color: Colors.accentRed,
    fontSize: 12,
    fontWeight: '600',
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: Colors.muted,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  transactionAmountSuccess: {
    color: Colors.primary,
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.muted,
    fontSize: 13,
    paddingVertical: 12,
  },
  signOutButton: {
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.accentRed,
    marginBottom: 20,
  },
  signOutButtonText: {
    color: Colors.accentRed,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 12,
    color: Colors.muted,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceGreen,
  },
  chipText: {
    fontSize: 12,
    color: Colors.textPrimary,
  },
});
