import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform, Linking } from 'react-native';
import { Colors } from '../theme/colors';
import { WiFiNetwork } from '../types';
import { ConnectionService } from '../services/connectionService';
import { WiFiService } from '../services/wifiService';
import { GPSService } from '../utils/gps';
import { useAuthStore } from '../contexts/useAuthStore';

interface NetworkDetailScreenProps {
  network: WiFiNetwork | null;
  onClose: () => void;
  onConnectionStart?: () => void;
}

export const NetworkDetailScreen: React.FC<NetworkDetailScreenProps> = ({
  network,
  onClose,
  onConnectionStart,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionTime, setConnectionTime] = useState<number | null>(null);
  const { user, device } = useAuthStore();

  if (!network) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.emptyText}>No network selected</Text>
      </View>
    );
  }

  const handleConnect = async () => {
    setIsConnecting(true);

    const isGuest = !user || !device;
    let location: any = null;
    if (!isGuest) {
      location = await GPSService.getCurrentLocation();
      if (!location) {
        Alert.alert('Error', 'Unable to get current location');
        setIsConnecting(false);
        return;
      }
    }

    if (!isGuest) {
      const { canConnect, activeCount, maxUsers } = await ConnectionService.checkConnectionLimit(
        network.id
      );
      if (!canConnect) {
        Alert.alert(
          'Connection Limit Reached',
          `This network has ${activeCount}/${maxUsers} active users. Please try again later.`
        );
        setIsConnecting(false);
        return;
      }
    }

    if (Platform.OS === 'android') {
      const decrypted = WiFiService.getDecryptedPassword(network.password_encrypted);
      const native = await ConnectionService.connectNative(network.ssid, decrypted);
      if (!native.success) {
        if (!isGuest && location) {
          await ConnectionService.logAccessEvent(
            network.id,
            user!.id,
            'failed_auth',
            location,
            native.error || 'native_connect_failed'
          );
        }
        Alert.alert('Error', native.error || 'No se pudo conectar');
        setIsConnecting(false);
        return;
      }
    } else if (Platform.OS === 'ios') {
      Alert.alert('iOS', 'Cambia manualmente a la red en Ajustes antes de continuar');
    }

    if (!isGuest) {
      const { connection, error } = await ConnectionService.startConnection(
        user!.id,
        network.id,
        device!.id,
        location
      );
      if (error) {
        Alert.alert('Connection Error', error);
        setIsConnecting(false);
        return;
      }

      const timeout = network.session_timeout_minutes || 10;
      await ConnectionService.enforceSessionTimeout(connection!.id, timeout);
      setConnectionTime(timeout * 60);
      setIsConnecting(false);
      Alert.alert('Success', `Connected to ${network.ssid} for ${timeout} minutes`);
      onConnectionStart?.();
      const countdownInterval = setInterval(() => {
        setConnectionTime((prev) => {
          if (prev && prev <= 1) {
            clearInterval(countdownInterval);
            return null;
          }
          return prev ? prev - 1 : null;
        });
      }, 1000);
    } else {
      setIsConnecting(false);
      Alert.alert('Success', `Conectado a ${network.ssid}`);
    }
  };

  

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.appHeader}>
        <Text style={styles.brandText}>WiFi Emergencia</Text>
      </View>
      <TouchableOpacity onPress={onClose} style={styles.closeButton}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.ssid}>{network.ssid}</Text>
          <Text style={styles.networkType}>{network.network_type.toUpperCase()}</Text>
        </View>
        {user && network.owner_id === user.id && (
          <View style={{ marginTop: 8, flexDirection: 'row' }}>
            <TouchableOpacity
              style={{ borderWidth: 1, borderColor: '#2e7d32', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4 }}
              onPress={() => {
                try {
                  const codeTag = (network.tags || []).find((t) => typeof t === 'string' && String(t).startsWith('register_code:')) as string | undefined;
                  const code = codeTag ? String(codeTag).split(':')[1] : '';
                  if (code) {
                    Alert.alert('Código de invitación', code);
                  } else {
                    Alert.alert('Sin código', 'Aún no hay un código guardado para esta red');
                  }
                } catch {}
              }}
            >
              <Text style={{ color: '#2e7d32', fontWeight: '600' }}>Ver código</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Signal</Text>
            <Text style={styles.statValue}>{network.signal_strength}%</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Users</Text>
            <Text style={styles.statValue}>
              {network.current_users}/{network.max_concurrent_users}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Band</Text>
            <Text style={styles.statValue}>{network.frequency_band}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Protocol:</Text>
            <Text style={styles.infoValue}>{network.security_protocol}</Text>
          </View>
        </View>

        

        {network.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{network.description}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Latitude:</Text>
            <Text style={styles.infoValue}>{network.latitude.toFixed(6)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Longitude:</Text>
            <Text style={styles.infoValue}>{network.longitude.toFixed(6)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.connectButton, (isConnecting || connectionTime !== null || Platform.OS === 'web') && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={isConnecting || connectionTime !== null || Platform.OS === 'web'}
        >
          {isConnecting ? (
            <ActivityIndicator color="#fff" />
          ) : connectionTime !== null ? (
            <Text style={styles.connectButtonText}>Session: {formatTime(connectionTime)}</Text>
          ) : Platform.OS === 'web' ? (
            <Text style={styles.connectButtonText}>Only Mobile</Text>
          ) : (
            <Text style={styles.connectButtonText}>Connect Now</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.portalButton}
          onPress={() => Linking.openURL('http://neverssl.com')}
        >
          <Text style={styles.portalButtonText}>Abrir portal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => (Platform.OS === 'android' ? (Linking as any).sendIntent?.('android.settings.WIFI_SETTINGS') : Linking.openURL('App-Prefs:root=WIFI'))}
        >
          <Text style={styles.settingsButtonText}>Abrir Ajustes Wi‑Fi</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 20,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 20,
    marginTop: 40,
  },
  ssid: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  networkType: {
    fontSize: 14,
    color: '#666',
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 12,
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary,
    marginTop: 4,
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
  },
  infoValue: {
    fontSize: 13,
    color: '#000',
    fontWeight: '500',
  },
  passwordContainer: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 6,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  passwordText: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    marginRight: 8,
  },
  togglePasswordText: {
    fontSize: 12,
    color: Colors.primaryDark,
    marginHorizontal: 8,
  },
  copyText: {
    fontSize: 12,
    color: Colors.primaryDark,
  },
  descriptionText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  connectButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 20,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  portalButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  portalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  settingsButton: {
    backgroundColor: '#FF9800',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  settingsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 100,
  },
  appHeader: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
});
